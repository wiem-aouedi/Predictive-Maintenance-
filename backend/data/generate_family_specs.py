"""
generate_family_specs.py

One-time (idempotent, safe to re-run) script that:
  1. Backfills the `machines` table with serial number, manufacturer,
     family, rated parameters, and maintenance intervals, derived from
     machine_families.json.
  2. Populates the four family-level reference tables:
     sensor_specifications, spare_parts, maintenance_tasks, failure_modes.

Machine simulator has no per-family differentiation (machine.py assigns
parameters per machine_id independently), so these values are written as
industry-plausible per family TYPE rather than derived from simulator
internals -- same principle already used for the (now-abandoned) manual
generation plan.

For the sensor specifications, the min/max/critical_threshold/warning threshold are all derived from the simulator values

"""

import json
from pathlib import Path
from database.supabase_client import supabase

FAMILIES_PATH = Path(__file__).parent / "machine_families.json"

SENSOR_NAMES = ["temperature", "rotational_speed", "vibration", "pressure", "current"]

# ============================================================================
# Per-family machine-level specs (rated parameters + maintenance intervals)
# ============================================================================

FAMILY_MACHINE_SPECS = {
    "F001": {  # Industrial Electric Motors, EM-500
        "manufacturer": "Voltec Industrial",
        "rated_power_kw": 75.0,
        "rated_voltage": 400.0,
        "rated_speed_rpm": 1800,
        "bearing_type": "Deep groove ball bearing (6316-2Z)",
        "lubrication_type": "Grease",
        "recommended_oil": "Mobil Polyrex EM",
        "inspection_interval_days": 30,
        "lubrication_interval_hours": 2000,
        "bearing_replacement_hours": 25000,
    },
    "F002": {  # Centrifugal Pumps, CP-200
        "manufacturer": "HydroFlow Systems",
        "rated_power_kw": 45.0,
        "rated_voltage": 400.0,
        "rated_speed_rpm": 2900,
        "bearing_type": "Angular contact ball bearing (7310-BEP)",
        "lubrication_type": "Oil bath",
        "recommended_oil": "Shell Turbo T68",
        "inspection_interval_days": 21,
        "lubrication_interval_hours": 1500,
        "bearing_replacement_hours": 20000,
    },
    "F003": {  # Rotary Air Compressors, AC-300
        "manufacturer": "AeroCompress Corp",
        "rated_power_kw": 90.0,
        "rated_voltage": 400.0,
        "rated_speed_rpm": 3000,
        "bearing_type": "Cylindrical roller bearing (NU220)",
        "lubrication_type": "Forced oil circulation",
        "recommended_oil": "Chevron Compressor Oil ISO 46",
        "inspection_interval_days": 14,
        "lubrication_interval_hours": 1000,
        "bearing_replacement_hours": 18000,
    },
    "F004": {  # Hydraulic Power Units, HP-400
        "manufacturer": "PowerHydraulics Ltd",
        "rated_power_kw": 55.0,
        "rated_voltage": 400.0,
        "rated_speed_rpm": 1500,
        "bearing_type": "Tapered roller bearing (32310)",
        "lubrication_type": "Hydraulic fluid (shared circuit)",
        "recommended_oil": "Mobil DTE 25",
        "inspection_interval_days": 30,
        "lubrication_interval_hours": 3000,
        "bearing_replacement_hours": 22000,
    },
    "F005": {  # Industrial Ventilation Fans, VF-150
        "manufacturer": "AirFlow Dynamics",
        "rated_power_kw": 22.0,
        "rated_voltage": 400.0,
        "rated_speed_rpm": 1450,
        "bearing_type": "Deep groove ball bearing (6212-2RS)",
        "lubrication_type": "Grease",
        "recommended_oil": "SKF LGHP 2",
        "inspection_interval_days": 45,
        "lubrication_interval_hours": 4000,
        "bearing_replacement_hours": 30000,
    },
}

# ============================================================================
# Sensor specifications per family
#
# Numeric fields (minimum/maximum/warning/critical/failure/tolerance) are
# empirically derived from Fleet A's actual pre-failure sensor readings
# (min/max/avg_before_failure, queried directly from sensor_data) and from
# machine.py's own noise (sigma) constants -- NOT invented industry figures.
# Applied identically across all 5 families since machine.py assigns sensor
# parameters (T0/kT, RPM0/kR, etc.) per machine_id independently, with no
# per-family differentiation in the simulator itself. Only description/unit/
# sampling_frequency/accuracy vary per family for narrative purposes.
#
# Direction of degradation per sensor (from machine.py):
#   increasing with degradation: temperature, vibration, current
#   decreasing with degradation: rotational_speed, pressure
# so "warning" -> "critical" -> "failure" moves in the direction of rising
# degradation for each sensor, not always numerically ascending.
# ============================================================================

