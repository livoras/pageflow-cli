#!/bin/bash

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== Stopping Remote Chrome, socat and autossh ==="
echo ""

# Step 1: Stop socat
echo "[1/3] Stopping socat..."
bash "${SCRIPT_DIR}/stop-socat.sh" "$1"
echo ""

# Step 2: Stop remote Chrome
echo "[2/3] Stopping remote Chrome..."
bash "${SCRIPT_DIR}/stop-remote-chrome.sh" "$1"
echo ""

# Step 3: Stop autossh tunnel
echo "[3/3] Stopping autossh tunnel..."
bash "${SCRIPT_DIR}/stop-autossh.sh" "$1"
echo ""

echo "=== Remote services stopped ==="
