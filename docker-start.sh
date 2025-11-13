#!/bin/bash

# Get WebSocket URL from host Chrome
echo "Getting Chrome WebSocket URL..."
WS_URL=$(curl -s http://localhost:9222/json/version | jq -r .webSocketDebuggerUrl)

if [ -z "$WS_URL" ] || [ "$WS_URL" = "null" ]; then
    echo "Error: Could not get WebSocket URL from Chrome at localhost:9222"
    echo "Make sure Chrome is running with remote debugging enabled"
    echo "You can start it with: ./scripts/start-remote-and-autossh.sh"
    exit 1
fi

# Replace localhost with host.docker.internal
WS_URL=$(echo "$WS_URL" | sed 's/localhost/host.docker.internal/')

echo "Using CDP endpoint: $WS_URL"

# Create .env file
cat > .env << EOL
CDP_ENDPOINT=$WS_URL
PAGEFLOW_AUTH_USER=admin
PAGEFLOW_AUTH_PASS=pagaflow
EOL

echo ".env file created"

# Start Docker Compose
echo "Starting Docker Compose services..."
docker-compose up -d

echo ""
echo "Services started:"
echo "  Backend:  http://localhost:3100"
echo "  Frontend: http://localhost:3102"
echo ""
echo "Check logs with: docker-compose logs -f"
echo "Stop with: docker-compose down"
