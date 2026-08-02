from pydantic import BaseModel


class ChatRequest(BaseModel):
    conversation_id: str | None = None
    message: str


class ChatResponse(BaseModel):
    conversation_id: str
    answer: str
    trace: list[dict]
    messages: list[dict]
    display: list[dict]


class ConversationSummary(BaseModel):
    id: str
    title: str | None
    created_at: str
    updated_at: str


class ConversationDetail(BaseModel):
    id: str
    title: str | None
    messages: list[dict]
    display: list[dict]