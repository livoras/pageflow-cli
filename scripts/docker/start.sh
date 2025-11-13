#!/bin/bash

# 启动 Docker Compose 服务（本地测试）

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$PROJECT_ROOT"

echo "启动 Docker Compose 服务..."
docker-compose up -d

echo ""
echo "服务已启动"
echo "  Backend:  http://localhost:8006"
echo "  Frontend: http://localhost:8007"
echo ""
echo "查看日志: docker-compose logs -f"
echo "查看状态: docker-compose ps"
