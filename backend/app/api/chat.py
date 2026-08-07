import uuid
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