_EMPIRICAL_SENSOR_BANDS = {
    "temperature": {
        "unit": "C", "minimum": 20, "maximum": 130,
        "warning_threshold": 79.672, "critical_threshold": 106.155, "failure_threshold": 125.142,
        "tolerance": 0.5, "sampling_frequency": "1/hour", "accuracy": "+/-0.5 C",
    },
    "rotational_speed": {
        "unit": "RPM", "minimum": 1200, "maximum": 1900,
        "warning_threshold": 1620.307, "critical_threshold": 1514.554, "failure_threshold": 1384.458,
        "tolerance": 10.0, "sampling_frequency": "1/hour", "accuracy": "+/-10 RPM",
    },
    "vibration": {
        "unit": "mm/s RMS", "minimum": 0, "maximum": 3.0,
        "warning_threshold": 1.2604, "critical_threshold": 1.8825, "failure_threshold": 2.44,
        "tolerance": 0.01, "sampling_frequency": "1/hour", "accuracy": "+/-0.01 mm/s",
    },
    "pressure": {
        "unit": "bar", "minimum": 2.0, "maximum": 6.5,
        "warning_threshold": 5.219, "critical_threshold": 4.098, "failure_threshold": 2.759,
        "tolerance": 0.1, "sampling_frequency": "1/hour", "accuracy": "+/-0.1 bar",
    },
    "current": {
        "unit": "A", "minimum": 8, "maximum": 18,
        "warning_threshold": 10.962, "critical_threshold": 13.936, "failure_threshold": 16.478,
        "tolerance": 0.2, "sampling_frequency": "1/hour", "accuracy": "+/-0.2 A",
    },
}

_FAMILY_SENSOR_DESCRIPTIONS = {
    "F001": {
        "temperature": "Stator winding temperature.",
        "rotational_speed": "Shaft rotational speed; declines as bearing wear increases drag.",
        "vibration": "Housing vibration per ISO 10816.",
        "pressure": "Cooling jacket pressure.",
        "current": "Stator phase current.",
    },
    "F002": {
        "temperature": "Bearing housing temperature.",
        "rotational_speed": "Impeller shaft speed.",
        "vibration": "Casing vibration; cavitation shows as high-frequency spikes.",
        "pressure": "Pump discharge pressure.",
        "current": "Motor phase current.",
    },
    "F003": {
        "temperature": "Discharge air temperature.",
        "rotational_speed": "Rotor screw speed.",
        "vibration": "Compressor block vibration.",
        "pressure": "Discharge pressure.",
        "current": "Motor phase current.",
    },
    "F004": {
        "temperature": "Hydraulic fluid reservoir temperature.",
        "rotational_speed": "Pump drive shaft speed.",
        "vibration": "Pump/motor coupling vibration.",
        "pressure": "System hydraulic pressure.",
        "current": "Motor phase current.",
    },
    "F005": {
        "temperature": "Motor housing temperature.",
        "rotational_speed": "Fan shaft speed.",
        "vibration": "Fan housing vibration; imbalance shows as rising RMS.",
        "pressure": "Duct static pressure.",
        "current": "Motor phase current.",
    },
}

SENSOR_SPECIFICATIONS = {
    family_id: [
        {
            "sensor_name": sensor_name,
            **_EMPIRICAL_SENSOR_BANDS[sensor_name],
            "description": _FAMILY_SENSOR_DESCRIPTIONS[family_id][sensor_name],
        }
        for sensor_name in SENSOR_NAMES
    ]
    for family_id in _FAMILY_SENSOR_DESCRIPTIONS
}
# ============================================================================
# Spare parts per family
# ============================================================================

