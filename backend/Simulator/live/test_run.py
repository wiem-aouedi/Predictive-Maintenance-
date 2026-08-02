from .live_fleet import (
    create_live_machines,
    register_live_machines,
    init_live_state,
    live_fleet_already_exists,
    load_live_state,
)
from .live_tick import tick


def main():
    print("=== STEP 1: Check if live fleet already exists ===")
    exists = live_fleet_already_exists()
    print(f"live_fleet_already_exists() -> {exists}")

    if not exists:
        print("\n=== STEP 2: Creating the 20 live machines ===")
        machines = create_live_machines()
        for m in machines[:3]:  # just peek at the first 3, not all 20
            print(f"  id={m.machine_id}  name={m.machine_name}  install={m.installation_date}")
        print(f"  ... ({len(machines)} machines total)")

        register_live_machines(machines)
        print("Inserted into `machines` table.")

        init_live_state(machines)
        print("Inserted into `machine_live_state` table.")
    else:
        print("Fleet already exists, skipping creation.")

    print("\n=== STEP 3: State BEFORE tick ===")
    before = load_live_state()
    for row in sorted(before, key=lambda r: r["machine_id"])[:3]:
        print(f"  machine_id={row['machine_id']}  cycle_count={row['cycle_count']}  done={row['done']}")
    print(f"  ... ({len(before)} machines total)")

    print("\n=== STEP 4: Running tick() once ===")
    tick()

    print("\n=== STEP 5: State AFTER tick ===")
    after = load_live_state()
    for row in sorted(after, key=lambda r: r["machine_id"])[:3]:
        print(f"  machine_id={row['machine_id']}  cycle_count={row['cycle_count']}  done={row['done']}")
    print(f"  ... ({len(after)} machines total)")


if __name__ == "__main__":
    main()