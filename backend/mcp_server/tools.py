from typing import Any
from datetime import datetime, timezone
import pandas as pd
import mcp
import concurrent.futures
from ML.predictor import predict_from_sensor_history
from ML.analysis import compute_sensor_trends
from database.supabase_client import (
    fetch_machine_recent_history,
    fetch_machines,
    fetch_machine,
    fetch_machine_sensor_history,
    fetch_machine_full_history,
    fetch_machines_by_status,
    fetch_fleet_health_summary,
    fetch_machine_live_state,
    fetch_failure_modes,
    fetch_machine_specifications,
    fetch_maintenance_tasks,
    fetch_sensor_specifications,
    fetch_spare_parts,
)


def _resolve_timestamp(as_of_timestamp: str | None) -> str:
    """
    Resolve an optional as_of_timestamp to a concrete ISO 8601 string.

    If the caller (LLM) doesn't supply a timestamp, default to the current
    real-world UTC time. Centralizing this here means every live-fleet tool
    behaves consistently, and the LLM no longer needs to burn tool calls
    figuring out "what time is it" before it can ask a real question.
    """
    if as_of_timestamp is not None:
        return as_of_timestamp
    return datetime.now(timezone.utc).isoformat()


def register_tools(mcp):
    """
    Register all MCP tools.
    """

    @mcp.tool()
    def list_machines() -> list[dict[str, Any]]:
        """
        Return every machine stored in the fleet database.

        Returns:
            A list of dictionaries containing the machine metadata,
            including machine_id and installation_date .
        """
        try:
            df = fetch_machines()
            return df.to_dict(orient="records")

        except Exception as e:
            return [{"error": str(e)}]

    @mcp.tool()
    def get_machine_sensor_history(
        machine_id: int,
        limit: int = 50,
        as_of_timestamp: str | None = None,
    ) -> list[dict[str, Any]]:
        """
        Return sensor readings for a single machine, ordered chronologically
        (oldest to newest).

        By default, returns the machine's most recent readings. Because this
        dataset records each machine's full life up to and including its
        failure event, the most recent readings will typically be very close
        to failure. To inspect the machine's condition at an earlier point in
        its life instead, pass as_of_timestamp.

        Args:
            machine_id: The numeric id of the machine to query (see list_machines).
            limit: Maximum number of readings to return (default 50).
            as_of_timestamp: Optional ISO 8601 timestamp (e.g. "2025-06-01 00:00:00").
                If provided, returns the `limit` readings at or before this point
                in time instead of the machine's latest readings.

        Returns:
            A list of dictionaries, one per sensor reading, containing
            timestamp and all recorded sensor columns.
        """
        try:
            df = fetch_machine_sensor_history(
                machine_id, limit=limit, as_of_timestamp=as_of_timestamp
            )
            if df.empty:
                return []
            df["timestamp"] = df["timestamp"].astype(str)
            return df.to_dict(orient="records")

        except Exception as e:
            return [{"error": str(e)}]

    @mcp.tool()
    def get_machine_details(machine_id: int) -> dict[str, Any]:
        """
        Return metadata for a single machine.

        Args:
            machine_id: The numeric id of the machine to look up (see list_machines).

        Returns:
            A dictionary with the machine's metadata (installation_date, etc.),
            or an empty dictionary if no machine with that id exists.
        """
        try:
            df = fetch_machine(machine_id)
            if df.empty:
                return {}
            return df.to_dict(orient="records")[0]

        except Exception as e:
            return {"error": str(e)}

    @mcp.tool()
    def list_machines_by_status(
        status: str, as_of_timestamp: str | None = None
    ) -> list[dict[str, Any]]:
        """
        Return machines whose status, as of a given point in time, matches `status`.

        Status is derived from each machine's most recent sensor reading at or
        before as_of_timestamp (values seen in this dataset: "healthy", "warning","critical",
        "failed"). Machines not yet installed as of that timestamp are excluded.

        Args:
            status: The status to filter by (e.g. "healthy", "warning","critical", "failed").
            as_of_timestamp: Optional ISO 8601 timestamp defining "now" for this
                query (e.g. "2025-08-01 00:00:00"). Omit this for "right now" /
                live fleet questions -- it defaults to the current time
                automatically. Only pass it explicitly when asking about a
                specific past moment.

        Returns:
            A list of dictionaries with machine metadata plus status_as_of and
            degradation_as_of at the given timestamp. Empty list if no matches.
        """
        try:
            ts = _resolve_timestamp(as_of_timestamp)
            df = fetch_machines_by_status(status, ts)
            return df.to_dict(orient="records")

        except Exception as e:
            return [{"error": str(e)}]

    @mcp.tool()
    def list_failed_machines(as_of_timestamp: str | None = None) -> list[dict[str, Any]]:
        """
        Return all machines whose status was "failed" as of a given point in time.

        Status is derived from each machine's most recent sensor reading at or
        before as_of_timestamp. Machines not yet installed as of that timestamp
        are excluded.

        Args:
            as_of_timestamp: Optional ISO 8601 timestamp defining "now" for this
                query (e.g. "2025-08-01 00:00:00"). Omit this for "right now" --
                it defaults to the current time automatically.

        Returns:
            A list of dictionaries with machine metadata for every machine
            that had failed by that point in time. Empty list if none match.
        """
        try:
            ts = _resolve_timestamp(as_of_timestamp)
            df = fetch_machines_by_status("failed", ts)
            return df.to_dict(orient="records")

        except Exception as e:
            return [{"error": str(e)}]

    @mcp.tool()
    def get_urgent_machines(as_of_timestamp: str | None = None) -> list[dict[str, Any]]:
        """
        Return every machine currently in "critical" or "failed" status, in a
        single call. Use this directly for "which machines need urgent
        attention" or "any failing machines" style questions instead of
        checking machines one by one or calling list_machines_by_status twice.

        Args:
            as_of_timestamp: Optional ISO 8601 timestamp defining "now" for
                this query. Omit this for "right now" -- it defaults to the
                current time automatically.

        Returns:
            A list of dictionaries (machine metadata plus status_as_of and
            degradation_as_of) for machines in critical or failed status.
            Empty list if none are urgent.
        """
        try:
            ts = _resolve_timestamp(as_of_timestamp)
            critical_df = fetch_machines_by_status("critical", ts)
            failed_df = fetch_machines_by_status("failed", ts)

            if critical_df.empty and failed_df.empty:
                return []

            combined = pd.concat([critical_df, failed_df], ignore_index=True)
            return combined.to_dict(orient="records")

        except Exception as e:
            return [{"error": str(e)}]

    @mcp.tool()
    def get_fleet_health_summary(as_of_timestamp: str | None = None) -> dict[str, Any]:
        """
        Return an aggregate summary of the fleet's health as of a given point
        in time. Use this for "fleet health summary" / "how's the fleet
        doing" style questions -- it's a single aggregate call, not something
        to reconstruct from per-machine lookups.

        Args:
            as_of_timestamp: Optional ISO 8601 timestamp defining "now" for
                this query (e.g. "2025-08-01 00:00:00"). Omit this for "right
                now" / live fleet questions -- it defaults to the current
                time automatically.

        Returns:
            A dictionary with total machine count, how many aren't yet
            installed at that timestamp, and a breakdown of status counts
            among the rest.
        """
        try:
            ts = _resolve_timestamp(as_of_timestamp)
            return fetch_fleet_health_summary(ts)

        except Exception as e:
            return {"error": str(e)}

    @mcp.tool()
    def analyze_sensor_trends(
        machine_id: int, window: int = 168, as_of_timestamp: str | None = None
    ) -> dict[str, Any]:
        """
        Analyze whether each sensor is trending up, down, or stable over the
        most recent readings, to help judge if a machine is actively degrading
        rather than just relying on a single instantaneous reading.

        Args:
            machine_id: The numeric id of the machine to analyze.
            window: How many recent readings to include in the trend fit (default 168).
            as_of_timestamp: Optional point in time to analyze "as of" instead of latest.

        Returns:
            Per-sensor dict with direction, slope, current value, and window stats.
        """
        try:
            df = fetch_machine_full_history(machine_id, as_of_timestamp=as_of_timestamp)
            if df.empty:
                return {"error": f"No sensor history found for machine {machine_id}."}
            return compute_sensor_trends(df, window=window)
        except Exception as e:
            return {"error": str(e)}

    @mcp.tool()
    def predict_failure_next_168h(
        machine_id: int,
        as_of_timestamp: str | None = None,
    ) -> dict[str, Any]:
        """
        Predict whether a machine will fail within the next 168 hours (~7 days),
        as of a chosen point in time.

        Runs the trained XGBoost model against the machine's historical sensor
        readings, using only data available up to as_of_timestamp, to estimate
        the probability of failure within the following week.

        For general "how's machine X doing" / "should I worry about X" style
        questions, prefer get_machine_health_summary instead -- it returns
        this same prediction plus status, latest reading, and trend
        information in a single call. Use this tool directly only when you
        specifically need just the raw prediction (e.g. re-checking at a
        different as_of_timestamp after already having the rest of the
        picture).

        Args:
            machine_id: The numeric id of the machine.
            as_of_timestamp: Optional ISO 8601 timestamp (e.g. "2025-08-01 00:00:00")
                defining the point in time to predict from. Omit this for "right
                now" -- it defaults to the current time automatically. Only
                sensor data at or before this timestamp is used.

        Returns:
            A dictionary containing the prediction, probability, threshold,
            model metadata, and timestamp.

            Returns {"error": "..."} if the machine or its history cannot
            be retrieved.
        """
        try:
            ts = _resolve_timestamp(as_of_timestamp)

            live_state = fetch_machine_live_state(machine_id)
            if live_state.empty:
                return {
                    "error": f"No live state found for machine {machine_id}."
                }
            current_life_install = live_state.iloc[0]["installation_date"]

            # ------------------------------------------------------------------
            # Retrieve sensor history scoped to the machine's CURRENT life only
            # ------------------------------------------------------------------
            history = fetch_machine_recent_history(
                machine_id,
                since_timestamp=current_life_install,
                as_of_timestamp=ts,
                    limit=200,
        )

            if history.empty:
                return {
                    "error": f"No sensor history found for machine {machine_id}."
                }

            # ------------------------------------------------------------------
            # Run prediction
            # ------------------------------------------------------------------
            prediction = predict_from_sensor_history(
                sensor_history=history,
                installation_date=current_life_install,
            )

            return prediction

        except Exception as e:
            return {"error": str(e)}
    @mcp.tool()
    def get_machine_health_summary(
        machine_id: int,
        as_of_timestamp: str | None = None,
        include_failure_modes: bool = True,
    ) -> dict[str, Any]:
        """
        Return a single consolidated health snapshot for one machine: current
        status, degradation level, latest sensor reading, 168h failure
        prediction, short-term sensor trend directions, and (if the machine is
        critical or failed) likely failure modes for its family.

        Use this as the default first call for "how's machine X doing" /
        "should I worry about machine X" style questions instead of chaining
        get_machine_details, predict_failure_next_168h, analyze_sensor_trends,
        and get_failure_modes separately -- this tool does the equivalent work
        in one call.

        Args:
            machine_id: The numeric id of the machine to summarize.
            as_of_timestamp: Optional ISO 8601 timestamp defining "now" for
                this query. Omit this for "right now" -- it defaults to the
                current time automatically.
            include_failure_modes: Whether to include likely failure modes
                when the machine is in critical or failed status (default
                True). Set False if you only need the numeric snapshot.

        Returns:
            A dictionary with status, degradation, latest_reading, prediction,
            sensor_trends, and (conditionally) likely_failure_modes. Returns
            {"error": "..."} if the machine or its live state cannot be found.
        """
        try:
            ts = _resolve_timestamp(as_of_timestamp)

            live_state = fetch_machine_live_state(machine_id)
            if live_state.empty:
                return {"error": f"No live state found for machine {machine_id}."}
            current_life_install = live_state.iloc[0]["installation_date"]

            # fetch_* calls are blocking (supabase-py is sync), so run the
            # two independent ones concurrently in a thread pool instead of
            # awaiting them one after another.
            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
                specs_future = pool.submit(fetch_machine_specifications, machine_id)
                history_future = pool.submit(
                    fetch_machine_recent_history,
                    machine_id,
                    since_timestamp=current_life_install,
                    as_of_timestamp=ts,
                    limit=200,
                )
                specs_df = specs_future.result()
                history = history_future.result()

            if history.empty:
                return {"error": f"No sensor history found for machine {machine_id}."}

            latest = history.iloc[-1]
            status = latest.get("status", "unknown")
            degradation = latest.get("degradation")

            prediction = predict_from_sensor_history(
                sensor_history=history,
                installation_date=current_life_install,
            )

            trends = compute_sensor_trends(history, window=168)
            trend_summary = {
                sensor: info.get("direction")
                for sensor, info in trends.items()
                if isinstance(info, dict)
            }

            result = {
                "machine_id": machine_id,
                "as_of": ts,
                "status": status,
                "degradation": round(float(degradation), 4) if degradation is not None else None,
                "latest_reading": {
                    "timestamp": str(latest.get("timestamp")),
                    "temperature": latest.get("temperature"),
                    "rotational_speed": latest.get("rotational_speed"),
                    "vibration": latest.get("vibration"),
                    "pressure": latest.get("pressure"),
                    "current": latest.get("current"),
                },
                "prediction": prediction,
                "sensor_trends": trend_summary,
            }

            if include_failure_modes and status in ("critical", "failed") and not specs_df.empty:
                family = specs_df.iloc[0].get("family")
                if family:
                    fm_df = fetch_failure_modes(family)
                    if not fm_df.empty:
                        result["likely_failure_modes"] = fm_df.to_dict(orient="records")

            return result

        except Exception as e:
            return {"error": str(e)}


    @mcp.tool()
    def get_machine_specifications(machine_id: int) -> dict[str, Any]:
        """
        Return full specifications for a single machine: serial number,
        manufacturer, family, rated electrical/mechanical parameters, and
        maintenance intervals (lubrication, inspection, bearing replacement).

        Args:
            machine_id: The numeric id of the machine to look up.

        Returns:
            A dictionary of machine specification fields, or {"error": "..."}
            if no machine with that id exists.
        """
        try:
            df = fetch_machine_specifications(machine_id)
            if df.empty:
                return {"error": f"No machine found with id {machine_id}."}
            return df.to_dict(orient="records")[0]

        except Exception as e:
            return {"error": str(e)}

    @mcp.tool()
    def get_sensor_specifications(
        family: str,
        sensor_name: str | None = None,
    ) -> list[dict[str, Any]]:
        """
        Return sensor limits and thresholds for a machine family: minimum,
        maximum, warning/critical/failure thresholds, tolerance, sampling
        frequency, and accuracy.

        Use this to judge whether a sensor reading returned by
        get_machine_sensor_history or predict_failure_next_168h is
        healthy, in warning, critical, or at failure level for that
        family -- do not judge sensor severity from memory, always check
        this tool first.

        Args:
            family: The machine family id (e.g. "F001"). See
                get_machine_specifications for a machine's family.
            sensor_name: Optional filter to one sensor (temperature,
                rotational_speed, vibration, pressure, current).

        Returns:
            A list of dictionaries, one per sensor spec. Empty list if
            no specs are found for that family.
        """
        try:
            df = fetch_sensor_specifications(family, sensor_name=sensor_name)
            if df.empty:
                return []
            return df.to_dict(orient="records")

        except Exception as e:
            return [{"error": str(e)}]

    @mcp.tool()
    def get_spare_parts(
        family: str,
        part_name: str | None = None,
    ) -> list[dict[str, Any]]:
        """
        Return the spare parts catalog for a machine family: part name,
        manufacturer, part number, stock quantity, lead time, and
        recommended replacement interval.

        Args:
            family: The machine family id (e.g. "F001").
            part_name: Optional partial name filter (e.g. "bearing").

        Returns:
            A list of dictionaries, one per spare part. Empty list if
            no parts are found for that family.
        """
        try:
            df = fetch_spare_parts(family, part_name=part_name)
            if df.empty:
                return []
            return df.to_dict(orient="records")

        except Exception as e:
            return [{"error": str(e)}]

    @mcp.tool()
    def get_maintenance_tasks(
        family: str,
        task_name: str | None = None,
    ) -> list[dict[str, Any]]:
        """
        Return scheduled maintenance procedures for a machine family:
        task name, frequency, estimated duration, required tools/parts/
        skill, and a procedure summary.

        Args:
            family: The machine family id (e.g. "F001").
            task_name: Optional partial name filter (e.g. "lubrication").

        Returns:
            A list of dictionaries, one per maintenance task. Empty list
            if no tasks are found for that family.
        """
        try:
            df = fetch_maintenance_tasks(family, task_name=task_name)
            if df.empty:
                return []
            return df.to_dict(orient="records")

        except Exception as e:
            return [{"error": str(e)}]

    @mcp.tool()
    def get_failure_modes(
        family: str,
        failure: str | None = None,
    ) -> list[dict[str, Any]]:
        """
        Return known failure modes for a machine family: failure name,
        possible causes, symptoms, recommended actions, and severity.

        Use this after predict_failure_next_168h or analyze_sensor_trends
        indicates elevated risk, to identify which failure mode is likely
        and what response is recommended -- do not guess a cause or
        remedy without checking this tool.

        Args:
            family: The machine family id (e.g. "F001").
            failure: Optional partial name filter (e.g. "bearing").

        Returns:
            A list of dictionaries, one per failure mode. Empty list if
            no failure modes are found for that family.
        """
        try:
            df = fetch_failure_modes(family, failure=failure)
            if df.empty:
                return []
            return df.to_dict(orient="records")

        except Exception as e:
            return [{"error": str(e)}]