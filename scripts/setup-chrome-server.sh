#!/bin/bash

# 自动配置 Chrome 服务器
# 功能：安装 socat、配置端口转发、设置 systemd 自启动
# 用法: ./scripts/setup-chrome-server.sh <server-ip> [--with-fonts]

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 打印函数
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查参数
if [ $# -lt 1 ]; then
    print_error "缺少服务器 IP 参数"
    echo "用法: $0 <server-ip> [--with-fonts]"
    echo ""
    echo "示例:"
    echo "  $0 100.91.155.104"
    echo "  $0 100.91.155.104 --with-fonts"
    exit 1
fi

SERVER_IP="$1"
INSTALL_FONTS=false

# 解析可选参数
if [ $# -ge 2 ] && [ "$2" = "--with-fonts" ]; then
    INSTALL_FONTS=true
fi

REMOTE_USER="root"
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
TEMP_SETUP_SCRIPT="/tmp/chrome-server-setup-remote.sh"

print_info "目标服务器: ${SERVER_IP}"
print_info "安装字体: ${INSTALL_FONTS}"
echo ""

# 创建远程执行脚本
cat > "${TEMP_SETUP_SCRIPT}" << 'EOF'
#!/bin/bash

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 1. 检查并安装 socat
print_info "检查 socat 安装状态..."
if ! command -v socat &> /dev/null; then
    print_info "socat 未安装，正在安装..."
    apt-get update -qq
    apt-get install -y socat
    print_info "socat 安装完成"
else
    print_info "socat 已安装"
fi

# 2. 创建 systemd 服务文件
print_info "创建 systemd 服务文件..."
cat > /etc/systemd/system/chrome-socat.service << 'SERVICE_EOF'
[Unit]
Description=Socat Port Forwarding for Chrome CDP
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/socat TCP-LISTEN:19222,fork,reuseaddr TCP:127.0.0.1:9222
Restart=always
RestartSec=5
User=root

[Install]
WantedBy=multi-user.target
SERVICE_EOF

print_info "systemd 服务文件已创建"

# 3. 重新加载 systemd 并启用服务
print_info "重新加载 systemd 配置..."
systemctl daemon-reload

print_info "启用 chrome-socat 服务..."
systemctl enable chrome-socat.service

# 4. 启动服务
print_info "启动 chrome-socat 服务..."
systemctl start chrome-socat.service

# 5. 检查服务状态
print_info "检查服务状态..."
sleep 2
if systemctl is-active --quiet chrome-socat.service; then
    print_info "chrome-socat 服务运行正常"
    systemctl status chrome-socat.service --no-pager | head -10
else
    print_error "chrome-socat 服务启动失败"
    systemctl status chrome-socat.service --no-pager
    exit 1
fi

# 6. 验证端口监听
print_info "验证端口监听..."
if netstat -tuln | grep -q ':19222'; then
    print_info "端口 19222 已成功监听"
    netstat -tuln | grep ':19222'
else
    print_error "端口 19222 未监听"
    exit 1
fi

print_info "Chrome 服务器配置完成！"
EOF

chmod +x "${TEMP_SETUP_SCRIPT}"

# 上传并执行远程脚本
print_info "上传配置脚本到服务器..."
scp "${TEMP_SETUP_SCRIPT}" "${REMOTE_USER}@${SERVER_IP}:/tmp/chrome-server-setup.sh"

print_info "在服务器上执行配置脚本..."
ssh "${REMOTE_USER}@${SERVER_IP}" "bash /tmp/chrome-server-setup.sh"

# 如果需要安装字体
if [ "${INSTALL_FONTS}" = true ]; then
    print_info ""
    print_info "开始安装中文字体..."

    # 检查本地是否有字体文件
    if [ ! -f "/tmp/PingFang.ttc" ]; then
        print_warn "本地未找到 /tmp/PingFang.ttc，跳过 PingFang 字体安装"
    else
        print_info "上传 PingFang 字体..."
        ssh "${REMOTE_USER}@${SERVER_IP}" "mkdir -p /usr/share/fonts/truetype/pingfang"
        scp /tmp/PingFang.ttc "${REMOTE_USER}@${SERVER_IP}:/usr/share/fonts/truetype/pingfang/"
    fi

    if [ ! -f "/tmp/NotoSansCJK-Regular.ttc" ]; then
        print_warn "本地未找到 Noto CJK 字体文件，跳过 Noto 字体安装"
    else
        print_info "上传 Noto CJK 字体..."
        ssh "${REMOTE_USER}@${SERVER_IP}" "mkdir -p /usr/share/fonts/truetype/noto"
        scp /tmp/NotoSansCJK-*.ttc "${REMOTE_USER}@${SERVER_IP}:/usr/share/fonts/truetype/noto/" 2>/dev/null || true
    fi

    print_info "更新字体缓存..."
    ssh "${REMOTE_USER}@${SERVER_IP}" "fc-cache -f -v > /dev/null 2>&1"

    print_info "验证字体安装..."
    FONT_COUNT=$(ssh "${REMOTE_USER}@${SERVER_IP}" "fc-list :lang=zh | wc -l")
    print_info "已安装 ${FONT_COUNT} 个中文字体"
fi

# 清理临时文件
rm -f "${TEMP_SETUP_SCRIPT}"
ssh "${REMOTE_USER}@${SERVER_IP}" "rm -f /tmp/chrome-server-setup.sh"

print_info ""
print_info "===================================="
print_info "服务器配置完成！"
print_info "===================================="
print_info ""
print_info "服务器信息:"
print_info "  IP: ${SERVER_IP}"
print_info "  CDP 端口: 19222"
print_info "  systemd 服务: chrome-socat.service"
print_info ""
print_info "验证命令:"
print_info "  ssh ${REMOTE_USER}@${SERVER_IP} 'systemctl status chrome-socat.service'"
print_info "  ssh ${REMOTE_USER}@${SERVER_IP} 'netstat -tuln | grep 19222'"
print_info ""
print_info "使用方法:"
print_info "  1. 确保 Chrome 在服务器上运行 (端口 9222)"
print_info "  2. 在 deploy.sh 中使用: --chrome=custom"
print_info "  3. 设置 CDP_ENDPOINT=http://${SERVER_IP}:19222"