SPARE_PARTS = {
    "F001": [
        {"part_name": "Deep groove ball bearing 6316-2Z", "manufacturer": "SKF",
         "part_number": "6316-2Z", "stock_quantity": 8, "lead_time": "5 business days",
         "recommended_replacement": "Every 25000 operating hours"},
        {"part_name": "Stator winding insulation kit", "manufacturer": "Voltec Industrial",
         "part_number": "VI-INS-500", "stock_quantity": 3, "lead_time": "10 business days",
         "recommended_replacement": "On failure or major rewind"},
        {"part_name": "Cooling fan assembly", "manufacturer": "Voltec Industrial",
         "part_number": "VI-FAN-500", "stock_quantity": 5, "lead_time": "7 business days",
         "recommended_replacement": "Every 40000 operating hours"},
    ],
    "F002": [
        {"part_name": "Angular contact bearing 7310-BEP", "manufacturer": "SKF",
         "part_number": "7310-BEP", "stock_quantity": 6, "lead_time": "5 business days",
         "recommended_replacement": "Every 20000 operating hours"},
        {"part_name": "Mechanical seal kit", "manufacturer": "HydroFlow Systems",
         "part_number": "HF-SEAL-200", "stock_quantity": 10, "lead_time": "3 business days",
         "recommended_replacement": "Every 8000 operating hours"},
        {"part_name": "Impeller, bronze", "manufacturer": "HydroFlow Systems",
         "part_number": "HF-IMP-200", "stock_quantity": 4, "lead_time": "14 business days",
         "recommended_replacement": "On cavitation damage or every 30000 hours"},
    ],
    "F003": [
        {"part_name": "Cylindrical roller bearing NU220", "manufacturer": "FAG",
         "part_number": "NU220-E", "stock_quantity": 5, "lead_time": "6 business days",
         "recommended_replacement": "Every 18000 operating hours"},
        {"part_name": "Air/oil separator element", "manufacturer": "AeroCompress Corp",
         "part_number": "AC-SEP-300", "stock_quantity": 12, "lead_time": "2 business days",
         "recommended_replacement": "Every 4000 operating hours"},
        {"part_name": "Intake valve kit", "manufacturer": "AeroCompress Corp",
         "part_number": "AC-INT-300", "stock_quantity": 6, "lead_time": "5 business days",
         "recommended_replacement": "Every 12000 operating hours"},
    ],
    "F004": [
        {"part_name": "Tapered roller bearing 32310", "manufacturer": "Timken",
         "part_number": "32310", "stock_quantity": 6, "lead_time": "7 business days",
         "recommended_replacement": "Every 22000 operating hours"},
        {"part_name": "Hydraulic filter element", "manufacturer": "PowerHydraulics Ltd",
         "part_number": "PH-FIL-400", "stock_quantity": 15, "lead_time": "2 business days",
         "recommended_replacement": "Every 1000 operating hours"},
        {"part_name": "Pressure relief valve", "manufacturer": "PowerHydraulics Ltd",
         "part_number": "PH-PRV-400", "stock_quantity": 4, "lead_time": "10 business days",
         "recommended_replacement": "On failure or every 15000 hours"},
    ],
    "F005": [
        {"part_name": "Deep groove ball bearing 6212-2RS", "manufacturer": "SKF",
         "part_number": "6212-2RS", "stock_quantity": 10, "lead_time": "4 business days",
         "recommended_replacement": "Every 30000 operating hours"},
        {"part_name": "Fan blade assembly", "manufacturer": "AirFlow Dynamics",
         "part_number": "AF-BLD-150", "stock_quantity": 3, "lead_time": "12 business days",
         "recommended_replacement": "On imbalance/damage"},
        {"part_name": "Drive belt set", "manufacturer": "AirFlow Dynamics",
         "part_number": "AF-BELT-150", "stock_quantity": 8, "lead_time": "3 business days",
         "recommended_replacement": "Every 6000 operating hours"},
    ],
}

# ============================================================================
# Maintenance tasks per family
# ============================================================================

