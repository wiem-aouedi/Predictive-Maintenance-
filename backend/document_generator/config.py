"""
Configuration for the synthetic document generator.
"""

from pathlib import Path

# =============================================================================
# Project paths
# =============================================================================

PROJECT_ROOT = Path(__file__).resolve().parent.parent

DATA_DIR = PROJECT_ROOT / "data"

RAW_DATA_DIR = DATA_DIR / "raw"

PROCESSED_DATA_DIR = DATA_DIR / "processed"

OUTPUT_DIR = PROJECT_ROOT / "document_generator" / "output"

# =============================================================================
# Input files
# =============================================================================

MACHINES_CSV = RAW_DATA_DIR / "machines.csv"

SENSOR_DATA_CSV = RAW_DATA_DIR / "sensor_data_raw.csv"

# =============================================================================
# Metadata
# =============================================================================

FACTORY_JSON = DATA_DIR / "factory.json"

FAMILIES_JSON = DATA_DIR / "machine_families.json"

MACHINES_JSON = DATA_DIR / "machines.json"

# =============================================================================
# Generated specifications
# =============================================================================

MACHINE_SPECIFICATIONS_JSON = (
    PROCESSED_DATA_DIR / "machine_specifications.json"
)

FAMILY_SPECIFICATIONS_JSON = (
    PROCESSED_DATA_DIR / "family_specifications.json"
)

OPERATING_RANGES_JSON = (
    PROCESSED_DATA_DIR / "operating_ranges.json"
)

FAILURE_STATISTICS_JSON = (
    PROCESSED_DATA_DIR / "failure_statistics.json"
)

# =============================================================================

OUTPUT_DIR.mkdir(exist_ok=True)

PROCESSED_DATA_DIR.mkdir(exist_ok=True)