# 使用 Xvfb 绕过小红书反爬检测

## 背景

远程 Chrome headless 模式访问小红书时显示安全限制，已配置的反检测措施：

### Chrome 启动参数

```bash
--disable-blink-features=AutomationControlled
--exclude-switches=enable-automation
--disable-features=UserAgentClientHint
--lang=zh-CN
--disable-web-security
--disable-features=IsolateOrigins,site-per-process
--password-store=basic
--use-mock-keychain
--disable-extensions
--disable-default-apps
--disable-component-extensions-with-background-pages
--disable-background-networking
--disable-sync
--disable-translate
--disable-renderer-backgrounding
--disable-background-timer-throttling
--disable-client-side-phishing-detection
--disable-component-update
--disable-ipc-flooding-protection
--autoplay-policy=no-user-gesture-required
--metrics-recording-only
--disable-breakpad
--no-default-browser-check
--no-first-run
```

### Playwright addInitScript 注入

```typescript
// Remove webdriver flag
Object.defineProperty(navigator, "webdriver", {
  get: () => undefined,
});

// Fix chrome object
if (!(window as any).chrome) {
  (window as any).chrome = {
    runtime: {},
  };
}

// Fix plugins
Object.defineProperty(navigator, "plugins", {
  get: () => [1, 2, 3, 4, 5],
});

// Fix languages
Object.defineProperty(navigator, "languages", {
  get: () => ["zh-CN", "zh", "en"],
});

// Fix permissions query
const originalQuery = window.navigator.permissions.query;
window.navigator.permissions.query = (parameters: any) =>
  parameters.name === "notifications"
    ? Promise.resolve({ state: Notification.permission } as PermissionStatus)
    : originalQuery(parameters);
```

仍然被检测为自动化浏览器。

## 解决方案：去掉 headless 模式 + Xvfb

### 问题分析

小红书可能检测 `--headless=new` 参数。尝试去掉 headless，但远程服务器无显示器：

```
ERROR:ui/ozone/platform/x11/ozone_platform_x11.cc:249] Missing X server or $DISPLAY
ERROR:ui/aura/env.cc:257] The platform failed to initialize.  Exiting.
```

### Xvfb 方案

**Xvfb 特点：**

- 虚拟帧缓冲区（Virtual Framebuffer）
- 只在内存中模拟显示缓冲区
- 资源占用：约 67MB 内存，空闲时 CPU < 1%
- 低优先级进程（SN），不抢占资源

**安装 Xvfb：**

```bash
ssh -p 22 root@100.74.12.43 "apt-get update && apt-get install -y xvfb"
```

**配置为 systemd 服务：**

创建服务文件 `/etc/systemd/system/xvfb.service`：

```ini
[Unit]
Description=X Virtual Frame Buffer Service
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/Xvfb :99 -screen 0 1920x1080x24
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

启用服务：

```bash
systemctl daemon-reload
systemctl enable xvfb
systemctl start xvfb
```

**验证服务状态：**

```bash
systemctl status xvfb
```

输出：

```
● xvfb.service - X Virtual Frame Buffer Service
     Loaded: loaded (/etc/systemd/system/xvfb.service; enabled; preset: enabled)
     Active: active (running) since Sun 2025-10-05 05:05:56 UTC; 12ms ago
   Main PID: 324339 (Xvfb)
      Tasks: 1 (limit: 38275)
     Memory: 1.8M (peak: 1.8M)
        CPU: 10ms
```

### 修改启动脚本

**`scripts/start-remote-chrome.sh` 修改：**

去掉 `--headless=new` 参数，使用 `DISPLAY=:99` 环境变量：

```bash
# Start Chrome on remote server in background (Xvfb is running as systemd service)
ssh -p ${REMOTE_PORT} ${REMOTE_USER}@${REMOTE_HOST} "
# Start Chrome with virtual display
DISPLAY=:99 nohup google-chrome \
  --remote-debugging-port=${DEBUG_PORT} \
  --remote-debugging-address=0.0.0.0 \
  --no-sandbox \
  --disable-dev-shm-usage \
  --window-size=1920,1080 \
  --user-data-dir=${USER_DATA_DIR} \
  --disable-blink-features=AutomationControlled \
  --exclude-switches=enable-automation \
  --disable-features=UserAgentClientHint \
  --lang=zh-CN \
  --disable-web-security \
  --password-store=basic \
  --use-mock-keychain \
  --disable-extensions \
  --disable-default-apps \
  --no-default-browser-check \
  --no-first-run \
  > ${LOG_FILE} 2>&1 &
