#!/bin/bash

# 部署 Docker 镜像到生产服务器
# 流程: 构建 -> 推送到阿里云 -> 服务器拉取并启动

set -e

# 默认配置
CHROME_SOURCE="local"  # 默认使用本地 Chrome
CDP_ENDPOINT="http://host.docker.internal:19222"

# 解析命令行参数
while [[ $# -gt 0 ]]; do
  case $1 in
    --chrome=*)
      CHROME_SOURCE="${1#*=}"
      shift
      ;;
    --chrome)
      CHROME_SOURCE="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 [--chrome=local|free-server|tago]"
      exit 1
      ;;
  esac
done

# 根据 chrome 源设置 CDP_ENDPOINT
case $CHROME_SOURCE in
  local)
    CDP_ENDPOINT="http://host.docker.internal:19222"
    echo "使用生产服务器本地 Chrome"
    ;;
  free-server)
    CDP_ENDPOINT="http://100.74.12.43:9222"
    echo "使用 free-server Chrome (100.74.12.43)"
    ;;
  tago)
    CDP_ENDPOINT="http://100.91.155.104:19222"
    echo "使用 tago Chrome (100.91.155.104:19222)"
    ;;
  *)
    echo "错误: 未知的 Chrome 源 '$CHROME_SOURCE'"
    echo "支持的选项: local, free-server, tago"
    exit 1
    ;;
esac

# 配置
REGISTRY="crpi-vxng4q8jdjplcz7n.cn-shenzhen.personal.cr.aliyuncs.com"
NAMESPACE="face-match"
BACKEND_IMAGE="${REGISTRY}/${NAMESPACE}/pageflow-backend:latest"
FRONTEND_IMAGE="${REGISTRY}/${NAMESPACE}/pageflow-frontend:latest"
SERVER="root@8.155.175.166"
SERVER_PORT="7070"
DEPLOY_PATH="/root/git/pageflow"

# 获取项目根目录
PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$PROJECT_ROOT"

echo "🚀 开始部署流程..."
echo "📁 项目根目录: $PROJECT_ROOT"
echo "🎯 目标服务器: ${SERVER}:${SERVER_PORT}"
echo "🌐 Chrome CDP: $CDP_ENDPOINT"
echo ""

# 步骤 1: 构建镜像
echo "📦 步骤 1/4: 构建 Docker 镜像..."
echo ""

echo "  构建 Backend..."
docker build --platform linux/amd64 -t pageflow-backend:latest -t "${BACKEND_IMAGE}" .
echo "  Backend 构建完成"
echo ""

echo "  构建 Frontend..."
cd simple-page-viewer
docker build --platform linux/amd64 -t pageflow-frontend:latest -t "${FRONTEND_IMAGE}" .
cd ..
echo "  Frontend 构建完成"
echo ""

# 步骤 2: 推送到阿里云
echo "📤 步骤 2/4: 推送镜像到阿里云..."
echo ""

echo "  推送 Backend..."
docker push "${BACKEND_IMAGE}"
echo "  Backend 推送完成"
echo ""

echo "  推送 Frontend..."
docker push "${FRONTEND_IMAGE}"
echo "  Frontend 推送完成"
echo ""

# 步骤 3: 同步配置文件到服务器
echo "📋 步骤 3/4: 同步配置文件到服务器..."
echo ""

# 创建临时目录
TEMP_DIR=$(mktemp -d)
cp docker-compose.prod.yml "${TEMP_DIR}/docker-compose.yml"

# 生成 .env 文件（覆盖 CDP_ENDPOINT）
cat .env.docker > "${TEMP_DIR}/.env"
echo "" >> "${TEMP_DIR}/.env"
echo "# 由 deploy.sh --chrome=$CHROME_SOURCE 自动生成" >> "${TEMP_DIR}/.env"
echo "CDP_ENDPOINT=$CDP_ENDPOINT" >> "${TEMP_DIR}/.env"

# 同步到服务器
ssh -p "${SERVER_PORT}" "${SERVER}" "mkdir -p ${DEPLOY_PATH}"
scp -P "${SERVER_PORT}" "${TEMP_DIR}/docker-compose.yml" "${SERVER}:${DEPLOY_PATH}/"
scp -P "${SERVER_PORT}" "${TEMP_DIR}/.env" "${SERVER}:${DEPLOY_PATH}/"

# 清理临时目录
rm -rf "${TEMP_DIR}"

echo "  配置文件同步完成"
echo ""

# 步骤 4: 在服务器上部署
echo "🔄 步骤 4/4: 在服务器上部署..."
echo ""

ssh -p "${SERVER_PORT}" "${SERVER}" << 'ENDSSH'
cd /root/git/pageflow

echo "  拉取最新镜像..."
docker compose pull

echo "  停止旧容器..."
docker compose down 2>/dev/null || true

echo "  启动新容器..."
docker compose --env-file .env up -d

echo "  等待服务健康检查..."
sleep 15

echo "  检查容器状态..."
docker compose ps
ENDSSH

echo ""
echo "部署完成"
echo ""
echo "部署信息："
echo "   Chrome 源: $CHROME_SOURCE"
echo "   CDP Endpoint: $CDP_ENDPOINT"
echo ""
echo "访问地址："
echo "   Frontend: http://100.74.12.43:8007"
echo "   Backend:  http://100.74.12.43:8006"
echo ""
echo "查看日志："
echo "   ssh -p 7070 root@100.74.12.43 'cd /root/git/pageflow && docker compose logs -f'"
