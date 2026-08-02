def register_prompts(mcp):
    """
    Register all MCP prompts — reusable conversation templates that guide the
    LLM host toward calling the right tool(s) and interpreting the results
    correctly, rather than free-styling over raw JSON.
    """

    # ------------------------------------------------------------------
    # 1. Single-machine prediction explainability
    # ------------------------------------------------------------------
    @mcp.prompt(
        name="explain_failure_prediction",
        description="Get a failure prediction for one machine and explain it in plain language."
    )
    def explain_failure_prediction(
        machine_id: str,
        as_of_timestamp: str = "",
        audience: str = "technician",
    ) -> str:
        as_of_clause = (
            f'as_of_timestamp="{as_of_timestamp}"'
            if as_of_timestamp
            else "as_of_timestamp set to the machine's latest available reading "
                 "(call get_machine_sensor_history with limit=1 first to find it if needed)"
        )
        return f"""Call `predict_failure_next_168h` for machine_id={machine_id}, {as_of_clause}, then explain the result.

The tool returns a dict with the prediction, probability, threshold, and model metadata. Your explanation should:

1. State the failure probability over the next 7 days in plain terms (avoid saying "168h").
2. Say whether the probability crosses the returned threshold, and what that means in practice
   (e.g. "flagged as high-risk" vs "within normal range").
3. If probability is above or near the threshold, call `analyze_sensor_trends` for the same machine_id
   and as_of_timestamp to identify which sensors are trending in a way that supports the prediction
   (e.g. rising temperature, increasing vibration), and mention them.
4. Translate the risk level into a concrete recommendation:
   - High risk -> recommend scheduling an inspection soon, citing the driving sensor trends if found.
   - Borderline -> recommend increased monitoring rather than immediate action.
   - Low risk -> state no action is needed, without implying certainty.
5. Include one brief caveat: this model is trained on simulated sensor data (not real industrial
   data yet), so treat the output as a decision-support signal, not a guarantee.
6. Tailor vocabulary and depth to the audience: "{audience}" ("technician" = plain language,
   action-first; "engineer" = can include the actual probability, threshold, and slope values).

Keep it concise — a few sentences, not a report."""

    # ------------------------------------------------------------------
    # 2. Single-machine holistic health explainability
    # ------------------------------------------------------------------
    @mcp.prompt(
        name="explain_machine_health",
        description="Give a full picture of one machine's current condition: metadata, recent sensor trend, and failure risk."
    )
    def explain_machine_health(machine_id: str, as_of_timestamp: str = "") -> str:
        as_of_clause = f'as_of_timestamp="{as_of_timestamp}"' if as_of_timestamp else "no as_of_timestamp (use latest data)"
        return f"""Build a full health picture for machine_id={machine_id}, {as_of_clause}, using three calls:

1. `get_machine_details` — machine metadata (installation date, etc.).
2. `analyze_sensor_trends` — per-sensor direction, slope, and current value.
3. `predict_failure_next_168h` — 7-day failure probability and threshold.

Then produce a short narrative, in this order:
- How long the machine has been running (derive from installation_date to as_of_timestamp / now).
- Current status and which sensors, if any, are trending up/down in a way worth flagging
  (only mention sensors whose direction is not "stable" — don't list every sensor).
- The 7-day failure probability and whether it crosses the threshold.
- One clear, prioritized recommendation (inspect now / monitor / no action).

If any tool call returns an "error" key, state plainly that the machine's data is incomplete
or the machine doesn't exist — do not guess at values."""

    # ------------------------------------------------------------------
    # 3. Sensor trend explainability (standalone, no prediction)
    # ------------------------------------------------------------------
    @mcp.prompt(
        name="explain_sensor_trends",
        description="Explain whether a machine's sensors are trending toward degradation, without necessarily invoking the prediction model."
    )
    def explain_sensor_trends(machine_id: str, window: str = "168", as_of_timestamp: str = "") -> str:
        as_of_clause = f'as_of_timestamp="{as_of_timestamp}"' if as_of_timestamp else "no as_of_timestamp"
        return f"""Call `analyze_sensor_trends` for machine_id={machine_id}, window={window}, {as_of_clause}.

The result is a per-sensor dict with direction ("up"/"down"/"stable"), slope, current value, and
window stats. Explain in plain language:

1. Which sensors are actively trending (skip "stable" ones unless none are trending, in which case say so).
2. Whether the direction of each trending sensor is consistent with degradation given what these
   sensors normally do as a machine wears down (temperature and current tend to rise, rotational
   speed and pressure tend to fall, vibration tends to rise, especially non-linearly, near failure).
3. A one-line overall read: "actively degrading", "stable", or "inconclusive" — don't overstate
   confidence from trend direction alone; this prompt does not call the prediction model, so avoid
   stating a failure probability. If the person wants an actual risk estimate, suggest running
   explain_failure_prediction instead."""

    # ------------------------------------------------------------------
    # 4. Fleet-level triage
    # ------------------------------------------------------------------
    @mcp.prompt(
        name="fleet_triage",
        description="Identify which machines in the fleet need attention right now, ranked by urgency."
    )
    def fleet_triage(as_of_timestamp: str = "") -> str:
        as_of_clause = f'"{as_of_timestamp}"' if as_of_timestamp else "the current time"
        return f"""Perform a fleet-wide triage as of {as_of_clause}:

1. Call `get_fleet_health_summary` with as_of_timestamp={as_of_clause} for the overall status breakdown.
2. Call `list_machines_by_status` with status="critical" and the same as_of_timestamp.
3. Call `list_machines_by_status` with status="warning" and the same as_of_timestamp.
4. For each machine returned in steps 2 and 3 (not "healthy" or "failed" machines — those don't need
   triage), call `predict_failure_next_168h` to get an actual 7-day probability.

Then produce a ranked list, most urgent first, sorted by predicted probability, with:
- machine_id
- current status (critical/warning)
- 7-day failure probability
- one-line reason if analyze_sensor_trends data is easy to add, otherwise omit

Finish with a one-paragraph summary: how many machines total, how many need attention now, and
whether the fleet overall looks stable or concerning. If get_fleet_health_summary shows machines
"not_yet_installed", exclude them from urgency ranking but you can mention the count."""

    # ------------------------------------------------------------------
    # 5. Multi-machine comparison
    # ------------------------------------------------------------------
    @mcp.prompt(
        name="compare_machines",
        description="Compare failure risk and sensor trends across a specific list of machines."
    )
    def compare_machines(machine_ids: str, as_of_timestamp: str = "") -> str:
        as_of_clause = f'"{as_of_timestamp}"' if as_of_timestamp else "the current time"
        return f"""Compare these machines: {machine_ids} (comma-separated machine_id values), as of {as_of_clause}.

For each machine_id in the list:
1. Call `predict_failure_next_168h`.
2. Call `analyze_sensor_trends`.

Then present a comparison (a table if the host renders one well, otherwise a short list per machine),
covering: 7-day failure probability, whether it's above threshold, and the single most concerning
sensor trend if any. End with a one-line verdict on which machine(s) need attention first and why —
base this only on the returned probabilities and trends, not assumptions about machine age or type."""

    # ------------------------------------------------------------------
    # 6. Fleet status report (broader than triage — includes failed machines)
    # ------------------------------------------------------------------
    @mcp.prompt(
        name="fleet_status_report",
        description="Produce a full fleet status report: healthy, warning, critical, and failed counts, plus the failed machine list."
    )
    def fleet_status_report(as_of_timestamp: str = "") -> str:
        as_of_clause = f'"{as_of_timestamp}"' if as_of_timestamp else "the current time"
        return f"""Produce a fleet status report as of {as_of_clause}:

1. Call `get_fleet_health_summary` for the status_counts breakdown and not_yet_installed count.
2. Call `list_failed_machines` for the specific machines currently in "failed" status.

Report, in order:
- Total machines, and how many aren't installed yet as of this timestamp.
- Status breakdown (healthy / warning / critical / failed counts).
- The specific failed machine_ids, if any (don't call predict_failure_next_168h on already-failed
  machines — the prediction task doesn't apply to them).
- One takeaway sentence on overall fleet health.

This is a snapshot report, not a triage — don't rank by urgency here; that's what fleet_triage is for."""

    # ------------------------------------------------------------------
    # 7. Pipeline / methodology explainability (no tool calls — meta level)
    # ------------------------------------------------------------------
    @mcp.prompt(
        name="explain_model_methodology",
        description="Explain how the underlying prediction model and pipeline work, for someone asking 'how does this prediction actually work?'"
    )
    def explain_model_methodology() -> str:
        return """Explain this predictive maintenance system's methodology, without calling any tools —
this is background/context, not a live query. Cover, briefly:

1. **What's being predicted**: whether a machine will fail within the next 168 hours (7 days),
   as a binary classification (failure_next_168h), trained on simulated sensor time-series data
   (temperature, vibration, rotational speed, current, degradation) since real industrial data
   wasn't available.
2. **How the model sees a machine's history**: at prediction time, the system pulls a machine's
   FULL sensor history (not just recent readings) because features like cycle_index and rolling
   statistics depend on counting from the machine's very first reading — a partial window would
   silently produce wrong features.
3. **Feature engineering**: lag features (1, 3, 6, 12, 24 steps back), rolling mean/std over
   6- and 24-step windows, exponentially weighted moving averages, diffs, and a few engineered
   ratio features, plus cycle_index (time since installation). This logic is NOT stored in the
   saved model file — it has to be reproduced identically at inference time, or predictions would
   be wrong even with a correctly loaded model.
4. **Why PR-AUC, not accuracy**: failure events are rare relative to normal operation (class
   imbalance), so PR-AUC (precision-recall) is used instead of accuracy or plain ROC-AUC, which
   would look artificially good on an imbalanced dataset.
5. **Validation approach**: machines were split by machine ID (GroupKFold), not by row, so that
   a single machine's time-series never leaks across train/validation/test — otherwise the model
   could "cheat" by seeing a machine's future in training.
6. **Key limitation to state plainly**: this is trained on a simulator's generated data, so it
   reflects the simulator's assumptions about how degradation manifests in sensors, not
   necessarily how real industrial equipment fails. Treat predictions as decision support,
   not ground truth.

Keep each point to a sentence or two — this is an overview, not a full report."""