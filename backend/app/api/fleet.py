from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from app.host.llm_host import call_tool_direct

router = APIRouter()

WATCHLIST_STATUSES = ["critical", "warning"]
SEVERITY_ORDER = {"critical": 0, "warning": 1}


def _extract_machine_list(result) -> list[dict]:
    """
    Normalizes an MCP tool result into a list of machine dicts, regardless
    of whether the tool returned a bare list or a dict wrapping one.
    """
    if isinstance(result, list):
        return result
    if isinstance(result, dict):
        for key in ("machines", "result", "data"):
            value = result.get(key)
            if isinstance(value, list):
                return value
    return []


@router.get("/fleet/health")
async def fleet_health():
    try:
        now_iso = datetime.now(timezone.utc).isoformat()
        result = await call_tool_direct("get_fleet_health_summary", {"as_of_timestamp": now_iso})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return result


@router.get("/fleet/watchlist")
async def fleet_watchlist():
    """
    Returns machines needing attention: warning/critical (the watchlist)
    and failed (needs repair) as separate lists, sorted by severity.
    """
    try:
        watchlist: list[dict] = []
        for status in WATCHLIST_STATUSES:
            result = await call_tool_direct("list_machines_by_status", {"status": status})
            for machine in _extract_machine_list(result):
                machine.setdefault("status", status)
                watchlist.append(machine)

        failed_result = await call_tool_direct("list_machines_by_status", {"status": "failed"})
        failed = _extract_machine_list(failed_result)
        for machine in failed:
            machine.setdefault("status", "failed")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    watchlist.sort(key=lambda m: SEVERITY_ORDER.get(m.get("status"), 2))

    return {"watchlist": watchlist, "failed": failed}