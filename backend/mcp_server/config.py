from pathlib import Path
from dotenv import load_dotenv
import os

# Project root
PROJECT_ROOT = Path(__file__).resolve().parent.parent

# Load .env
load_dotenv(PROJECT_ROOT / ".env")

# Supabase
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    raise RuntimeError(
        "Missing Supabase credentials. "
        "Check your .env file and mcp_server/config.py."
    )