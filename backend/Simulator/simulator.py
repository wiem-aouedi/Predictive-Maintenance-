print("DEBUG: file is executing", flush=True)

from datetime import datetime, timedelta, timezone
import traceback
import numpy as np
from .machine import Machine
from database.supabase_client import supabase
print("DEBUG: imports succeeded", flush=True)

NUM_MACHINES = 100
CYCLE_INTERVAL = timedelta(hours=1)
BATCH_SIZE = 1000
MAX_CYCLES = 10000
INSTALL_SPREAD_DAYS = 180 
PROJECT_START = datetime(2025, 1, 1, tzinfo=timezone.utc)
install_rng = np.random.default_rng(42)  # separate, fixed seed just for install-date spread


def create_machines(n: int) -> list[Machine]:
    machines = []
    for i in range(1, n + 1):
        offset_days = install_rng.uniform(0, INSTALL_SPREAD_DAYS)
        install_dt = PROJECT_START + timedelta(days=offset_days)
        machines.append(
            Machine(
                machine_id=i,
                machine_name=f"Machine-{i:03d}",
                installation_datetime=install_dt,
                seed=i,
            )
        )
    return machines

def register_machines(machines: list[Machine]):
    rows = [
        {
            "id": m.machine_id,
            "machine_name": m.machine_name,
            "installation_date": m.installation_date,
            "status": m.status,
        }
        for m in machines
    ]
    resp = supabase.table("machines").upsert(rows).execute()
    print(f"DEBUG: register_machines response: {resp}", flush=True)



def flush_batch(batch: list[dict]):
    if not batch:
        print("DEBUG: flush_batch called with empty batch, skipping", flush=True)
        return
    resp = supabase.table("sensor_data").insert(batch).execute()
    print(f"Inserted {len(batch)} rows.", flush=True)



def update_machine_statuses(machines: list[Machine]):
    for m in machines:
        supabase.table("machines").update({"status": m.status}).eq("id", m.machine_id).execute()


def run_simulation(machines: list[Machine]):
    print("DEBUG: entering run_simulation", flush=True)

    batch = []

    for m in machines:

        cycle = 0

        while not m.done and cycle < MAX_CYCLES:

            cycle += 1

            reading = m.step()

            reading["timestamp"] = (
                m.installation_datetime +
                m.t * CYCLE_INTERVAL
            ).isoformat()

            batch.append(reading)

            if len(batch) >= BATCH_SIZE:
                flush_batch(batch)
                batch = []

    flush_batch(batch)

    print("DEBUG: exiting run_simulation", flush=True)

if __name__ == "__main__":
    try:
        print("DEBUG: entering main", flush=True)
        machines = create_machines(NUM_MACHINES)
        print(f"DEBUG: created {len(machines)} machines", flush=True)
        register_machines(machines)
        print("DEBUG: machines registered", flush=True)
        run_simulation(machines)
        print("DEBUG: simulation finished", flush=True)
        update_machine_statuses(machines)
        print("Simulation complete.", flush=True)
    except Exception:
        print("DEBUG: an exception was raised:", flush=True)
        traceback.print_exc()