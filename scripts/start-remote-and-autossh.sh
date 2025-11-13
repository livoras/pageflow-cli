#!/bin/bash

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== Starting Remote Chrome, socat and autossh ==="
echo ""

# Step 1: Start autossh tunnel
echo "[1/3] Starting autossh tunnel..."
bash "${SCRIPT_DIR}/start-autossh.sh" "$1"
if [ $? -ne 0 ]; then
  echo "Failed to start autossh"
  exit 1
fi
echo ""

# Step 2: Start remote Chrome
echo "[2/3] Starting remote Chrome..."
bash "${SCRIPT_DIR}/start-remote-chrome.sh" "$1"
if [ $? -ne 0 ]; then
  echo "Failed to start remote Chrome"
  exit 1
fi
echo ""

# Step 3: Start socat port forwarding
echo "[3/3] Starting socat port forwarding..."
bash "${SCRIPT_DIR}/start-socat.sh" "$1"
if [ $? -ne 0 ]; then
  echo "Failed to start socat"
  exit 1
fi
echo ""

echo "=== Remote services started successfully ==="
echo ""
echo "  Chrome CDP (local): http://localhost:9222"
echo "  Chrome CDP (Docker): http://host.docker.internal:19222"
echo ""
echo "Next: Run /start to start local backend and frontend"
