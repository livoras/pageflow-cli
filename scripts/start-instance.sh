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

echo ""
echo "Done. Container $CONTAINER started on $SERVER:$PORT"
echo ""
echo "Add to local registry:"
echo "  pageflow add-server http://$IP:$PORT --name $NAME"
