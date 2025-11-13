#!/bin/bash

# Stop socat port forwarding

# 根据参数选择服务器
if [ "$1" = "tago" ]; then
    REMOTE_HOST="100.91.155.104"
    REMOTE_USER="root"
else
    REMOTE_HOST="100.74.12.43"
    REMOTE_USER="root"
fi

REMOTE_PORT="22"

echo "Stopping socat on remote server..."

ssh -p ${REMOTE_PORT} ${REMOTE_USER}@${REMOTE_HOST} "
pkill -f 'socat.*19222.*9222'
if [ \$? -eq 0 ]; then
  echo 'socat stopped'
  exit 0
else
  echo 'socat was not running'
  exit 0
fi
"

echo "socat stopped on remote server"
