from pydantic import BaseModel, Field
from typing import Literal


# ==========================================================
# Prediction
# ==========================================================

class PredictionResponse(BaseModel):
    machine_id: int
    as_of_timestamp: str

    target: str

    model_version: str

    threshold: float

    failure_probability: float

    predicted_failure_next_168h: bool


# ==========================================================
# Trend Analysis
# ==========================================================

class SensorTrend(BaseModel):

    direction: Literal[
        "increasing",
        "decreasing",
        "stable"
    ]

    slope_per_reading: float

    current_value: float

    window_mean: float

    window_std: float


class TrendAnalysisResponse(BaseModel):

    temperature: SensorTrend | None = None

    rotational_speed: SensorTrend | None = None

    vibration: SensorTrend | None = None

    pressure: SensorTrend | None = None

    current: SensorTrend | None = None


# ==========================================================
# Fleet Summary
# ==========================================================

class FleetHealthSummary(BaseModel):

    total_machines: int

    active_machines: int

    not_installed: int

    healthy: int

    warning: int

    critical: int

    failed: int