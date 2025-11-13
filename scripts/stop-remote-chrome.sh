#!/bin/bash

# Remote Chrome configuration
# 根据参数选择服务器
if [ "$1" = "tago" ]; then
    REMOTE_HOST="100.91.155.104"
    REMOTE_USER="root"
else
    REMOTE_HOST="100.74.12.43"
    REMOTE_USER="root"
fi

REMOTE_PORT="22"
DEBUG_PORT="9222"

echo "Stopping Chrome on remote server..."

# Stop Chrome on remote server (Xvfb is kept running as systemd service)
ssh -p ${REMOTE_PORT} ${REMOTE_USER}@${REMOTE_HOST} "pkill -f 'chrome.*remote-debugging-port=${DEBUG_PORT}' || true"

if [ $? -eq 0 ]; then
  echo "Remote Chrome stopped"
else
  echo "Failed to stop Chrome on remote server"
fi
