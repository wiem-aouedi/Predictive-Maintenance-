import asyncio
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from app.host.llm_host import call_tool_direct

router = APIRouter()

AT_RISK_STATUSES = ["critical", "warning"]


def _extract_machine_list(result) -> list[dict]:
    if isinstance(result, list):
        return result
    if isinstance(result, dict):
        for key in ("machines", "result", "data"):
            value = result.get(key)
            if isinstance(value, list):
                return value
    return []


async def _attach_prediction(machine: dict) -> dict:
    machine_id = machine.get("id") or machine.get("machine_id")
    if machine_id is None:
        machine["failure_probability_percent"] = None
        return machine
    try:
        now_iso = datetime.now(timezone.utc).isoformat()
        result = await call_tool_direct(
            "predict_failure_next_168h",
            {"machine_id": machine_id, "as_of_timestamp": now_iso},
        )
        machine["failure_probability_percent"] = result.get("failure_probability_percent")
    except Exception:
        machine["failure_probability_percent"] = None
    return machine


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
    At-risk machines (warning/critical) are ranked by the model's own
    failure_probability_percent, not just status label - two "critical"
    machines can carry very different real risk. Failed machines are NOT
    re-scored; predicting future failure for an already-failed machine
    isn't meaningful, so the repair backlog stays fast regardless of size.
    """
    try:
        at_risk: list[dict] = []
        for status in AT_RISK_STATUSES:
            result = await call_tool_direct("list_machines_by_status", {"status": status})
            for machine in _extract_machine_list(result):
                machine.setdefault("status", status)
                at_risk.append(machine)

        if at_risk:
            at_risk = list(await asyncio.gather(*(_attach_prediction(m) for m in at_risk)))

        failed_result = await call_tool_direct("list_machines_by_status", {"status": "failed"})
        failed = _extract_machine_list(failed_result)
        for machine in failed:
            machine.setdefault("status", "failed")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    def sort_key(m):
        prob = m.get("failure_probability_percent")
        if isinstance(prob, (int, float)):
            return (0, -prob)
        return (1, 0)

    at_risk.sort(key=sort_key)

    return {"watchlist": at_risk, "failed": failed}