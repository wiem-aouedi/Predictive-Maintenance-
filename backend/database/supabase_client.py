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

#fetch the fleet health summary at a given point in time (as a time_stamp) and return it as a dictionary 
# with the total number of machines, the number of machines not yet installed, and a dictionary of status counts
#  (healthy, warning, critical, failed) for the machines that are installed.

def fetch_fleet_health_summary(as_of_timestamp: str) -> dict:
    """
    Aggregate the fleet by status as of a given point in time.

    Each machine's status is derived from its most recent sensor_data reading
    at or before as_of_timestamp. Machines with no reading yet at that point
    (not yet installed) are excluded from status_counts and reported separately.
    """
    machines_df = fetch_machines()
    if machines_df.empty:
        return {"as_of_timestamp": as_of_timestamp, "total_machines": 0, "status_counts": {}}

    status_counts: dict = {}
    not_yet_installed = 0

    for machine_id in machines_df["id"]:
        snapshot = fetch_machine_sensor_history(
            int(machine_id), limit=1, as_of_timestamp=as_of_timestamp
        )
        if snapshot.empty:
            not_yet_installed += 1
            continue
        status = snapshot.iloc[-1]["status"]
        status_counts[status] = status_counts.get(status, 0) + 1

    return {
        "as_of_timestamp": as_of_timestamp,
        "total_machines": len(machines_df),
        "not_yet_installed": not_yet_installed,
        "status_counts": status_counts,
    }

#fetch the machines whose status matches the given status at a give timestamp and return as pandas dataframe
def fetch_machines_by_status(status: str, as_of_timestamp: str) -> pd.DataFrame:
    """
    Return machines whose status, as of a given point in time, matches `status`.

    machines.status no longer exists (it was a constant "failed" for every
    machine, since this dataset is a completed run-to-failure simulation).
    Status is instead derived per machine from its most recent sensor_data
    reading at or before as_of_timestamp.
    """
    machines_df = fetch_machines()
    if machines_df.empty:
        return pd.DataFrame()

    matches = []
    for machine_id in machines_df["id"]:
        snapshot = fetch_machine_sensor_history(
            int(machine_id), limit=1, as_of_timestamp=as_of_timestamp
        )
        if snapshot.empty:
            continue  # not yet installed as of this timestamp
        latest = snapshot.iloc[-1]
        if latest["status"] == status:
            row = machines_df[machines_df["id"] == machine_id].iloc[0].to_dict()
            row["status_as_of"] = latest["status"]
            row["degradation_as_of"] = latest["degradation"]
            matches.append(row)

    return pd.DataFrame(matches)

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