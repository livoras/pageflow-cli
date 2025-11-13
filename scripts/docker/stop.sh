#!/bin/bash

# 停止 Docker Compose 服务（本地测试）

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$PROJECT_ROOT"

echo "停止 Docker Compose 服务..."
docker-compose down

echo "服务已停止"
