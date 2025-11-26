#!/bin/bash

# Remote Chrome configuration
# 根据参数选择服务器（默认 tencent）
if [ "$1" = "ali" ]; then
    REMOTE_HOST="8.155.175.166"
    REMOTE_PORT="7070"
    REMOTE_USER="root"
else
    # 默认连接 tencent
    REMOTE_HOST="100.93.198.106"
    REMOTE_PORT="22"
    REMOTE_USER="root"
fi

DEBUG_PORT="9222"

echo "Starting autossh tunnel..."

# Check if autossh is already running
if pgrep -f "autossh.*${DEBUG_PORT}:localhost:${DEBUG_PORT}" > /dev/null; then
  echo "autossh tunnel already running"
  exit 0
fi

# Start autossh tunnel (bind to 0.0.0.0 for Docker access)
AUTOSSH_GATETIME=0 autossh -M 0 -f -N -o "ServerAliveInterval=60" -o "ServerAliveCountMax=3" -L 0.0.0.0:${DEBUG_PORT}:localhost:${DEBUG_PORT} -p ${REMOTE_PORT} ${REMOTE_USER}@${REMOTE_HOST}

if [ $? -eq 0 ]; then
  echo "autossh tunnel established on port ${DEBUG_PORT}"
else
  echo "Failed to establish autossh tunnel"
  exit 1
fi
