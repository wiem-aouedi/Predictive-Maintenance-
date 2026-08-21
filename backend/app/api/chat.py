import uuid
import json
import openai
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from app.host.llm_host import run_host_turn
from app.db.conversations import create_conversation, get_conversation, update_conversation
from app.schemas.chat import ChatRequest, ChatResponse

router = APIRouter()


def _make_title(text: str) -> str:
    text = text.strip().replace("\n", " ")
    return text[:60] + ("…" if len(text) > 60 else "")


def _describe_exception(exc: BaseException) -> str:
    sub_exceptions = getattr(exc, "exceptions", None)
    if sub_exceptions:
        return " | ".join(_describe_exception(sub) for sub in sub_exceptions)
    return f"{type(exc).__name__}: {exc}"


def _walk_evidence(value, evidence: dict) -> None:
    if isinstance(value, dict):
        for key, item in value.items():
            if key == "machine_id" and isinstance(item, (int, str)):
                evidence["machine_ids"].add(str(item))
            elif key in {"as_of_timestamp", "timestamp"} and isinstance(item, str):
                evidence["timestamps"].add(item)
            elif key == "model_name" and item:
                evidence["model_name"] = str(item)
            elif key == "model_version" and item:
                evidence["model_version"] = str(item)
            elif key == "error" and item:
                evidence["errors"].add(str(item))
            _walk_evidence(item, evidence)
    elif isinstance(value, list):
        for item in value:
            _walk_evidence(item, evidence)


def _extract_charts(trace: list[dict]) -> list[dict]:
    """
    Pull chart specs out of tool outputs in the trace. Chart tools
    (plot_sensor_trend, plot_sensor_comparison, plot_status_breakdown,
    plot_sensor_distribution) are the only tools that return a dict with
    "kind": "chart_spec" -- that's the anchor this looks for, rather than
    tying this to a fixed tool name list that would need updating whenever
    a chart tool is added or renamed.
    """
    charts = []
    for step in trace:
        output = step.get("output")
        if isinstance(output, str):
            try:
                output = json.loads(output)
            except json.JSONDecodeError:
                continue
        if isinstance(output, dict) and output.get("kind") == "chart_spec":
            charts.append(output)
    return charts


def _build_provenance(trace: list[dict]) -> dict:
    evidence = {
        "machine_ids": set(),
        "timestamps": set(),
        "errors": set(),
        "model_name": None,
        "model_version": None,
    }

    for step in trace:
        _walk_evidence(step.get("input") or {}, evidence)
        output = step.get("output")
        if isinstance(output, str):
            try:
                output = json.loads(output)
            except json.JSONDecodeError:
                output = None
        if output is not None:
            _walk_evidence(output, evidence)

    timestamps = sorted(evidence["timestamps"], reverse=True)
    latest_timestamp = timestamps[0] if timestamps else None
    freshness = "unknown"
    if latest_timestamp:
        try:
            observed_at = datetime.fromisoformat(latest_timestamp.replace("Z", "+00:00"))
            if observed_at.tzinfo is None:
                observed_at = observed_at.replace(tzinfo=timezone.utc)
            age_seconds = (datetime.now(timezone.utc) - observed_at.astimezone(timezone.utc)).total_seconds()
            freshness = "future" if age_seconds < -300 else "stale" if age_seconds > 600 else "current"
        except ValueError:
            freshness = "unknown"

    return {
        "tools": list(dict.fromkeys(step.get("tool") for step in trace if step.get("tool"))),
        "machine_ids": sorted(evidence["machine_ids"]),
        "latest_data_timestamp": latest_timestamp,
        "freshness": freshness,
        "model_name": evidence["model_name"],
        "model_version": evidence["model_version"],
        "tool_errors": sorted(evidence["errors"]),
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


@router.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    if req.conversation_id:
        conversation = get_conversation(req.conversation_id)
        if conversation is None:
            raise HTTPException(status_code=404, detail="Conversation not found")
    else:
        conversation = create_conversation()

    full_messages = conversation["messages"] or []
    display = conversation["display"] or []

    full_messages.append({"role": "user", "content": req.message})
    display.append({"id": str(uuid.uuid4()), "role": "user", "content": req.message})

    trace = []
    try:
        answer, new_messages = await run_host_turn(full_messages, trace)
    except openai.APIStatusError as e:
        # Real status from Gemini (rate limits, oversized requests, etc.) -
        # preserve it instead of flattening everything to 500, so the
        # frontend can tell "try again in a minute" apart from "broken".
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=_describe_exception(e))

    # Only persist the final answer into history that future turns will
    # replay. new_messages may contain intermediate tool_call/tool-result
    # plumbing from this turn's reasoning -- that already did its job
    # producing `answer`; keeping it in full_messages forever means every
    # future turn re-sends it to Gemini, growing prompt size every turn.
    full_messages.append({"role": "assistant", "content": answer})

    display.append({
        "id": str(uuid.uuid4()),
        "role": "assistant",
        "content": answer,
        "trace": trace,
        "provenance": _build_provenance(trace),
        "charts": _extract_charts(trace),
    })

    title = conversation.get("title") or _make_title(req.message)
    update_conversation(conversation["id"], full_messages, display, title=title)

    return ChatResponse(
        conversation_id=conversation["id"],
        answer=answer,
        trace=trace,
        messages=full_messages,
        display=display,
    )