MAINTENANCE_TASKS = {
    "F001": [
        {"task_name": "Bearing lubrication", "frequency": "Every 2000 hours",
         "estimated_duration": "30 min", "required_tools": "Grease gun, torque wrench",
         "required_spare_parts": "None (grease only)", "required_skill": "Technician",
         "procedure_summary": "Purge old grease, inject fresh grease per bearing spec, check for excess temperature after."},
        {"task_name": "Winding insulation resistance test", "frequency": "Every 6 months",
         "estimated_duration": "1 hour", "required_tools": "Megohmmeter",
         "required_spare_parts": "None", "required_skill": "Electrician",
         "procedure_summary": "Isolate motor, measure insulation resistance phase-to-ground, compare to baseline."},
    ],
    "F002": [
        {"task_name": "Mechanical seal inspection", "frequency": "Every 8000 hours",
         "estimated_duration": "45 min", "required_tools": "Basic hand tools",
         "required_spare_parts": "Mechanical seal kit (if leaking)", "required_skill": "Technician",
         "procedure_summary": "Inspect for leakage at seal face, replace if wear indicators exceed limit."},
        {"task_name": "Vibration analysis", "frequency": "Every 3 months",
         "estimated_duration": "30 min", "required_tools": "Vibration analyzer",
         "required_spare_parts": "None", "required_skill": "Vibration technician",
         "procedure_summary": "Collect spectrum data at drive-end and non-drive-end, compare to baseline for bearing/cavitation signatures."},
    ],
    "F003": [
        {"task_name": "Air/oil separator replacement", "frequency": "Every 4000 hours",
         "estimated_duration": "1 hour", "required_tools": "Wrench set",
         "required_spare_parts": "Air/oil separator element", "required_skill": "Technician",
         "procedure_summary": "Depressurize unit, remove and replace separator element, verify oil carryover after restart."},
        {"task_name": "Intake valve service", "frequency": "Every 12000 hours",
         "estimated_duration": "2 hours", "required_tools": "Wrench set, gasket scraper",
         "required_spare_parts": "Intake valve kit", "required_skill": "Technician",
         "procedure_summary": "Inspect valve plate and seat for wear, replace gaskets and springs as needed."},
    ],
    "F004": [
        {"task_name": "Hydraulic filter change", "frequency": "Every 1000 hours",
         "estimated_duration": "20 min", "required_tools": "Filter wrench",
         "required_spare_parts": "Hydraulic filter element", "required_skill": "Technician",
         "procedure_summary": "Depressurize circuit, replace filter element, check for contamination in old element."},
        {"task_name": "Pressure relief valve test", "frequency": "Every 6 months",
         "estimated_duration": "45 min", "required_tools": "Pressure gauge kit",
         "required_spare_parts": "None (unless failed)", "required_skill": "Hydraulic technician",
         "procedure_summary": "Test crack/reseat pressure against spec, adjust or replace if out of tolerance."},
    ],
    "F005": [
        {"task_name": "Bearing lubrication", "frequency": "Every 4000 hours",
         "estimated_duration": "20 min", "required_tools": "Grease gun",
         "required_spare_parts": "None (grease only)", "required_skill": "Technician",
         "procedure_summary": "Apply fresh grease to fan and motor bearings per interval, monitor temperature rise."},
        {"task_name": "Drive belt inspection", "frequency": "Every 6000 hours",
         "estimated_duration": "30 min", "required_tools": "Tension gauge",
         "required_spare_parts": "Drive belt set (if worn)", "required_skill": "Technician",
         "procedure_summary": "Check belt tension and wear, replace as a set if cracking or glazing is present."},
    ],
}

# ============================================================================
# Failure modes per family
# ============================================================================

FAILURE_MODES = {
    "F001": [
        {"failure": "Bearing wear/seizure",
         "possible_causes": "Lubrication starvation, contamination, overloading",
         "symptoms": "Rising vibration, rising temperature, declining rotational speed",
         "recommended_actions": "Schedule bearing replacement, inspect lubrication system",
         "severity": "High"},
        {"failure": "Winding insulation breakdown",
         "possible_causes": "Thermal aging, moisture ingress, voltage transients",
         "symptoms": "Rising current, rising temperature, insulation resistance drop",
         "recommended_actions": "De-energize immediately, perform insulation test, rewind or replace",
         "severity": "Critical"},
    ],
    "F002": [
        {"failure": "Cavitation damage",
         "possible_causes": "Insufficient suction pressure, entrained air, oversized flow demand",
         "symptoms": "High-frequency vibration spikes, pressure fluctuation, impeller erosion",
         "recommended_actions": "Check suction conditions, inspect impeller for pitting",
         "severity": "Medium"},
        {"failure": "Mechanical seal failure",
         "possible_causes": "Dry running, misalignment, seal face wear",
         "symptoms": "Visible leakage, temperature rise at seal housing",
         "recommended_actions": "Replace seal kit, verify shaft alignment",
         "severity": "Medium"},
    ],
    "F003": [
        {"failure": "Air/oil separator clogging",
         "possible_causes": "Extended service interval, contaminated oil",
         "symptoms": "Rising discharge temperature, oil carryover, pressure drop increase",
         "recommended_actions": "Replace separator element, check oil quality",
         "severity": "Medium"},
        {"failure": "Rotor/screw bearing failure",
         "possible_causes": "Lubrication breakdown, excessive discharge pressure",
         "symptoms": "Rising vibration, rising temperature, abnormal noise",
         "recommended_actions": "Shut down unit, inspect bearing and rotor clearance",
         "severity": "Critical"},
    ],
    "F004": [
        {"failure": "Hydraulic fluid contamination",
         "possible_causes": "Filter bypass, seal degradation, water ingress",
         "symptoms": "Erratic pressure, rising temperature, valve sticking",
         "recommended_actions": "Replace filter, sample and analyze fluid, flush system if severe",
         "severity": "High"},
        {"failure": "Pump/motor coupling wear",
         "possible_causes": "Misalignment, cyclic loading, lubrication loss",
         "symptoms": "Rising vibration, unusual noise, coupling heat",
         "recommended_actions": "Inspect and realign coupling, replace worn elements",
         "severity": "Medium"},
    ],
    "F005": [
        {"failure": "Fan blade imbalance",
         "possible_causes": "Blade erosion, debris buildup, blade damage",
         "symptoms": "Rising vibration RMS, audible imbalance noise",
         "recommended_actions": "Clean or replace blades, perform dynamic balancing",
         "severity": "Medium"},
        {"failure": "Drive belt failure",
         "possible_causes": "Belt aging, misalignment, over-tensioning",
         "symptoms": "Declining rotational speed, belt squeal, visible cracking",
         "recommended_actions": "Replace belt set, check pulley alignment",
         "severity": "Low"},
    ],
}


