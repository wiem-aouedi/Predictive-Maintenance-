from datetime import datetime, timezone

LIVE_FLEET_START_ID = 101
NUM_LIVE_MACHINES   = 20

LIVE_INSTALL_START = datetime(2026, 5, 16, tzinfo=timezone.utc)
LIVE_INSTALL_SPREAD_DAYS = 30

TICK_INTERVAL_SECONDS = 60
CYCLES_PER_TICK        = 1

# --- Revival settings (frozen Fleet A machines coming back online as repaired units) ---
FROZEN_FLEET_START_ID = 1
FROZEN_FLEET_END_ID   = 100

REVIVAL_GAP_MIN_DAYS = 7    # min simulated downtime before a repaired unit restarts
REVIVAL_GAP_MAX_DAYS = 14
REVIVAL_SEED_OFFSET  = 5000  # keeps revival seeds distinct from machine_id / live seed ranges
MAX_REVIVALS         = None  # None = repair indefinitely; set an int to retire after N repairs
# the max revivals will be calculated with a replacement score , here is a new idea to add