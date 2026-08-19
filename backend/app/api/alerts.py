import asyncio
from fastapi import APIRouter, HTTPException
from app.host.llm_host import call_tool_direct
from app.db.alerts import get_alert_states, record_alert, clear_alert
from app.services.emailer import send_alert_digest_email, is_email_configured

router = APIRouter()

ALERT_STATUSES = ["warning", "critical"]


def _extract_machine_list(result) -> list[dict]:
    if isinstance(result, list):
        return result
    if isinstance(result, dict):
        for key in ("machines", "result", "data"):
            value = result.get(key)
            if isinstance(value, list):
                return value
    return []


def _machine_label(machine: dict) -> str:
    machine_id = machine.get("id") or machine.get("machine_id")
    return machine.get("machine_name") or f"Machine-{str(machine_id).zfill(3)}"


@router.get("/alerts/status")
async def alerts_status():
    return {"email_configured": is_email_configured()}


async def run_alert_check() -> dict:
    """
    Detects machines that have newly entered (or escalated within) an alert
    status and sends a single recap email covering all of them for this
    check - a burst of simultaneous transitions produces one email, not one
    per machine. A later check with its own newly-alerting machines still
    sends its own separate email. Machines already alerted at their current
    status are skipped; recovered machines are cleared so a future
    degradation alerts again.

    Shared by the manual "Send alerts" endpoint and the automatic background
    watcher (app.services.alert_scheduler) - both just call this. Assumes
    the caller has already confirmed is_email_configured().
    """
    current: dict[int, dict] = {}
    for status in ALERT_STATUSES:
        result = await call_tool_direct("list_machines_by_status", {"status": status})
        for machine in _extract_machine_list(result):
            machine_id = machine.get("id") or machine.get("machine_id")
            if machine_id is None:
                continue
            machine.setdefault("status", status)
            current[machine_id] = machine

    already_alerted = get_alert_states()

    to_notify = []
    for machine_id, machine in current.items():
        status = machine.get("status")
        if already_alerted.get(machine_id) == status:
            continue
        to_notify.append(
            {"machine_id": machine_id, "machine_label": _machine_label(machine), "status": status}
        )

    sent, failed = [], []
    if to_notify:
        try:
            await asyncio.to_thread(send_alert_digest_email, to_notify)
            for m in to_notify:
                record_alert(m["machine_id"], m["status"])
            sent = [
                {"machine_id": m["machine_id"], "machine_name": m["machine_label"], "status": m["status"]}
                for m in to_notify
            ]
        except Exception as e:
            failed = [
                {"machine_id": m["machine_id"], "machine_name": m["machine_label"], "error": str(e)}
                for m in to_notify
            ]

    recovered = [mid for mid in already_alerted if mid not in current]
    for machine_id in recovered:
        clear_alert(machine_id)

    return {
        "sent": sent,
        "failed": failed,
        "recovered": recovered,
        "checked": len(current),
    }


@router.post("/alerts/check")
async def check_alerts():
    """Manual trigger for the Watchlist page's "Send alerts" button."""
    if not is_email_configured():
        raise HTTPException(
            status_code=400,
            detail="Email is not configured. Set SMTP_* and ALERT_RECIPIENT_EMAIL in backend/.env",
        )

    try:
        return await run_alert_check()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))