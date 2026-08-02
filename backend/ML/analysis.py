import numpy as np
import pandas as pd

SENSOR_COLUMNS = ["temperature", "rotational_speed", "vibration", "pressure", "current"]

def compute_sensor_trends(df: pd.DataFrame, window: int = 168) -> dict:
    """
    Rate-of-change per sensor over the most recent `window` readings,
    via linear fit against reading index (assumes df sorted oldest->newest).
    """
    recent = df.sort_values("timestamp").tail(window)
    x = np.arange(len(recent))
    trends = {}
    for col in SENSOR_COLUMNS:
        if col not in recent.columns or recent[col].isna().all():
            continue
        y = recent[col].values
        slope = float(np.polyfit(x, y, 1)[0]) if len(x) >= 2 else 0.0
        trends[col] = {
            "direction": "increasing" if slope > 1e-4 else "decreasing" if slope < -1e-4 else "stable",
            "slope_per_reading": round(slope, 5),
            "current_value": round(float(recent[col].iloc[-1]), 3),
            "window_mean": round(float(recent[col].mean()), 3),
            "window_std": round(float(recent[col].std()), 3),
        }
    return trends