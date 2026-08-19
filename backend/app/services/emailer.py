import os
import smtplib
from email.message import EmailMessage


def _config() -> dict:
    return {
        "host": os.environ.get("SMTP_HOST"),
        "port": int(os.environ.get("SMTP_PORT", 587)),
        "user": os.environ.get("SMTP_USER"),
        "password": os.environ.get("SMTP_PASSWORD"),
        "recipient": os.environ.get("ALERT_RECIPIENT_EMAIL"),
    }


def is_email_configured() -> bool:
    cfg = _config()
    return all([cfg["host"], cfg["user"], cfg["password"], cfg["recipient"]])


def send_alert_digest_email(machines: list[dict]) -> None:
    """
    Sends ONE email covering every machine that newly entered (or escalated
    within) an alert status in the same check_alerts() run - a recap rather
    than one email per machine, so a burst of simultaneous transitions
    doesn't flood the inbox. Checks that happen further apart in time still
    produce their own separate emails, since each is a separate call with
    its own set of newly-alerting machines.

    Deliberately contains no diagnosis or reasoning - the engineer is
    directed into the platform to ask the agent, which is where the
    explanation lives.

    machines: list of {"machine_id", "machine_label", "status"} dicts.
    Blocking (smtplib); callers should run it via asyncio.to_thread.
    """
    cfg = _config()
    if not is_email_configured():
        raise RuntimeError("SMTP settings or ALERT_RECIPIENT_EMAIL are not configured in .env")
    if not machines:
        return

    base_url = os.environ.get("FRONTEND_BASE_URL", "http://localhost:5173")

    if len(machines) == 1:
        m = machines[0]
        subject = f"[{m['status'].upper()}] {m['machine_label']} requires attention"
    else:
        subject = f"[ALERT] {len(machines)} machines require attention"

    lines = [
        f"- {m['machine_label']} -> {m['status'].upper()}: {base_url}/machines/{m['machine_id']}"
        for m in machines
    ]

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = cfg["user"]
    message["To"] = cfg["recipient"]
    message.set_content(
        "The following machine(s) have moved into an alert status:\n\n"
        + "\n".join(lines)
        + "\n\nPlease check each machine and ask the AI assistant for details on what is "
        "happening and what it recommends.\n\n"
        "-- Predictive Maintenance Platform"
    )

    with smtplib.SMTP(cfg["host"], cfg["port"]) as server:
        server.starttls()
        server.login(cfg["user"], cfg["password"])
        server.send_message(message)