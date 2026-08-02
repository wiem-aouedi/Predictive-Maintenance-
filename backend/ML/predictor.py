"""
Prediction Module

Uses the trained XGBoost model to predict whether a machine is likely
to fail within the next 168 hours.
"""

from __future__ import annotations

from datetime import datetime
import pandas as pd

from .feature_engineering import build_features
from .model_loader import FailurePredictionModel


# ============================================================================
# Singleton Model Instance
# ============================================================================

_model = None


def get_model() -> FailurePredictionModel:
    """
    Load the prediction model once.
    """

    global _model

    if _model is None:
        _model = FailurePredictionModel()

    return _model


# ============================================================================
# Prediction
# ============================================================================

def predict_from_sensor_history(
    sensor_history: pd.DataFrame,
    installation_date: datetime,
) -> dict:
    """
    Predict machine failure from historical sensor readings.

    Parameters
    ----------
    sensor_history : pd.DataFrame
        Complete chronological history for ONE machine.

    installation_date : datetime
        Machine installation date.

    Returns
    -------
    dict
        Prediction result.
    """

    if sensor_history.empty:
        raise ValueError(
            "Sensor history is empty."
        )

    model = get_model()

    featured = build_features(
        sensor_history=sensor_history,
        installation_date=installation_date,
    )

    if featured.empty:
        raise ValueError(
            "Not enough historical data to compute features "
            "(at least 24 hourly readings are required)."
        )

    latest = featured.iloc[[-1]]

    missing_features = [
        feature
        for feature in model.features
        if feature not in latest.columns
    ]

    if missing_features:
        raise ValueError(
            f"Missing model features: {missing_features}"
        )

    X = latest[model.features]

    probability = float(
        model.predict_probability(X)[0]
    )

    prediction = bool(
        probability >= model.threshold
    )

    return {

        "machine_id": int(
            latest["machine_id"].iloc[0]
        ),

        "as_of_timestamp": str(
            latest["timestamp"].iloc[0]
        ),

        "predicted_failure_next_168h": prediction,

        "failure_probability_percent": round(probability * 100,2,),

        "threshold": round(
            float(model.threshold),
            4,
        ),

        "target": model.target,

        "model_name": model.model_name,

        "model_version": model.model_version,
    }