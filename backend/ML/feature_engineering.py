"""
Feature Engineering Module

This module reproduces the feature engineering pipeline used during
model training for predictive maintenance.

Input:
    - Historical sensor readings for ONE machine
    - Machine installation date

Output:
    - DataFrame containing all engineered features expected by the model.
"""

from __future__ import annotations

from datetime import datetime

import numpy as np
import pandas as pd


# ============================================================================
# Constants
# ============================================================================

SENSOR_COLUMNS = [
    "temperature",
    "rotational_speed",
    "vibration",
    "pressure",
    "current",
]

LAG_WINDOWS = [1, 6, 12, 24]

ROLLING_WINDOW = 24


# ============================================================================
# Validation
# ============================================================================

def validate_input(df: pd.DataFrame) -> None:
    """
    Validate the input dataframe.
    """

    required_columns = {
        "machine_id",
        "timestamp",
        *SENSOR_COLUMNS,
    }

    missing = required_columns.difference(df.columns)

    if missing:
        raise ValueError(
            f"Missing required columns: {sorted(missing)}"
        )


# ============================================================================
# Preparation
# ============================================================================

def prepare_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    """
    Sort data chronologically.
    """

    validate_input(df)

    df = df.copy()

    df["timestamp"] = pd.to_datetime(df["timestamp"])

    df = (
        df
        .sort_values("timestamp")
        .reset_index(drop=True)
    )

    return df


# ============================================================================
# Lag Features
# ============================================================================

def add_lag_features(df: pd.DataFrame) -> pd.DataFrame:

    for feature in SENSOR_COLUMNS:

        for lag in LAG_WINDOWS:

            df[f"{feature}_lag_{lag}"] = df[feature].shift(lag)

    return df


# ============================================================================
# Rolling Statistics
# ============================================================================

def add_rolling_features(df: pd.DataFrame) -> pd.DataFrame:

    for feature in SENSOR_COLUMNS:

        rolling = df[feature].rolling(window=ROLLING_WINDOW)

        df[f"{feature}_roll_mean_24"] = rolling.mean()

        df[f"{feature}_roll_std_24"] = rolling.std()

        df[f"{feature}_roll_min_24"] = rolling.min()

        df[f"{feature}_roll_max_24"] = rolling.max()

    return df


# ============================================================================
# Difference Features
# ============================================================================

def add_difference_features(df: pd.DataFrame) -> pd.DataFrame:

    for feature in SENSOR_COLUMNS:

        df[f"{feature}_diff"] = df[feature].diff()

    return df


# ============================================================================
# Percentage Change Features
# ============================================================================

def add_pct_change_features(df: pd.DataFrame) -> pd.DataFrame:

    for feature in SENSOR_COLUMNS:

        pct = df[feature].pct_change()

        pct = pct.replace([np.inf, -np.inf], np.nan)

        df[f"{feature}_pct_change"] = pct

    return df


# ============================================================================
# Interaction Features
# ============================================================================

def add_interaction_features(df: pd.DataFrame) -> pd.DataFrame:

    df["temperature_x_vibration"] = (
        df["temperature"] *
        df["vibration"]
    )

    df["current_x_vibration"] = (
        df["current"] *
        df["vibration"]
    )

    df["pressure_div_current"] = (
        df["pressure"] /
        df["current"]
    )

    df["temperature_div_speed"] = (
        df["temperature"] /
        df["rotational_speed"]
    )

    df.replace(
        [np.inf, -np.inf],
        np.nan,
        inplace=True
    )

    return df


# ============================================================================
# Machine Age
# ============================================================================

def add_machine_age(
    df: pd.DataFrame,
    installation_date: datetime
) -> pd.DataFrame:

    installation_date = pd.to_datetime(installation_date)

    timestamps = df["timestamp"]

    # Normalize both sides to tz-naive so subtraction is always safe,
    # regardless of whether either source carries timezone info.
    if timestamps.dt.tz is not None:
        timestamps = timestamps.dt.tz_localize(None)

    if installation_date.tzinfo is not None:
        installation_date = installation_date.tz_localize(None)

    df["machine_age_hours"] = (
        timestamps -
        installation_date
    ).dt.total_seconds() / 3600

    return df


# ============================================================================
# Cleanup
# ============================================================================

def clean_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Remove warm-up rows and reset the index.
    """

    df = (
        df
        .replace([np.inf, -np.inf], np.nan)
        .dropna()
        .reset_index(drop=True)
    )

    return df


# ============================================================================
# Main Pipeline
# ============================================================================

def build_features(
    sensor_history: pd.DataFrame,
    installation_date: datetime,
) -> pd.DataFrame:
    """
    Build all engineered features required by the prediction model.

    Parameters
    ----------
    sensor_history : pd.DataFrame
        Complete chronological sensor history of one machine.

    installation_date : datetime
        Installation date of the machine.

    Returns
    -------
    pd.DataFrame
        DataFrame containing all engineered features.
    """

    df = prepare_dataframe(sensor_history)

    df = add_lag_features(df)

    df = add_rolling_features(df)

    df = add_difference_features(df)

    df = add_pct_change_features(df)

    df = add_interaction_features(df)

    df = add_machine_age(
        df,
        installation_date
    )

    df = clean_features(df)

    return df