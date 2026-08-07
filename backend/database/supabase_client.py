# Imports
from supabase import create_client
import pandas as pd
from mcp_server.config import SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
# Supabase Client
if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    raise RuntimeError(
        "Missing Supabase credentials. "
        "Check your .env file and mcp_server/config.py."
    )

supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

# Generic Functions

#fetch table from supabase and return as pandas dataframe

def fetch_table(table_name: str, page_size: int = 1000, columns: str = "*") -> pd.DataFrame:
    """
    Paginate through a Supabase table and return the full contents as a DataFrame.
    PostgREST caps each request at 1000 rows by default, so this loops on
    .range() until a page comes back shorter than page_size.
    """
    all_rows = []
    start = 0
    while True:
        end = start + page_size - 1
        response = (
            supabase.table(table_name)
            .select(columns)
            .range(start, end)
            .execute()
        )
        rows = response.data
        if not rows:
            break
        all_rows.extend(rows)
        if len(rows) < page_size:
            break
        start += page_size
    return pd.DataFrame(all_rows)

 #fetch the sensor_data table having the page size as 1000 and return the dataframe sorted by machine_id and timestamp 
def fetch_sensor_data(page_size: int = 1000) -> pd.DataFrame:
    """Fetch the full sensor_data table, sorted by machine_id and timestamp."""
    df = fetch_table("sensor_data", page_size=page_size)
    if not df.empty:
        df["timestamp"] = pd.to_datetime(df["timestamp"])
        df = df.sort_values(["machine_id", "timestamp"]).reset_index(drop=True)
    return df
#fetch the sensor readings for a single machine, filtered and ordered server-side
def fetch_machine_sensor_history(
    machine_id: int,
    limit: int = 50,
    as_of_timestamp: str | None = None,
) -> pd.DataFrame:
    """
    Fetch sensor readings for a single machine, filtered and ordered server-side.

    By default returns the most recent `limit` readings. If `as_of_timestamp`
    is given, returns the `limit` readings ending at (and including) that
    point in the machine's history instead of always the latest -- lets you
    inspect a machine's state at any point in its life, not just its final
    (failure) readings.
    """
    query = (
        supabase.table("sensor_data")
        .select("*")
        .eq("machine_id", machine_id)
    )

    if as_of_timestamp is not None:
        query = query.lte("timestamp", as_of_timestamp)

    response = (
        query
        .order("timestamp", desc=True)
        .limit(limit)
        .execute()
    )
    df = pd.DataFrame(response.data)
    if not df.empty:
        df["timestamp"] = pd.to_datetime(df["timestamp"])
        df = df.sort_values("timestamp").reset_index(drop=True)
    return df


def fetch_machine_live_state(machine_id: int) -> pd.DataFrame:
    """Fetch one machine's row from machine_live_state (current-life
    installation_date, cycle_count, done, revival_count, etc.)."""
    response = (
        supabase.table("machine_live_state")
        .select("*")
        .eq("machine_id", machine_id)
        .limit(1)
        .execute()
    )
    return pd.DataFrame(response.data)



def fetch_machine_full_history(
    machine_id: int,
    as_of_timestamp: str | None = None,
    since_timestamp: str | None = None,
    page_size: int = 1000,
) -> pd.DataFrame:
    """
    Fetch a machine's sensor history from since_timestamp (inclusive) up to
    as_of_timestamp (inclusive), or the machine's whole life if neither is given.

    since_timestamp should normally be the machine's CURRENT LIFE's
    installation_date (from machine_live_state), not its original
    installation_date (from machines). A revived machine reuses its
    machine_id, so without this lower bound, this function would return
    both the machine's original run and its repaired run concatenated --
    silently corrupting build_features' positional lag/rolling features
    at the boundary between the two lives.
    ...
    """
    all_rows = []
    start = 0
    while True:
        end = start + page_size - 1
        query = (
            supabase.table("sensor_data")
            .select("*")
            .eq("machine_id", machine_id)
        )
        if since_timestamp is not None:
            query = query.gte("timestamp", since_timestamp)
        if as_of_timestamp is not None:
            query = query.lte("timestamp", as_of_timestamp)

        response = (
            query
            .order("timestamp", desc=False)
            .range(start, end)
            .execute()
        )
        rows = response.data
        if not rows:
            break
        all_rows.extend(rows)
        if len(rows) < page_size:
            break
        start += page_size

    df = pd.DataFrame(all_rows)
    if not df.empty:
        df["timestamp"] = pd.to_datetime(df["timestamp"])
        df = df.sort_values("timestamp").reset_index(drop=True)
    return df

#fetch the machines table and return as pandas dataframe
 
