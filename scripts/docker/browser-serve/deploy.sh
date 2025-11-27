#!/bin/bash

# Deploy browser-serve to free-server

set -e

REMOTE_HOST="free-server"
IMAGE_NAME="browser-serve"
CONTAINER_NAME="browser-serve"
PORT=4001

echo "Building Docker image..."
cd "$(dirname "$0")"

# Copy files to remote
ssh $REMOTE_HOST "mkdir -p /tmp/browser-serve"
scp Dockerfile start.sh $REMOTE_HOST:/tmp/browser-serve/

# Build image on remote
ssh $REMOTE_HOST "cd /tmp/browser-serve && docker build -t $IMAGE_NAME ."

# Stop existing container if running
ssh $REMOTE_HOST "docker rm -f $CONTAINER_NAME 2>/dev/null || true"

# Run new container
ssh $REMOTE_HOST "docker run -d --name $CONTAINER_NAME --restart unless-stopped -p $PORT:$PORT $IMAGE_NAME"

echo ""
echo "Deployed successfully!"
echo "Service URL: http://100.74.12.43:$PORT/api/run"

# Verify
sleep 3
echo ""
echo "Health check:"
ssh $REMOTE_HOST "curl -s http://localhost:$PORT/api/health"
