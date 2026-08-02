import numpy as np


class DegradationModel:
    """
    Power-law degradation model: D(t) = (t / Tf) ** alpha

    Tf      : time-to-failure for this machine (in cycles)
    alpha   : degradation shape factor
                alpha < 1 -> degrades fast early, then plateaus
                alpha = 1 -> linear degradation
                alpha > 1 -> slow early, accelerates near failure
    d_threshold : degradation level at which the machine is considered failed
    """

    def __init__(self, Tf: float, alpha: float = 2.0, d_threshold: float = 0.95):
        self.Tf = Tf
        self.alpha = alpha
        self.d_threshold = d_threshold

    def degradation_at(self, t: float) -> float:
        d = (t / self.Tf) ** self.alpha
        return min(max(0.0, d), 1.0)
    def is_failed(self, d: float) -> bool:
        return d >= self.d_threshold
    
    def status_at(self, d: float) -> str:
        if d >= self.d_threshold:
            return "failed"
        elif d >= 0.8:
            return "critical"
        elif d >= 0.5:
            return "warning"
        else:
            return "healthy"