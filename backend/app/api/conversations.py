from fastapi import APIRouter, HTTPException
from app.db.conversations import get_conversation, list_conversations
from app.schemas.chat import ConversationSummary, ConversationDetail

router = APIRouter()


@router.get("/conversations", response_model=list[ConversationSummary])
async def get_conversations():
    return list_conversations()


@router.get("/conversations/{conversation_id}", response_model=ConversationDetail)
async def get_conversation_detail(conversation_id: str):
    conversation = get_conversation(conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return ConversationDetail(
        id=conversation["id"],
        title=conversation.get("title"),
        messages=conversation.get("messages") or [],
        display=conversation.get("display") or [],
    )