# ============================================================================
# Backfill machines table
# ============================================================================

def backfill_machines() -> None:
    families = json.loads(FAMILIES_PATH.read_text())

    existing = supabase.table("machines").select("id, machine_name, installation_date").execute()
    existing_by_id = {row["id"]: row for row in existing.data}

    rows = []
    for fam in families:
        family_id = fam["family_id"]
        series = fam["series"]
        specs = FAMILY_MACHINE_SPECS[family_id]

        for machine_id in fam["machines"]:
            existing_row = existing_by_id.get(machine_id)
            if existing_row is None:
                print(f"DEBUG: machine_id={machine_id} not found in machines table, skipping", flush=True)
                continue

            rows.append({
                "id": machine_id,
                "machine_name": existing_row["machine_name"],
                "installation_date": existing_row["installation_date"],
                "serial_number": f"{series}-{machine_id:04d}",
                "manufacturer": specs["manufacturer"],
                "family": family_id,
                "rated_power_kw": specs["rated_power_kw"],
                "rated_voltage": specs["rated_voltage"],
                "rated_speed_rpm": specs["rated_speed_rpm"],
                "bearing_type": specs["bearing_type"],
                "lubrication_type": specs["lubrication_type"],
                "recommended_oil": specs["recommended_oil"],
                "inspection_interval_days": specs["inspection_interval_days"],
                "lubrication_interval_hours": specs["lubrication_interval_hours"],
                "bearing_replacement_hours": specs["bearing_replacement_hours"],
            })

    for i in range(0, len(rows), 500):
        supabase.table("machines").upsert(rows[i:i + 500]).execute()

    print(f"DEBUG: backfilled {len(rows)} machines with family/spec metadata", flush=True)

# ============================================================================
# Populate catalog tables (family-level, not per-machine)
# ============================================================================

def populate_catalog_tables() -> None:
    sensor_rows = [
        {"family": fam_id, **spec}
        for fam_id, specs in SENSOR_SPECIFICATIONS.items()
        for spec in specs
    ]
    supabase.table("sensor_specifications").upsert(
        sensor_rows, on_conflict="family,sensor_name"
    ).execute()
    print(f"DEBUG: upserted {len(sensor_rows)} sensor_specifications rows", flush=True)

    parts_rows = [
        {"family": fam_id, **part}
        for fam_id, parts in SPARE_PARTS.items()
        for part in parts
    ]
    supabase.table("spare_parts").insert(parts_rows).execute()
    print(f"DEBUG: inserted {len(parts_rows)} spare_parts rows", flush=True)

    tasks_rows = [
        {"family": fam_id, **task}
        for fam_id, tasks in MAINTENANCE_TASKS.items()
        for task in tasks
    ]
    supabase.table("maintenance_tasks").insert(tasks_rows).execute()
    print(f"DEBUG: inserted {len(tasks_rows)} maintenance_tasks rows", flush=True)

    failures_rows = [
        {"family": fam_id, **fmode}
        for fam_id, fmodes in FAILURE_MODES.items()
        for fmode in fmodes
    ]
    supabase.table("failure_modes").insert(failures_rows).execute()
    print(f"DEBUG: inserted {len(failures_rows)} failure_modes rows", flush=True)


if __name__ == "__main__":
    backfill_machines()
    populate_catalog_tables()