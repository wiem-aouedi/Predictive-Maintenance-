from datetime import datetime, timezone
from database.supabase_client import supabase

TABLE = "conversations"


def create_conversation() -> dict:
    resp = supabase.table(TABLE).insert({"messages": [], "display": []}).execute()
    return resp.data[0]


def get_conversation(conversation_id: str) -> dict | None:
    try:
        resp = supabase.table(TABLE).select("*").eq("id", conversation_id).maybe_single().execute()
    except Exception:
        return None
    return resp.data


def update_conversation(conversation_id: str, messages: list, display: list, title: str | None = None) -> None:
    payload = {
        "messages": messages,
        "display": display,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if title is not None:
        payload["title"] = title
    supabase.table(TABLE).update(payload).eq("id", conversation_id).execute()


def delete_conversation(conversation_id: str) -> None:
    supabase.table(TABLE).delete().eq("id", conversation_id).execute()


def list_conversations(limit: int = 50) -> list[dict]:
    resp = (
        supabase.table(TABLE)
        .select("id, title, created_at, updated_at")
        .order("updated_at", desc=True)
        .limit(limit)
        .execute()
    )
    return resp.data