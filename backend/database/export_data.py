from pathlib import Path
import pandas as pd

from database.supabase_client import supabase


# ==========================================================
# Paths
# ==========================================================

PROJECT_ROOT = Path(__file__).resolve().parent.parent

RAW_DATA_DIR = PROJECT_ROOT / "data" / "raw"
RAW_DATA_DIR.mkdir(parents=True, exist_ok=True)

SENSOR_CSV = RAW_DATA_DIR / "sensor_data_raw.csv"
MACHINES_CSV = RAW_DATA_DIR / "machines.csv"


# ==========================================================
# Fetch functions
# ==========================================================

def fetch_table(table_name: str, page_size: int = 1000, columns: str = "*") -> pd.DataFrame:
    """
    Download an entire Supabase table using pagination.
    """

    all_rows = []
    start = 0

    while True:

        end = start + page_size - 1

        response = (
            supabase
            .table(table_name)
            .select(columns)
            .order("id")              # deterministic pagination
            .range(start, end)
            .execute()
        )

        rows = response.data

        if not rows:
            break

        all_rows.extend(rows)

        print(f"{table_name}: downloaded {len(all_rows):,} rows", end="\r")

        if len(rows) < page_size:
            break

        start += page_size

    print()

    return pd.DataFrame(all_rows)


def fetch_sensor_data() -> pd.DataFrame:

    df = fetch_table("sensor_data")

    df["timestamp"] = pd.to_datetime(df["timestamp"])

    df = (
        df
        .sort_values(["machine_id", "timestamp"])
        .reset_index(drop=True)
    )

    return df


def fetch_machines() -> pd.DataFrame:

    return (
        fetch_table("machines")
        .sort_values("id")
        .reset_index(drop=True)
    )


# ==========================================================
# Export
# ==========================================================

def export_data():

    print("=" * 60)
    print("EXPORTING DATA FROM SUPABASE")
    print("=" * 60)

    print("\nDownloading sensor_data...")
    sensor_df = fetch_sensor_data()

    print("\nDownloading machines...")
    machines_df = fetch_machines()

    print("\nSaving CSV files...")

    sensor_df.to_csv(SENSOR_CSV, index=False)
    machines_df.to_csv(MACHINES_CSV, index=False)

    print("\nExport completed successfully.\n")

    print("=" * 60)
    print("SUMMARY")
    print("=" * 60)

    print(f"Sensor rows      : {len(sensor_df):,}")
    print(f"Machines         : {len(machines_df):,}")
    print(f"Unique machines  : {sensor_df['machine_id'].nunique():,}")
    print(f"Time range start : {sensor_df['timestamp'].min()}")
    print(f"Time range end   : {sensor_df['timestamp'].max()}")

    print("\nDuplicate checks")

    print(f"Duplicate IDs                    : {sensor_df['id'].duplicated().sum()}")

    print(
        f"Duplicate (machine_id,timestamp) : "
        f"{sensor_df.duplicated(subset=['machine_id','timestamp']).sum()}"
    )

    print("\nFiles created:")
    print(f" - {SENSOR_CSV}")
    print(f" - {MACHINES_CSV}")


# ==========================================================
# Main
# ==========================================================

if __name__ == "__main__":
    export_data()