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
USER_DATA_DIR="/root/.chrome-remote-data"
LOG_FILE="/tmp/chrome-debug.log"

echo "Starting Chrome on remote server..."

# Start Chrome on remote server in background (Xvfb is running as systemd service)
ssh -p ${REMOTE_PORT} ${REMOTE_USER}@${REMOTE_HOST} "
# Start Chrome with virtual display
DISPLAY=:99 nohup google-chrome \
  --remote-debugging-port=${DEBUG_PORT} \
  --remote-debugging-address=0.0.0.0 \
  --no-sandbox \
  --disable-dev-shm-usage \
  --window-size=1920,1080 \
  --user-data-dir=${USER_DATA_DIR} \
  --disable-blink-features=AutomationControlled \
  --exclude-switches=enable-automation \
  --disable-features=UserAgentClientHint \
  --lang=zh-CN \
  --user-agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' \
  --disable-web-security \
  --disable-features=IsolateOrigins,site-per-process \
  --password-store=basic \
  --use-mock-keychain \
  --disable-extensions \
  --disable-default-apps \
  --disable-component-extensions-with-background-pages \
  --disable-background-networking \
  --disable-sync \
  --disable-translate \
  --disable-renderer-backgrounding \
  --disable-background-timer-throttling \
  --disable-client-side-phishing-detection \
  --disable-component-update \
  --disable-ipc-flooding-protection \
  --autoplay-policy=no-user-gesture-required \
  --metrics-recording-only \
  --disable-breakpad \
  --no-default-browser-check \
  --no-first-run \
  > ${LOG_FILE} 2>&1 &
"

if [ $? -eq 0 ]; then
  echo "Chrome started successfully on remote server"
else
  echo "Failed to start Chrome on remote server"
  exit 1
fi

# Wait for Chrome to initialize
sleep 3

# Check if Chrome is running
ssh -p ${REMOTE_PORT} ${REMOTE_USER}@${REMOTE_HOST} "curl -s http://localhost:${DEBUG_PORT}/json/version > /dev/null"

if [ $? -eq 0 ]; then
  echo "Chrome is responding on port ${DEBUG_PORT}"
else
  echo "Chrome failed to start properly"
  exit 1
fi

echo "Chrome started successfully on port ${DEBUG_PORT}"
