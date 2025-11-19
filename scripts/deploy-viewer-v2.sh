#!/bin/bash

set -e

SERVER="ali"
REMOTE_DIR="/root/viewer-v2"
PORT=7006

echo "==================== Viewer V2 部署脚本 ===================="
echo "目标服务器: $SERVER"
echo "部署目录: $REMOTE_DIR"
echo "服务端口: $PORT"
echo "========================================================"

cd "$(dirname "$0")/.."

echo ""
echo "[1/7] 进入 viewer 目录并安装依赖..."
cd viewer
pnpm install

echo ""
echo "[2/7] 构建 Next.js 应用..."
pnpm build

echo ""
echo "[3/7] 上传文件到服务器..."
ssh $SERVER "mkdir -p $REMOTE_DIR && rm -rf $REMOTE_DIR/.next"
scp -r .next package.json pnpm-lock.yaml app lib next.config.mjs $SERVER:$REMOTE_DIR/

echo ""
echo "[4/7] 同步 extraction 模板到服务器..."
ssh $SERVER "mkdir -p /root/.pageflow/extractions"
scp ~/.pageflow/extractions/*.json $SERVER:/root/.pageflow/extractions/ 2>/dev/null || echo "没有找到 extraction 模板，跳过"

echo ""
echo "[5/7] 在服务器上安装依赖..."
ssh $SERVER "
  cd $REMOTE_DIR
  if ! command -v pnpm &> /dev/null; then
    echo '安装 pnpm...'
    npm install -g pnpm
  fi
  pnpm install --prod
"

echo ""
echo "[6/7] 停止旧服务并启动新服务..."
ssh $SERVER "
  # 停止旧进程
  OLD_PID=\$(ss -tlnp 2>/dev/null | grep :$PORT | grep -oP 'pid=\K[0-9]+' | head -1)
  if [ ! -z \"\$OLD_PID\" ]; then
    echo '停止占用端口 $PORT 的进程 (PID: '\$OLD_PID')...'
    kill -9 \$OLD_PID || true
    sleep 2
  fi

  # 启动新服务
  cd $REMOTE_DIR
  nohup pnpm start -p $PORT > $REMOTE_DIR/viewer-v2.log 2>&1 &
  echo '服务已启动，PID:' \$!
  sleep 3
"

echo ""
echo "[7/7] 验证服务状态..."
if ssh $SERVER "ss -tlnp 2>/dev/null | grep -q :$PORT"; then
  echo "服务启动成功！"
  echo ""
  ssh $SERVER "tail -20 $REMOTE_DIR/viewer-v2.log"
  echo ""
  echo "========================================================"
  echo "部署完成！"
  echo "访问地址: http://8.155.175.166:$PORT"
  echo "查看日志: ssh $SERVER 'tail -f $REMOTE_DIR/viewer-v2.log'"
  echo "========================================================"
else
  echo "错误：服务启动失败！"
  echo "查看日志: ssh $SERVER 'cat $REMOTE_DIR/viewer-v2.log'"
  exit 1
fi
