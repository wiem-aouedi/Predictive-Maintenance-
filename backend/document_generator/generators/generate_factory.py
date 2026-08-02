import json
from pathlib import Path

factory = {
    "company": "Atlas Industrial Manufacturing",
    "abbreviation": "AIM",
    "plant": "Production Plant A",
    "location": "Tunis Industrial Zone",
    "industry": "Precision Mechanical Manufacturing",
    "operation": "24/7",
    "maintenance_strategy": "Predictive Maintenance",
    "monitoring_frequency": "Hourly",
    "total_machines": 100,
    "sensors": [
        "Temperature",
        "Vibration",
        "Pressure",
        "Rotational Speed",
        "Current"
    ]
}

output = Path("../data/factory.json")
output.parent.mkdir(parents=True, exist_ok=True)

with open(output, "w") as f:
    json.dump(factory, f, indent=4)

print("Factory created.")