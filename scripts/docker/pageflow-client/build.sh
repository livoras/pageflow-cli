#!/bin/bash

# 构建并推送 pageflow-client 镜像到阿里云镜像仓库
# 参考: scripts/docker/deploy.sh

set -e

# 配置
REGISTRY="crpi-vxng4q8jdjplcz7n.cn-shenzhen.personal.cr.aliyuncs.com"
NAMESPACE="face-match"
IMAGE_NAME="pageflow-client"
TAG="${1:-latest}"

FULL_IMAGE="${REGISTRY}/${NAMESPACE}/${IMAGE_NAME}:${TAG}"

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "构建镜像: ${FULL_IMAGE}"
echo ""

# 构建多架构镜像并推送
docker buildx build --platform linux/amd64,linux/arm64 -t ${FULL_IMAGE} --push .

echo ""
echo "完成！镜像已推送到: ${FULL_IMAGE}"
echo ""
echo "拉取命令: docker pull ${FULL_IMAGE}"
echo "运行命令: docker run -d -p 3100:3100 ${FULL_IMAGE}"
