import time
from .run_one_tick import main as tick_once
from . import live_config as cfg
import traceback



if __name__ == "__main__":
    print("DEBUG: starting live simulation loop. Press Ctrl+C to stop.", flush=True)
    while True:
        try:
            tick_once()
        except Exception:
            print("DEBUG: tick failed, will retry next interval:", flush=True)
            traceback.print_exc()
        time.sleep(cfg.TICK_INTERVAL_SECONDS)