def fetch_machines() -> pd.DataFrame:
    """Fetch the machines table (fleet metadata: installation_date,etc.)."""
    return fetch_table("machines")

#fetch a single machine by id and return as pandas dataframe 

def fetch_machine(machine_id: int) -> pd.DataFrame:
    response = (
        supabase.table("machines")
        .select("*")
        .eq("id", machine_id)
        .limit(1)
        .execute()
    )

    return pd.DataFrame(response.data)


# ----------------------------------------------------------------------
# Fleet-wide status snapshot (single round trip via Postgres RPC)
# ----------------------------------------------------------------------
#
# NOTE: this requires a Postgres function to exist in Supabase. Run this
# once in the Supabase SQL editor before using fetch_fleet_status_snapshot:
#
#   create or replace function fleet_status_snapshot(as_of timestamptz)
#   returns table(machine_id int, status text, degradation numeric, ts timestamptz)
#   language sql stable as $$
#     select distinct on (machine_id)
#       machine_id, status, degradation, timestamp as ts
#     from sensor_data
#     where timestamp <= as_of
#     order by machine_id, timestamp desc
#   $$;
#
# Without this function deployed, fetch_fleet_status_snapshot will raise an
# error from Supabase (function does not exist) -- fetch_fleet_health_summary
# and fetch_machines_by_status will surface that as {"error": "..."} through
# the MCP tools rather than silently falling back to the old per-machine loop.

def fetch_fleet_status_snapshot(as_of_timestamp: str) -> pd.DataFrame:
    """
    Fetch the latest status/degradation per machine as of a given timestamp,
    in a single round trip via the fleet_status_snapshot Postgres function.

    Replaces the old approach of looping fetch_machine_sensor_history() once
    per machine (100+ network round trips for the full fleet) with one RPC
    call that does the "latest row per machine" aggregation server-side.
    """
    response = supabase.rpc(
        "fleet_status_snapshot", {"as_of": as_of_timestamp}
    ).execute()
    df = pd.DataFrame(response.data)
    if not df.empty:
        df = df.rename(columns={"ts": "timestamp"})
    return df


#fetch the fleet health summary at a given point in time (as a time_stamp) and return it as a dictionary 
# with the total number of machines, the number of machines not yet installed, and a dictionary of status counts
#  (healthy, warning, critical, failed) for the machines that are installed.

def fetch_fleet_health_summary(as_of_timestamp: str) -> dict:
    """
    Aggregate the fleet by status as of a given point in time.

    Each machine's status is derived from its most recent sensor_data reading
    at or before as_of_timestamp. Machines with no reading yet at that point
    (not yet installed) are excluded from status_counts and reported separately.

    Uses fetch_fleet_status_snapshot (1 RPC round trip) instead of looping
    per machine.
    """
    machines_df = fetch_machines()
    if machines_df.empty:
        return {"as_of_timestamp": as_of_timestamp, "total_machines": 0, "status_counts": {}}

    snapshot_df = fetch_fleet_status_snapshot(as_of_timestamp)

    if snapshot_df.empty:
        return {
            "as_of_timestamp": as_of_timestamp,
            "total_machines": len(machines_df),
            "not_yet_installed": len(machines_df),
            "status_counts": {},
        }

    installed_ids = set(snapshot_df["machine_id"])
    not_yet_installed = len(machines_df) - len(installed_ids)
    status_counts = snapshot_df["status"].value_counts().to_dict()

    return {
        "as_of_timestamp": as_of_timestamp,
        "total_machines": len(machines_df),
        "not_yet_installed": not_yet_installed,
        "status_counts": status_counts,
    }

def fetch_machine_recent_history(
    machine_id: int,
    since_timestamp: str,
    as_of_timestamp: str,
    limit: int = 200,
) -> pd.DataFrame:
    """
    Fetch just enough recent rows to compute features for the LATEST row
    only -- used by predict_failure_next_168h, which only needs the last
    row of build_features' output. Bounded below by since_timestamp (the
    machine's current-life installation) so this never crosses into a
    previous life's data on a revived machine, and bounded above by
    as_of_timestamp. 200 rows gives comfortable headroom over the
    pipeline's deepest lookback (24h rolling window).
    """
    response = (
        supabase.table("sensor_data")
        .select("*")
        .eq("machine_id", machine_id)
        .gte("timestamp", since_timestamp)
        .lte("timestamp", as_of_timestamp)
        .order("timestamp", desc=True)
        .limit(limit)
        .execute()
    )
    df = pd.DataFrame(response.data)
    if not df.empty:
        df["timestamp"] = pd.to_datetime(df["timestamp"])
        df = df.sort_values("timestamp").reset_index(drop=True)
    return df

