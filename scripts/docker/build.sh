#!/bin/bash

# 构建 Docker 镜像
# 需要在项目根目录执行

set -e

# 获取脚本所在目录的父目录的父目录（项目根目录）
PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$PROJECT_ROOT"

echo "🏗️  开始构建 Docker 镜像..."
echo "📁 项目根目录: $PROJECT_ROOT"
echo ""

# 构建 Backend
echo "📦 构建 Backend 镜像..."
docker build --platform linux/amd64 -t pageflow-backend:latest .
echo "Backend 镜像构建完成"
echo ""

# 构建 Frontend
echo "📦 构建 Frontend 镜像..."
cd simple-page-viewer
docker build --platform linux/amd64 -t pageflow-frontend:latest .
cd ..
echo "Frontend 镜像构建完成"
echo ""

echo "所有镜像构建完成"
