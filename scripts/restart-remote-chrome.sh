#!/bin/bash

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== Restarting All Remote Services ==="
echo ""

# Stop all remote services
bash "${SCRIPT_DIR}/stop-remote-and-autossh.sh" "$1"

echo ""
echo "Waiting 2 seconds..."
sleep 2
echo ""

# Start all remote services
bash "${SCRIPT_DIR}/start-remote-and-autossh.sh" "$1"
