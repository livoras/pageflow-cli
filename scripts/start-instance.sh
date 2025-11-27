#!/bin/bash

# Usage: ./scripts/start-instance.sh <server> <name> <port>
#        ./scripts/start-instance.sh <server> --list
# Example: ./scripts/start-instance.sh tago tago2 3101

set -e

SERVER=$1
NAME=$2
PORT=$3

if [ -z "$SERVER" ]; then
  echo "Usage: $0 <server> <name> <port>"
  echo "       $0 <server> --list"
  echo "Example: $0 tago tago2 3101"
  exit 1
fi

# List mode
if [ "$NAME" = "--list" ]; then
  echo "Pageflow instances on $SERVER:"
  ssh $SERVER "docker ps -a --filter 'name=pageflow-' --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'"
  exit 0
fi

if [ -z "$NAME" ] || [ -z "$PORT" ]; then
  echo "Usage: $0 <server> <name> <port>"
  echo "       $0 <server> --list"
  echo "Example: $0 tago tago2 3101"
  exit 1
fi

IMAGE="crpi-vxng4q8jdjplcz7n.cn-shenzhen.personal.cr.aliyuncs.com/face-match/pageflow-client:latest"
CONTAINER="pageflow-$NAME"
VOLUME="/root/.pageflow-$NAME:/root/.pageflow"

echo "Starting instance on $SERVER..."
echo "  Container: $CONTAINER"
echo "  Port: $PORT"
echo "  Volume: $VOLUME"
echo ""

ssh $SERVER "docker run -d --name $CONTAINER -p $PORT:3100 --restart unless-stopped -v $VOLUME $IMAGE"

# Get Tailscale IP
IP=$(ssh $SERVER "tailscale ip -4" 2>/dev/null || echo "")
if [ -z "$IP" ]; then
  IP="<server-ip>"
fi

# Wait for container to start and health check
echo "Waiting for instance to be ready..."
for i in {1..12}; do
  sleep 5
  if curl -sf "http://$IP:$PORT/api/health" > /dev/null 2>&1; then
    echo "Instance is healthy"
    break
  fi
  if [ $i -eq 12 ]; then
    echo "Error: Instance not healthy after 60s"
    exit 1
  fi
  echo "  Retry $i/12..."
done

# Add to local registry
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
"$SCRIPT_DIR/../pageflow" add-server "http://$IP:$PORT" --name $NAME

echo ""
echo "Done. Instance $NAME started and registered."
