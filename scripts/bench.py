#!/usr/bin/env python3
import subprocess
import os
import sys

def run_bench():
    print("Executing Lethe Performance SLA Benchmark Suite...")
    
    # Path to CLI tool
    cli_path = os.path.join(os.path.dirname(__file__), "..", "cli", "dist", "index.js")
    
    if not os.path.exists(cli_path):
        print(f"Error: CLI build not found at {cli_path}. Please build the CLI first.")
        sys.exit(1)

    try:
        # Run CLI bench command
        result = subprocess.run(
            ["node", cli_path, "bench", "--runs", "100"],
            capture_output=True,
            text=True,
            check=True
        )
        print(result.stdout)
    except subprocess.CalledProcessError as e:
        print(f"Error executing benchmark: {e}")
        print(e.stderr)
        sys.exit(1)

if __name__ == "__main__":
    run_bench()
