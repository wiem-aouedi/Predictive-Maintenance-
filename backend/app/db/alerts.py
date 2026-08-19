from datetime import datetime, timezone
from database.supabase_client import supabase

TABLE = "alert_log"


def get_alert_states() -> dict[int, str]:
    resp = supabase.table(TABLE).select("machine_id, status").execute()
    return {row["machine_id"]: row["status"] for row in (resp.data or [])}


def record_alert(machine_id: int, status: str) -> None:
    supabase.table(TABLE).upsert(
        {
            "machine_id": machine_id,
            "status": status,
            "alerted_at": datetime.now(timezone.utc).isoformat(),
        }
    ).execute()


def clear_alert(machine_id: int) -> None:
    supabase.table(TABLE).delete().eq("machine_id", machine_id).execute()