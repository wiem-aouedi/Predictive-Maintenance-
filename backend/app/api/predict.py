from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from app.host.llm_host import call_tool_direct

router = APIRouter()


@router.get("/predict/{machine_id}")
async def predict_failure(machine_id: int):
    try:
        now_iso = datetime.now(timezone.utc).isoformat()
        result = await call_tool_direct(
            "predict_failure_next_168h",
            {"machine_id": machine_id, "as_of_timestamp": now_iso},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return result