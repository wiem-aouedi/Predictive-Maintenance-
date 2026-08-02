import subprocess

scripts = [
    "generators/generate_factory.py",
    "generators/generate_families.py",
    "generators/generate_machines.py",
]

for script in scripts:
    subprocess.run(["python", script])

print("\nDocument generation metadata created successfully.")