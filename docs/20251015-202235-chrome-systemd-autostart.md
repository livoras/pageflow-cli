# Chrome 远程调试服务开机自启动配置

## 操作时间

2025-10-15 20:22:35

## 操作目标

在远程服务器（100.74.12.43）上配置 Chrome 远程调试服务为 systemd 自启动服务

## 服务器信息

- 服务器地址: 100.74.12.43
- SSH 用户: root
- 操作系统: Ubuntu 24.04.3 LTS

## systemd 服务配置

### 服务文件路径

`/etc/systemd/system/chrome-remote.service`

### 服务配置内容

```ini
[Unit]
Description=Chrome Remote Debugging Service
After=network.target xvfb.service
Requires=xvfb.service

[Service]
Type=simple
User=root
Environment=DISPLAY=:99
ExecStartPre=/bin/sleep 2
ExecStart=/usr/bin/google-chrome \
  --remote-debugging-port=9222 \
  --remote-debugging-address=0.0.0.0 \
  --no-sandbox \
  --disable-dev-shm-usage \
  --window-size=1920,1080 \
  --user-data-dir=/root/.chrome-remote-data \
  --disable-blink-features=AutomationControlled \
  --exclude-switches=enable-automation \
  --disable-features=UserAgentClientHint \
  --lang=zh-CN \
  --disable-web-security \
  --disable-features=IsolateOrigins,site-per-process \
  --password-store=basic \
  --use-mock-keychain \
  --disable-extensions \
  --disable-default-apps \
  --disable-component-extensions-with-background-pages \
  --disable-background-networking \
  --disable-sync \
  --disable-translate \
  --disable-renderer-backgrounding \
  --disable-background-timer-throttling \
  --disable-client-side-phishing-detection \
  --disable-component-update \
  --disable-ipc-flooding-protection \
  --autoplay-policy=no-user-gesture-required \
  --metrics-recording-only \
  --disable-breakpad \
  --no-default-browser-check \
  --no-first-run
Restart=always
RestartSec=5
StandardOutput=append:/var/log/chrome-remote.log
StandardError=append:/var/log/chrome-remote.log

[Install]
WantedBy=multi-user.target
```

## 执行的命令

### 1. 创建服务文件

```bash
ssh root@100.74.12.43 "cat > /etc/systemd/system/chrome-remote.service << 'EOF'
[服务配置内容]
EOF"
```

### 2. 启用并启动服务

```bash
ssh root@100.74.12.43 "systemctl daemon-reload && systemctl enable chrome-remote.service && systemctl restart chrome-remote.service"
```

### 3. 停止旧进程并重启服务

```bash
ssh root@100.74.12.43 "systemctl stop chrome-remote.service && kill 64340 && sleep 2 && systemctl start chrome-remote.service"
```

## 服务状态

### 服务运行状态

- 状态: Active (running)
- 主进程 PID: 69891
- 任务数: 120
- 内存占用: 188.1M
- 自动启动: 已启用 (enabled)

### Chrome 信息

- 版本: Chrome/141.0.7390.54
- 调试端口: 9222
- 监听地址: 0.0.0.0:9222

### 日志文件

- 标准输出/错误: `/var/log/chrome-remote.log`

## 验证命令

### 检查服务状态

```bash
ssh root@100.74.12.43 "systemctl status chrome-remote.service"
```

### 测试 CDP 端点

```bash
ssh root@100.74.12.43 "curl -s http://localhost:9222/json/version"
```

返回示例:

```json
{
  "Browser": "Chrome/141.0.7390.54",
  "Protocol-Version": "1.3",
  "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  "V8-Version": "14.1.146.11",
  "WebKit-Version": "537.36 (@b95610d5c4a562d9cd834bc0a098d3316e2f533f)",
  "webSocketDebuggerUrl": "ws://localhost:9222/devtools/browser/56867359-25c0-4715-b00a-13a7e65b9f70"
}
```

## 依赖服务

- xvfb.service: 提供虚拟显示 DISPLAY=:99
- network.target: 网络服务启动后

## 配置特性

- 失败自动重启: Restart=always, RestartSec=5
- 启动前等待: ExecStartPre=/bin/sleep 2
- 系统启动时自动运行: WantedBy=multi-user.target
