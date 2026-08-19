import asyncio
import logging
import os

from app.services.emailer import is_email_configured

logger = logging.getLogger(__name__)

DEFAULT_INTERVAL_SECONDS = 60


async def alert_watcher_loop() -> None:
    """
    Runs for the lifetime of the FastAPI process, automatically sending an
    alert digest whenever a machine newly enters (or escalates within) a
    warning/critical status - no one needs to click "Send alerts" for this
    to happen. Polls at ALERT_POLL_INTERVAL_SECONDS (default 60s, matching
    the live simulator's own tick interval). Reuses run_alert_check(), so
    the same one-email-per-batch behavior applies here too.

    Import of run_alert_check is deferred to avoid a circular import at
    module load time (app.api.alerts is wired up before this loop starts).
    """
    from app.api.alerts import run_alert_check

    interval_seconds = int(os.environ.get("ALERT_POLL_INTERVAL_SECONDS", DEFAULT_INTERVAL_SECONDS))

    while True:
        try:
            if is_email_configured():
                result = await run_alert_check()
                if result["sent"]:
                    logger.info(
                        "Alert watcher sent a digest for %d machine(s): %s",
                        len(result["sent"]),
                        ", ".join(m["machine_name"] for m in result["sent"]),
                    )
                if result["failed"]:
                    logger.warning(
                        "Alert watcher failed to send for %d machine(s)", len(result["failed"])
                    )
        except Exception:
            logger.exception("Alert watcher check failed")

        await asyncio.sleep(interval_seconds)