#fetch the machines whose status matches the given status at a give timestamp and return as pandas dataframe
def fetch_machines_by_status(status: str, as_of_timestamp: str) -> pd.DataFrame:
    """
    Return machines whose status, as of a given point in time, matches `status`.

    machines.status no longer exists (it was a constant "failed" for every
    machine, since this dataset is a completed run-to-failure simulation).
    Status is instead derived per machine from its most recent sensor_data
    reading at or before as_of_timestamp.

    Uses fetch_fleet_status_snapshot (1 RPC round trip) instead of looping
    per machine.
    """
    machines_df = fetch_machines()
    if machines_df.empty:
        return pd.DataFrame()

    snapshot_df = fetch_fleet_status_snapshot(as_of_timestamp)
    if snapshot_df.empty:
        return pd.DataFrame()

    matched = snapshot_df[snapshot_df["status"] == status]
    if matched.empty:
        return pd.DataFrame()

    matched = matched.rename(
        columns={
            "machine_id": "id",
            "status": "status_as_of",
            "degradation": "degradation_as_of",
        }
    )[["id", "status_as_of", "degradation_as_of"]]

    merged = machines_df.merge(matched, on="id", how="inner")
    return merged

#insert the model predictions into the predictions table in supabase, in batches of 500 rows at a time
def insert_predictions(df: pd.DataFrame, batch_size: int = 500) -> None:
    """
    Write model outputs to the predictions table.
    Expects a DataFrame with columns: machine_id, timestamp, predicted_RUL, health_status.
    """
    required_cols = {"machine_id", "timestamp", "predicted_RUL", "health_status"}
    missing = required_cols - set(df.columns)
    if missing:
        raise ValueError(f"insert_predictions is missing columns: {missing}")

    records = df[list(required_cols)].copy()
    records["timestamp"] = records["timestamp"].astype(str)
    records = records.to_dict(orient="records")

    for i in range(0, len(records), batch_size):
        batch = records[i : i + batch_size]
        supabase.table("predictions").insert(batch).execute()
# ----------------------------------------------------------------------
# Machine specifications (extended machines columns: family, ratings,
# maintenance intervals -- populated by data/generate_family_specs.py)
# ----------------------------------------------------------------------

def fetch_machine_specifications(machine_id : int ) -> pd.DataFrame :
     """Fetch one machine's full specification row (serial number,
    manufacturer, family, rated parameters, maintenance intervals)."""
     response = (
         supabase.table("machines")
         .select("*")
         .eq("id", machine_id)
        .limit(1)
        .execute()
     )
     return pd.DataFrame(response.data)

def fetch_sensor_specifications(
    family: str,
    sensor_name: str | None = None,
) -> pd.DataFrame:
    """Fetch sensor limits/thresholds for a machine family, optionally
    filtered to one sensor."""
    query = (
        supabase.table("sensor_specifications")
        .select("*")
        .eq("family", family)
    )
    if sensor_name is not None:
        query = query.eq("sensor_name", sensor_name)

    response = query.execute()
    return pd.DataFrame(response.data)

def fetch_spare_parts(
    family: str,
    part_name: str | None = None,
) -> pd.DataFrame:
    """Fetch spare parts catalog for a machine family, optionally
    filtered by a partial part name match."""
    query = (
        supabase.table("spare_parts")
        .select("*")
        .eq("family", family)
    )
    if part_name is not None:
        query = query.ilike("part_name", f"%{part_name}%")

    response = query.execute()
    return pd.DataFrame(response.data)

def fetch_maintenance_tasks(
    family: str,
    task_name: str | None = None,
) -> pd.DataFrame:
    """Fetch scheduled maintenance procedures for a machine family,
    optionally filtered by a partial task name match."""
    query = (
        supabase.table("maintenance_tasks")
        .select("*")
        .eq("family", family)
    )
    if task_name is not None:
        query = query.ilike("task_name", f"%{task_name}%")

    response = query.execute()
    return pd.DataFrame(response.data)

# ----------------------------------------------------------------------
# Failure modes (family-level catalog)
# ----------------------------------------------------------------------

def fetch_failure_modes(
    family: str,
    failure: str | None = None,
) -> pd.DataFrame:
    """Fetch known failure modes for a machine family, optionally
    filtered by a partial failure name match."""
    query = (
        supabase.table("failure_modes")
        .select("*")
        .eq("family", family)
    )
    if failure is not None:
        query = query.ilike("failure", f"%{failure}%")

    response = query.execute()
    return pd.DataFrame(response.data)




if __name__ == "__main__":
    sensor_df = fetch_sensor_data()
    machines_df = fetch_machines()
    
    print(f"sensor_data: {len(sensor_df)} rows")
    print(f"machines: {len(machines_df)} rows")
    print(sensor_df.head())