#!/bin/bash

# Add remote pageflow instances
pageflow add-server http://100.93.198.106:3100 --name tencent
pageflow add-server http://100.91.155.104:3101 --name tago2

# Start dispatch server
exec pageflow run serve --port 4001
