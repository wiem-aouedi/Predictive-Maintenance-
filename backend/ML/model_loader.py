"""
Model Loader

Loads the trained predictive maintenance model and its metadata.
"""

from pathlib import Path

import joblib
import pandas as pd
import xgboost as xgb


# ============================================================================
# Model Location
# ============================================================================

MODEL_DIR = Path(__file__).resolve().parent.parent / "models"

MODEL_FILENAME = "xgboost_168h_v1.json"
METADATA_FILENAME = "xgboost_168h_v1_metadata.joblib"

MODEL_PATH = MODEL_DIR / MODEL_FILENAME
METADATA_PATH = MODEL_DIR / METADATA_FILENAME

xgb.set_config(verbosity=0)


# ============================================================================
# Failure Prediction Model
# ============================================================================

class FailurePredictionModel:
    """
    Wrapper around the trained XGBoost predictive maintenance model.
    """

    def __init__(self):

        if not MODEL_PATH.exists():
            raise FileNotFoundError(
                f"Model file not found:\n{MODEL_PATH}"
            )

        if not METADATA_PATH.exists():
            raise FileNotFoundError(
                f"Metadata file not found:\n{METADATA_PATH}"
            )

        # Load the booster directly in XGBoost's native, version-stable format
        self.model = xgb.Booster()
        self.model.load_model(str(MODEL_PATH))

        # Load everything else
        metadata = joblib.load(METADATA_PATH)

        self.threshold = metadata["threshold"]
        self.features = metadata["features"]
        self.target = metadata["target"]
        self.model_name = metadata["model_name"]
        self.model_version = metadata["model_version"]

        self.loaded = True

    # ========================================================================
    # Prediction
    # ========================================================================

    def predict_probability(
        self,
        X: pd.DataFrame
    ):

        dmatrix = xgb.DMatrix(X, feature_names=self.features)

        return self.model.predict(dmatrix)

    def predict(
        self,
        X: pd.DataFrame
    ):

        probabilities = self.predict_probability(X)

        return (
            probabilities >= self.threshold
        ).astype(int)

    # ========================================================================
    # Metadata
    # ========================================================================

    def info(self):

        return {

            "model_name": self.model_name,

            "model_version": self.model_version,

            "target": self.target,

            "threshold": self.threshold,

            "n_features": len(self.features),

            "loaded": self.loaded,
        }

    def __repr__(self):

        return (
            f"FailurePredictionModel("
            f"name='{self.model_name}', "
            f"version='{self.model_version}', "
            f"features={len(self.features)}, "
            f"threshold={self.threshold})"
        )