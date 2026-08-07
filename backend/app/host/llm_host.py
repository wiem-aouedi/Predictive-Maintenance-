import asyncio
import json
import os
from contextlib import AsyncExitStack
from dotenv import load_dotenv
from openai import AsyncOpenAI
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from app.host.prompts import SYSTEM_PROMPT
from pathlib import Path
BACKEND_DIR = Path(__file__).resolve().parents[2]  # adjust if llm_host.py isn't 2 levels under backend\

load_dotenv()

GEMINI_MODEL = "gemini-3.6-flash"
MAX_TOOL_ITERATIONS = 4
MAX_CONTEXT_TURNS = 10
MAX_TOOL_RESULT_CHARS = 4000

SERVER_PARAMS = StdioServerParameters(
    command="python",
    args=["-m", "mcp_server.server"],
    env=os.environ.copy(),
    cwd=str(BACKEND_DIR),
)

# ---------------------------------------------------------------------------
# Persistent MCP session -- started once at app startup, reused for every
# /chat request. Spawning a fresh subprocess per turn (re-importing pandas/
# xgboost/supabase-py and redoing the MCP handshake every message) was the
# single largest source of latency; this removes that cost entirely after
# the first request.
# ---------------------------------------------------------------------------

_exit_stack: AsyncExitStack | None = None
_session: ClientSession | None = None
_tools_cache = None
_session_lock = asyncio.Lock()


async def startup_mcp_session():
    global _exit_stack, _session, _tools_cache
    _exit_stack = AsyncExitStack()

    errlog = open(BACKEND_DIR / "mcp_subprocess_error.log", "w")
    read, write = await _exit_stack.enter_async_context(
        stdio_client(SERVER_PARAMS, errlog=errlog)
    )
    _session = await _exit_stack.enter_async_context(ClientSession(read, write))
    await _session.initialize()
    _tools_cache = mcp_tools_to_openai_format((await _session.list_tools()).tools)


async def shutdown_mcp_session():
    """Call this once from FastAPI's shutdown event / lifespan."""
    global _exit_stack
    if _exit_stack is not None:
        await _exit_stack.aclose()
        _exit_stack = None


async def get_session_and_tools():
    """Reconnects automatically if the persistent session ever dies
    (e.g. the mcp_server subprocess crashed) instead of failing forever."""
    global _session, _tools_cache
    async with _session_lock:
        if _session is None:
            await startup_mcp_session()
    return _session, _tools_cache


def mcp_tools_to_openai_format(mcp_tools):
    return [
        {
            "type": "function",
            "function": {
                "name": t.name,
                "description": t.description or "",
                "parameters": t.inputSchema,
            },
        }
        for t in mcp_tools
    ]


def extract_tool_result_text(result) -> str:
    if result.structuredContent and "result" in result.structuredContent:
        return json.dumps(result.structuredContent["result"])
    text_parts = [block.text for block in result.content if hasattr(block, "text")]
    return "\n".join(text_parts)


def truncate_for_context(text: str, max_chars: int = MAX_TOOL_RESULT_CHARS) -> str:
    if len(text) <= max_chars:
        return text
    omitted = len(text) - max_chars
    return text[:max_chars] + f"... [truncated, {omitted} more characters omitted]"


def build_context_window(full_history: list, max_turns: int = MAX_CONTEXT_TURNS) -> list:
    turn_start_indices = [i for i, m in enumerate(full_history) if m.get("role") == "user"]
    if len(turn_start_indices) <= max_turns:
        return list(full_history)
    cutoff = turn_start_indices[-max_turns]
    return list(full_history[cutoff:])


def get_client() -> AsyncOpenAI:
    return AsyncOpenAI(
        api_key=os.environ["GEMINI_API_KEY"],
        base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
    )


async def run_host_turn(full_history: list, trace: list = None) -> tuple[str, list]:
    if trace is None:
        trace = []

    working = build_context_window(full_history)
    working.insert(0, {"role": "system", "content": SYSTEM_PROMPT})

    new_messages = []
    client = get_client()
    session, tools = await get_session_and_tools()

    for _ in range(MAX_TOOL_ITERATIONS):
        response = await client.chat.completions.create(
            model=GEMINI_MODEL,
            messages=working,
            tools=tools,
            tool_choice="auto",
        )
        choice = response.choices[0].message

        if not choice.tool_calls:
            msg = {"role": "assistant", "content": choice.content}
            new_messages.append(msg)
            return choice.content, new_messages

        assistant_msg = {
            "role": "assistant",
            "content": choice.content,
            "tool_calls": [tc.model_dump() for tc in choice.tool_calls],
        }
        working.append(assistant_msg)
        new_messages.append(assistant_msg)

        # Run all tool calls from this response concurrently instead of
        # one-by-one -- Gemini often returns several tool_calls in a single
        # response (e.g. get_machine_specifications + predict_failure_next_168h
        # both requested at once), and there's no dependency between them
        # within the same response, so awaiting them sequentially wastes time.
        async def _run_one(tc):
            tool_input = json.loads(tc.function.arguments)
            result = await session.call_tool(tc.function.name, tool_input)
            return tc, tool_input, extract_tool_result_text(result)

        results = await asyncio.gather(*[_run_one(tc) for tc in choice.tool_calls])

        for tc, tool_input, result_text in results:
            trace.append({
                "tool": tc.function.name,
                "input": tool_input,
                "output": result_text,
            })
            tool_msg = {
                "role": "tool",
                "tool_call_id": tc.id,
                "content": truncate_for_context(result_text),
            }
            working.append(tool_msg)
            new_messages.append(tool_msg)

    fallback = "I wasn't able to reach a final answer within the tool-call limit for this turn. Could you narrow the question — for example, ask about a specific machine rather than the whole fleet at once?"
    new_messages.append({"role": "assistant", "content": fallback})
    return fallback, new_messages


async def call_tool_direct(tool_name: str, arguments: dict = None) -> dict:
    session, _ = await get_session_and_tools()
    result = await session.call_tool(tool_name, arguments or {})
    text = extract_tool_result_text(result)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return {"raw": text}