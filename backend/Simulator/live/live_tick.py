from datetime import datetime, timezone, timedelta
import numpy as np
from ..machine import Machine
from database.supabase_client import supabase
from . import live_config as cfg
from .live_fleet import load_live_state, save_live_state, _parse_ts


def rehydrate_machine(state_row: dict) -> Machine:
    install_dt = _parse_ts(state_row["installation_date"])

    m = Machine(
        machine_id=state_row["machine_id"],
        machine_name=f"Machine-{state_row['machine_id']:03d}",
        installation_datetime=install_dt,
        seed=state_row["seed"],
    )
    m.t = state_row["cycle_count"]
    m.done = state_row["done"]

    if state_row.get("rng_state"):
        m._rng.bit_generator.state = state_row["rng_state"]

    return m


def revive_machine(state_row: dict) -> tuple[Machine, int, int]:
    """
    Build a fresh Machine to replace one that finished its post-failure
    window, simulating a repair: same machine_id, a new seed (so the
    repaired unit's Tf/alpha/wear characteristics differ from before rather
    than reproducing an identical failure), and an installation timestamp
    offset from the failure by a randomized 7-14 day gap so the repair
    shows up as a real time gap in sensor_data.
    Returns (new_machine, revival_count, seed_used).
    """
    machine_id = state_row["machine_id"]
    revival_count = (state_row.get("revival_count") or 0) + 1

    gap_seed = cfg.REVIVAL_SEED_OFFSET + machine_id * 1000 + revival_count
    gap_rng = np.random.default_rng(gap_seed)
    gap_days = gap_rng.uniform(cfg.REVIVAL_GAP_MIN_DAYS, cfg.REVIVAL_GAP_MAX_DAYS)

    last_failure_ts = _parse_ts(state_row["last_failure_timestamp"])
    new_install_dt = last_failure_ts + timedelta(days=gap_days)

    m = Machine(
        machine_id=machine_id,
        machine_name=f"Machine-{machine_id:03d}",
        installation_datetime=new_install_dt,
        seed=gap_seed,
    )
    return m, revival_count, gap_seed


def tick() -> None:
    """
    One tick = advance every not-done live machine by CYCLES_PER_TICK cycles,
    save the new reading(s), and update saved progress. Machines that are
    'done' (failed, post-failure window finished) get revived instead of
    skipped: a repaired unit is persisted under the same machine_id and
    starts stepping on the *next* tick (not this same one, to keep the
    revive/step logic simple and separated).
    """
    state_rows = load_live_state()
    batch = []
    now = datetime.now(timezone.utc)

    for state_row in state_rows:
        if state_row["done"]:
            if not state_row.get("last_failure_timestamp"):
                continue  # nothing to base a revival timestamp on yet

            current_revivals = state_row.get("revival_count") or 0
            if cfg.MAX_REVIVALS is not None and current_revivals >= cfg.MAX_REVIVALS:
                continue  # retired for good after too many repairs

            revived, revival_count, gap_seed = revive_machine(state_row)
            save_live_state(
                machine_id=revived.machine_id,
                seed=gap_seed,
                cycle_count=revived.t,          # 0, fresh machine
                done=revived.done,              # False
                rng_state=revived._rng.bit_generator.state,
                installation_date=revived.installation_datetime.isoformat(),
                revival_count=revival_count,
            )
            print(f"DEBUG: machine {revived.machine_id} revived (repair #{revival_count})", flush=True)
            continue

        machine = rehydrate_machine(state_row)

        reading = None
        failure_transition_ts = None
        for _ in range(cfg.CYCLES_PER_TICK):
            if machine.done:
                break
            next_ts = machine.installation_datetime + timedelta(hours=machine.t + 1)
            if next_ts > now:
                break  # simulated clock has caught up to real time; wait for a later tick
            was_done = machine.done
            reading = machine.step()
            if machine.done and not was_done:
                failure_transition_ts = (
                    machine.installation_datetime + timedelta(hours=machine.t)
                ).isoformat()

        if reading is None:
            continue

        reading["timestamp"] = (
            machine.installation_datetime + timedelta(hours=machine.t)
        ).isoformat()

        batch.append(reading)
        save_live_state(
            machine_id=machine.machine_id,
            seed=machine.machine_id,
            cycle_count=machine.t,
            done=machine.done,
            rng_state=machine._rng.bit_generator.state,
            last_failure_timestamp=failure_transition_ts,
        )

    if batch:
        supabase.table("sensor_data").insert(batch).execute()
        print(f"DEBUG: live tick inserted {len(batch)} rows", flush=True)
    else:
        print("DEBUG: live tick — nothing to insert (all machines done or pending revival)", flush=True)