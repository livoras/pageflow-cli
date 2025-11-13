#!/bin/bash

# 重启 Docker Compose 服务（本地测试）

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$PROJECT_ROOT"

echo "重启 Docker Compose 服务..."
docker-compose down
docker-compose up -d

echo ""
echo "服务已重启"
echo "  Backend:  http://localhost:8006"
echo "  Frontend: http://localhost:8007"
echo ""
echo "查看日志: docker-compose logs -f"
