import numpy as np
from datetime import datetime, timedelta, timezone
from ..machine import Machine
from database.supabase_client import supabase
from . import live_config as cfg

_install_rng = np.random.default_rng(101)


def _parse_ts(value: str) -> datetime:
    """Defensive ISO-timestamp parsing (handles a trailing 'Z' just in case)."""
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def create_live_machines() -> list[Machine]:
    """Build the 20 live Machine objects in memory (not saved to the database yet)."""
    machines = []
    for offset in range(cfg.NUM_LIVE_MACHINES):
        machine_id = cfg.LIVE_FLEET_START_ID + offset
        offset_days = _install_rng.uniform(0, cfg.LIVE_INSTALL_SPREAD_DAYS)
        install_dt = cfg.LIVE_INSTALL_START + timedelta(days=offset_days)
        machines.append(
            Machine(
                machine_id=machine_id,
                machine_name=f"Machine-{machine_id:03d}",
                installation_datetime=install_dt,
                seed=machine_id,
            )
        )
    return machines


def register_live_machines(machines: list[Machine]) -> None:
    rows = [
        {
            "id": m.machine_id,
            "machine_name": m.machine_name,
            "installation_date": m.installation_date,
        }
        for m in machines
    ]
    supabase.table("machines").upsert(rows).execute()


def init_live_state(machines: list[Machine]) -> None:
    rows = [
        {
            "machine_id": m.machine_id,
            "seed": m.machine_id,
            "cycle_count": 0,
            "done": False,
            "installation_date": m.installation_datetime.isoformat(),
            "rng_state": m._rng.bit_generator.state,
            "revival_count": 0,
        }
        for m in machines
    ]
    supabase.table("machine_live_state").upsert(rows).execute()


def live_fleet_already_exists() -> bool:
    """Check specifically for Fleet B (101-120) — scoped by id so it isn't
    tripped by the frozen Fleet A rows that migration also writes into
    this same table."""
    resp = (
        supabase.table("machine_live_state")
        .select("machine_id")
        .gte("machine_id", cfg.LIVE_FLEET_START_ID)
        .limit(1)
        .execute()
    )
    return len(resp.data) > 0


def frozen_fleet_migrated() -> bool:
    """Check whether Fleet A (1-100) has already been migrated into
    machine_live_state (one-time operation)."""
    resp = (
        supabase.table("machine_live_state")
        .select("machine_id")
        .lte("machine_id", cfg.FROZEN_FLEET_END_ID)
        .limit(1)
        .execute()
    )
    return len(resp.data) > 0


def load_live_state() -> list[dict]:
    resp = supabase.table("machine_live_state").select("*").execute()
    return resp.data


def load_machine_metadata(machine_id: int) -> dict:
    resp = (
        supabase.table("machines")
        .select("*")
        .eq("id", machine_id)
        .limit(1)
        .execute()
    )
    return resp.data[0] if resp.data else {}


def save_live_state(
    machine_id: int,
    seed: int,
    cycle_count: int,
    done: bool,
    rng_state: dict,
    installation_date: str | None = None,
    last_failure_timestamp: str | None = None,
    revival_count: int | None = None,
) -> None:
    """Update one machine's saved progress. installation_date /
    last_failure_timestamp / revival_count are only included when they
    actually change (e.g. a fresh failure, or a revival) — Supabase upsert
    only touches columns present in the payload, so omitting a field leaves
    its existing stored value untouched."""
    row = {
        "machine_id": machine_id,
        "seed": seed,
        "cycle_count": cycle_count,
        "done": done,
        "rng_state": rng_state,
    }
    if installation_date is not None:
        row["installation_date"] = installation_date
    if last_failure_timestamp is not None:
        row["last_failure_timestamp"] = last_failure_timestamp
    if revival_count is not None:
        row["revival_count"] = revival_count

    supabase.table("machine_live_state").upsert(row).execute()


def migrate_frozen_fleet_to_live_state(
    start_id: int = None,
    end_id: int = None,
) -> None:
    """
    One-time migration: register frozen Fleet A machines (1-100) into
    machine_live_state as 'done', using each machine's real last sensor_data
    timestamp as last_failure_timestamp, so tick()'s revival logic can bring
    them back online as repaired units. Safe to re-run (upsert on machine_id),
    and guarded by frozen_fleet_migrated() in run_one_tick.bootstrap_if_needed().
    """
    start_id = start_id or cfg.FROZEN_FLEET_START_ID
    end_id = end_id or cfg.FROZEN_FLEET_END_ID
    rows = []

    for machine_id in range(start_id, end_id + 1):
        first = (
            supabase.table("sensor_data")
            .select("timestamp")
            .eq("machine_id", machine_id)
            .order("timestamp")
            .limit(1)
            .execute()
        )
        last = (
            supabase.table("sensor_data")
            .select("timestamp")
            .eq("machine_id", machine_id)
            .order("timestamp", desc=True)
            .limit(1)
            .execute()
        )
        if not first.data or not last.data:
            print(f"DEBUG: no sensor_data for machine_id={machine_id}, skipping", flush=True)
            continue

        # First logged reading happens at t=1, one cycle after installation.
        install_dt = _parse_ts(first.data[0]["timestamp"]) - timedelta(hours=1)
        last_ts = _parse_ts(last.data[0]["timestamp"])
        cycle_count = int((last_ts - install_dt).total_seconds() // 3600)

        rows.append({
            "machine_id": machine_id,
            "seed": machine_id,
            "cycle_count": cycle_count,
            "done": True,
            "installation_date": install_dt.isoformat(),
            "rng_state": None,
            "last_failure_timestamp": last_ts.isoformat(),
            "revival_count": 0,
        })

    if rows:
        supabase.table("machine_live_state").upsert(rows).execute()
        print(f"DEBUG: migrated {len(rows)} frozen machines into machine_live_state", flush=True)
    else:
        print("DEBUG: migrate_frozen_fleet_to_live_state found nothing to migrate", flush=True)