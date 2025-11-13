#!/bin/bash

# 根据参数选择服务器（预留，当前 pkill 会停止所有 autossh）
if [ "$1" = "tago" ]; then
    SERVER_NAME="tago"
else
    SERVER_NAME="default"
fi

echo "Stopping autossh tunnel..."

# Stop autossh tunnel
pkill autossh 2>/dev/null

if [ $? -eq 0 ]; then
  # Wait for process to actually terminate
  sleep 1
  echo "autossh tunnel stopped"
else
  echo "No autossh tunnel running"
fi
