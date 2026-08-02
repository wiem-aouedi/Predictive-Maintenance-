import json
from pathlib import Path

families = [
    {
        "family_id": "F001",
        "name": "Industrial Electric Motors",
        "series": "EM-500",
        "machines": list(range(1, 21))
    },
    {
        "family_id": "F002",
        "name": "Centrifugal Pumps",
        "series": "CP-200",
        "machines": list(range(21, 41))
    },
    {
        "family_id": "F003",
        "name": "Rotary Air Compressors",
        "series": "AC-300",
        "machines": list(range(41, 61))
    },
    {
        "family_id": "F004",
        "name": "Hydraulic Power Units",
        "series": "HP-400",
        "machines": list(range(61, 81))
    },
    {
        "family_id": "F005",
        "name": "Industrial Ventilation Fans",
        "series": "VF-150",
        "machines": list(range(81, 101))
    }
]

output = Path("../data/machine_families.json")

with open(output, "w") as f:
    json.dump(families, f, indent=4)

print("Machine families created.")