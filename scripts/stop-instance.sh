#!/bin/bash

# Usage: ./scripts/stop-instance.sh <server> <name>
# Example: ./scripts/stop-instance.sh tago tago2

set -e

SERVER=$1
NAME=$2

if [ -z "$SERVER" ] || [ -z "$NAME" ]; then
  echo "Usage: $0 <server> <name>"
  echo "Example: $0 tago tago2"
  exit 1
fi

CONTAINER="pageflow-$NAME"

echo "Stopping instance on $SERVER..."
echo "  Container: $CONTAINER"
echo ""

ssh $SERVER "docker stop $CONTAINER && docker rm $CONTAINER"

echo ""
echo "Done. Container $CONTAINER stopped and removed on $SERVER"