"
```

**`scripts/stop-remote-chrome.sh` 修改：**

只停止 Chrome，保持 Xvfb 作为系统服务运行：

```bash
# Stop Chrome on remote server (Xvfb is kept running as systemd service)
ssh -p ${REMOTE_PORT} ${REMOTE_USER}@${REMOTE_HOST} "pkill -f 'chrome.*remote-debugging-port=${DEBUG_PORT}' || true"
```

### 启动流程

**分步执行（测试）：**

1. 停止旧进程：

```bash
ssh -p 22 root@100.74.12.43 "pkill Xvfb; pkill chrome"
```

2. 启动 Xvfb：

```bash
ssh -p 22 root@100.74.12.43 "nohup Xvfb :99 -screen 0 1920x1080x24 >/tmp/xvfb.log 2>&1 &"
```

3. 验证 Xvfb：

```bash
ssh -p 22 root@100.74.12.43 "ps aux | grep Xvfb | grep -v grep"
```

输出：

```
root      323498  1.0  0.2 206484 67860 ?        SN   05:02   0:00 Xvfb :99 -screen 0 1920x1080x24
```

4. 启动 Chrome：

```bash
ssh -p 22 root@100.74.12.43 'DISPLAY=:99 nohup google-chrome --remote-debugging-port=9222 --remote-debugging-address=0.0.0.0 --no-sandbox --disable-dev-shm-usage --window-size=1920,1080 --user-data-dir=/root/.chrome-remote-data --disable-blink-features=AutomationControlled --exclude-switches=enable-automation --disable-features=UserAgentClientHint --lang=zh-CN --disable-web-security --password-store=basic --use-mock-keychain --disable-extensions --disable-default-apps --no-default-browser-check --no-first-run >/tmp/chrome-debug.log 2>&1 &'
```

5. 验证 Chrome：

```bash
ssh -p 22 root@100.74.12.43 "curl -s http://localhost:9222/json/version"
```

输出：

```json
{
  "Browser": "Chrome/141.0.7390.54",
  "Protocol-Version": "1.3",
  "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  "V8-Version": "14.1.146.11",
  "WebKit-Version": "537.36 (@b95610d5c4a562d9cd834bc0a098d3316e2f533f)",
  "webSocketDebuggerUrl": "ws://localhost:9222/devtools/browser/5fd8163e-2232-40d3-8946-08778c4fc290"
}
```

6. 建立端口转发：

```bash
ssh -p 22 -L 9222:localhost:9222 -N -f root@100.74.12.43
```

## 最终配置

### 服务器端

- **Xvfb 服务**：systemd 管理，开机自启
- **Chrome 模式**：非 headless，使用虚拟显示 `:99`
- **CDP 端口**：9222

### 本地端

- **端口转发**：9222 → 远程 9222
- **SimplePageServer**：CDP_ENDPOINT=http://localhost:9222
- **反检测脚本**：addInitScript 注入

### 管理命令

```bash
# 启动/重启/停止 Chrome
./scripts/start-remote-chrome.sh
./scripts/restart-remote-chrome.sh
./scripts/stop-remote-chrome.sh

# 管理 Xvfb 服务
ssh -p 22 root@100.74.12.43 "systemctl status xvfb"
ssh -p 22 root@100.74.12.43 "systemctl restart xvfb"
```

## SimplePageServer 代码修改

在 `src/SimplePageServer.ts` 的远程模式中添加反检测脚本注入（第 566-598 行）：

```typescript
// Inject anti-detection script for all pages
await this.persistentContext.addInitScript(() => {
  // Remove webdriver flag
  Object.defineProperty(navigator, "webdriver", {
    get: () => undefined,
  });

  // Fix chrome object
  if (!(window as any).chrome) {
    (window as any).chrome = {
      runtime: {},
    };
  }

  // Fix plugins
  Object.defineProperty(navigator, "plugins", {
    get: () => [1, 2, 3, 4, 5],
  });

  // Fix languages
  Object.defineProperty(navigator, "languages", {
    get: () => ["zh-CN", "zh", "en"],
  });

  // Fix permissions query
  const originalQuery = window.navigator.permissions.query;
  window.navigator.permissions.query = (parameters: any) =>
    parameters.name === "notifications"
      ? Promise.resolve({ state: Notification.permission } as PermissionStatus)
      : originalQuery(parameters);
});
console.log("✓ Anti-detection script injected");
```
