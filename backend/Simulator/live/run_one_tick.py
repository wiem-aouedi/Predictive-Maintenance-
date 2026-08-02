from .live_fleet import (
    create_live_machines,
    register_live_machines,
    init_live_state,
    live_fleet_already_exists,
    frozen_fleet_migrated,
    migrate_frozen_fleet_to_live_state,
)
from .live_tick import tick


def bootstrap_if_needed():
    """
    First time ever run:
      - migrate frozen Fleet A (1-100) into machine_live_state as 'done',
        so tick()'s revival logic can pick them up
      - create the 20 live Fleet B machines (101-120)
    Every subsequent run: both checks are idempotent, so this does nothing.
    """
    if not frozen_fleet_migrated():
        print("DEBUG: frozen fleet not yet migrated, migrating now.", flush=True)
        migrate_frozen_fleet_to_live_state()

    if not live_fleet_already_exists():
        print("DEBUG: no live Fleet B found, creating one.", flush=True)
        machines = create_live_machines()
        register_live_machines(machines)
        init_live_state(machines)
        print(f"DEBUG: created {len(machines)} live machines.", flush=True)


def main():
    bootstrap_if_needed()
    tick()


if __name__ == "__main__":
    main()