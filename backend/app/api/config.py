import os
from fastapi import APIRouter

from app.host.llm_host import (
    GEMINI_MODEL,
    MAX_TOOL_ITERATIONS,
    MAX_CONTEXT_TURNS,
    MAX_TOOL_RESULT_CHARS,
)
from app.services.emailer import is_email_configured
from app.services.alert_scheduler import DEFAULT_INTERVAL_SECONDS
from ML.predictor import get_model
from mcp_server.config import SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

router = APIRouter()


def _mask_email(email: str | None) -> str | None:
    """Reveals just enough to confirm which address is configured without
    exposing it in full - e.g. wiem.aouadi@ept.ucar.tn -> wi***@ept.ucar.tn."""
    if not email:
        return None
    local, sep, domain = email.partition("@")
    if not sep:
        return "***"
    visible = local[:2] if len(local) > 2 else local[:1]
    return f"{visible}***@{domain}"


@router.get("/config")
async def get_config():
    """
    Read-only, non-secret runtime configuration for the Settings page.
    Values are pulled from the same constants the app actually runs on
    (llm_host, the loaded prediction model, the alert scheduler) rather than
    duplicated here, so this can't drift out of sync with reality. Anything
    that is a credential is reported as a configured/not-configured boolean
    instead of its value; ALERT_RECIPIENT_EMAIL is partially masked rather
    than fully hidden, since seeing which address is set is useful.
    """
    model = get_model()

    return {
        "llm": {
            "provider": "Gemini (OpenAI-compatible endpoint)",
            "model": GEMINI_MODEL,
            "api_key_configured": bool(os.environ.get("GEMINI_API_KEY")),
        },
        "agent_limits": {
            "max_tool_iterations": MAX_TOOL_ITERATIONS,
            "max_context_turns": MAX_CONTEXT_TURNS,
            "max_tool_result_chars": MAX_TOOL_RESULT_CHARS,
        },
        "prediction": model.info(),
        "alerts": {
            "email_configured": is_email_configured(),
            "smtp_host_configured": bool(os.environ.get("SMTP_HOST")),
            "smtp_user_configured": bool(os.environ.get("SMTP_USER")),
            "smtp_password_configured": bool(os.environ.get("SMTP_PASSWORD")),
            "smtp_port": int(os.environ.get("SMTP_PORT", 587)),
            "recipient_email": _mask_email(os.environ.get("ALERT_RECIPIENT_EMAIL")),
            "poll_interval_seconds": int(
                os.environ.get("ALERT_POLL_INTERVAL_SECONDS", DEFAULT_INTERVAL_SECONDS)
            ),
        },
        "database": {
            "provider": "Supabase",
            "url": SUPABASE_URL,
            "service_role_key_configured": bool(SUPABASE_SERVICE_ROLE_KEY),
        },
    }
