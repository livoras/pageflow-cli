#!/bin/bash

# Start socat to forward Chrome CDP port from 127.0.0.1:9222 to 0.0.0.0:19222
# This is needed because Chrome only listens on localhost, but Docker containers need to access it

# 根据参数选择服务器（默认 tago）
if [ "$1" = "free-server" ]; then
    REMOTE_HOST="100.74.12.43"
    REMOTE_USER="root"
else
    # 默认连接 tago
    REMOTE_HOST="100.91.155.104"
    REMOTE_USER="root"
fi

REMOTE_PORT="22"
LOG_FILE="/tmp/socat-chrome.log"

echo "Starting socat on remote server..."

# Check if socat is already running
ssh -p ${REMOTE_PORT} ${REMOTE_USER}@${REMOTE_HOST} "
if pgrep -f 'socat.*19222.*9222' > /dev/null; then
  echo 'socat is already running'
  exit 0
fi

# Start socat
nohup socat TCP-LISTEN:19222,fork,bind=0.0.0.0 TCP:127.0.0.1:9222 > ${LOG_FILE} 2>&1 &

# Wait a moment for it to start
sleep 1

# Verify it's listening
if ss -tlnp | grep 19222 > /dev/null; then
  echo 'socat started successfully on port 19222'
  exit 0
else
  echo 'Failed to start socat'
  exit 1
fi
"

if [ $? -eq 0 ]; then
  echo "socat is running on ${REMOTE_HOST}:19222 -> localhost:9222"
else
  echo "Failed to start socat on remote server"
  exit 1
fi
