import numpy as np
from datetime import datetime
from .degradation_model import DegradationModel

class Machine:
    """
    Wraps a DegradationModel and produces noisy sensor readings as a
    function of degradation D(t):

        T(t)   = T0   + kT * D(t)      + eps_T
        RPM(t) = RPM0 - kR * D(t)      + eps_R
        V(t)   = V0   + kV * D(t)**2   + eps_V
        P(t)   = P0   - kP * D(t)      + eps_P
        I(t)   = I0   + kI * D(t)      + eps_I

    Once degradation crosses the failure threshold, the machine keeps
    logging readings for POST_FAILURE_WINDOW more cycles, then stops.
    """

    POST_FAILURE_WINDOW = 20

    def __init__(self, machine_id: int, machine_name: str, installation_datetime: datetime,
                 Tf: float = None, alpha: float = None, seed: int = None):
        rng = np.random.default_rng(seed)

        self.machine_id = machine_id
        self.machine_name = machine_name
        self.installation_datetime = installation_datetime
        self.installation_date = installation_datetime.date().isoformat()
        self.status = "running"
        self.done = False
        self._cycles_since_failure = 0

        self.Tf = Tf if Tf is not None else rng.uniform(5000, 8000)
        self.alpha = alpha if alpha is not None else rng.uniform(1.5, 3.0)
        self.degradation_model = DegradationModel(Tf=self.Tf, alpha=self.alpha)

        self.T0, self.kT = rng.normal(60, 3), rng.normal(50, 8)
        self.RPM0, self.kR = rng.normal(1800, 30), rng.normal(300, 30)
        self.V0, self.kV = rng.normal(0.05, 0.01), rng.normal(2.0, 0.3)
        self.P0, self.kP = rng.normal(6.0, 0.3), rng.normal(2.0, 0.3)
        self.I0, self.kI = rng.normal(10.0, 1.0), rng.normal(4.0, 0.5)

        self.sigma_T, self.sigma_R, self.sigma_V = 0.5, 10.0, 0.01
        self.sigma_P, self.sigma_I = 0.1, 0.2

        self.t = 0
        self._rng = rng

    def step(self) -> dict:
        """Advance one cycle and return a row matching the sensor_data schema."""
        self.t += 1
        d = self.degradation_model.degradation_at(self.t)

        temperature = self.T0 + self.kT * d + self._rng.normal(0, self.sigma_T)
        rotational_speed = self.RPM0 - self.kR * d + self._rng.normal(0, self.sigma_R)
        vibration = self.V0 + self.kV * (d ** 2) + self._rng.normal(0, self.sigma_V)
        pressure = self.P0 - self.kP * d + self._rng.normal(0, self.sigma_P)
        current = self.I0 + self.kI * d + self._rng.normal(0, self.sigma_I)

        failed = self.degradation_model.is_failed(d)
        record_status = self.degradation_model.status_at(d)

        if failed:
            self.status = "failed"
            self._cycles_since_failure += 1
            if self._cycles_since_failure > self.POST_FAILURE_WINDOW:
                self.done = True

        return {
            "machine_id": self.machine_id,
            "temperature": round(float(temperature), 3),
            "rotational_speed": round(float(rotational_speed), 3),
            "vibration": round(float(vibration), 4),
            "pressure": round(float(pressure), 3),
            "current": round(float(current), 3),
            "degradation": round(float(d), 4),
            "failure": bool(failed),
            "status": record_status,
        }