# 远程 Chrome 浏览器配置和使用

## 一、背景和需求

**初始需求：** 希望在远程无显示器服务器上运行浏览器，但需要手动登录某些网页，想通过本地可视化操作远程无头浏览器。

**核心问题：**

- 远程服务器没有显示器
- 某些网页需要人工登录（验证码等）
- 希望本地可以可视化控制远程浏览器

## 二、技术方案选型

### 探索阶段

1. **确认 Playwright 支持远程 CDP**
   - 通过 WebSearch 确认 Playwright 可以用 `connectOverCDP()` 连接远程 Chrome
   - 支持两种端点格式：HTTP URL 或 WebSocket URL

2. **方案确定：Chrome Remote Debugging + SSH 端口转发**
   - 远程服务器：启动 Chrome 开启远程调试（`--remote-debugging-port=9222`）
   - 本地：通过 SSH 端口转发访问远程浏览器
   - 可视化：使用 Chrome DevTools (`chrome://inspect`) 或本地 Playwright 连接

## 三、实施步骤

### 1. 远程服务器配置

**测试连接：**

```bash
ssh -p 22 root@100.74.12.43  # 成功连接
```

**安装 Chrome：**

- 服务器系统：Ubuntu (Linux 6.8.0-85-generic)
- 使用后台安装方式避免 SSH 超时：
  ```bash
  nohup bash -c 'wget ... && apt install ...' > /tmp/chrome-install.log 2>&1 &
  ```
- 安装成功：Google Chrome 141.0.7390.54

**启动 Chrome（持久化数据）：**

```bash
google-chrome \
  --headless=new \
  --remote-debugging-port=9222 \
  --remote-debugging-address=0.0.0.0 \
  --no-sandbox \
  --disable-dev-shm-usage \
  --window-size=1920,1080 \
  --user-data-dir=/root/.chrome-remote-data
```

### 2. 创建管理脚本

在 `scripts/` 目录创建三个脚本：

**`start-remote-chrome.sh`：**

- 通过 SSH 在远程启动 Chrome
- 验证 Chrome 启动成功
- 建立 SSH 端口转发 (`-L 9222:localhost:9222`)

**`stop-remote-chrome.sh`：**

- 停止远程 Chrome 进程
- 关闭 SSH 端口转发

**`restart-remote-chrome.sh`：**

- 调用 stop → 等待 → 调用 start

### 3. 本地项目改造

**修改 `SimplePageServer.ts`：**

添加环境变量 `CDP_ENDPOINT` 支持：

```typescript
private async initBrowser() {
  const cdpEndpoint = process.env.CDP_ENDPOINT;

  if (cdpEndpoint) {
    // 远程 CDP 模式
    // 1. 解析 HTTP 端点到 WebSocket URL
    // 2. 连接远程 Chrome
    // 3. 使用现有 context 或创建新 context
  } else {
    // 本地模式（原有逻辑）
    // launchPersistentContext()
  }
}
```

**关键实现：**

- 自动将 HTTP endpoint 转换为 WebSocket URL
- 支持使用现有 browser context
- 完全向后兼容本地模式

### 4. 测试验证

**远程模式测试：**

```bash
CDP_ENDPOINT=http://localhost:9222 PORT=3100 SCREENSHOT=true pnpm run server
```

- 成功连接到远程 Chrome
- 创建页面成功
- 执行自动化任务（百度搜索 "OJBK"）

**本地模式测试：**

```bash
PORT=3100 SCREENSHOT=true pnpm run server
```

- 正常启动本地 Chrome
- 所有功能正常

## 四、关键发现

### Chrome DevTools Inspect 页面限制

- `chrome://inspect/#devices` **只能查看和调试**，不能创建新 tab
- 设计目的是调试工具，非浏览器管理面板
- 创建新 tab 必须通过：
  - CDP API: `curl -X PUT 'http://localhost:9222/json/new?URL'`
  - Playwright 代码
  - SimplePageServer API

### SSH 端口转发的作用

```bash
ssh -p 22 -L 9222:localhost:9222 -N -f root@100.74.12.43
```

- 将远程 9222 端口映射到本地 9222
- 本地访问 `http://localhost:9222` = 远程 Chrome
- 支持 Chrome DevTools 和 Playwright 连接

## 五、Git 操作

**分支管理：**

1. 从 `action-templates` 分支切出 `private-chrome`
2. 两次提交：
   - feat: add remote Chrome management scripts
   - feat: support remote CDP browser connection

**未提交的文件：**

- `.claude/commands/extract-data.md.bak`
- `1be83564-7329-436c-88ce-b5ba97c604c1.jpg`
- `docs/20251005-110521-action-template-feature.md`

## 六、最终架构

```
本地机器                          远程服务器 (100.74.12.43)
┌─────────────────┐              ┌──────────────────────┐
│                 │              │                      │
│ SimplePageServer│◄─CDP─────────┤ Chrome (headless)    │
│ (CDP_ENDPOINT)  │ (via SSH)    │ port 9222            │
│                 │              │ user-data: /root/... │
└─────────────────┘              └──────────────────────┘
        │                                  ▲
        │                                  │
        ▼                                  │
┌─────────────────┐              ┌──────────────────────┐
│ Chrome DevTools │              │ SSH Port Forward     │
│ chrome://inspect│──────────────┤ -L 9222:localhost:   │
└─────────────────┘              │    9222              │
                                 └──────────────────────┘
```

## 七、使用方式

### 本地模式（默认）

```bash
pnpm run server
```

### 远程模式

```bash
# 1. 启动远程 Chrome
./scripts/start-remote-chrome.sh

# 2. 启动本地服务器连接远程
CDP_ENDPOINT=http://localhost:9222 pnpm run server

# 3. 可视化操作
# - Chrome DevTools: chrome://inspect → 添加 localhost:9222
# - 或通过 SimplePageServer API
```

### 管理远程 Chrome

```bash
./scripts/restart-remote-chrome.sh  # 重启
./scripts/stop-remote-chrome.sh     # 停止
```

## 八、核心成果

1. 实现了远程浏览器 + 本地可视化控制
2. 支持持久化登录状态（user-data-dir）
3. 无缝切换本地/远程模式（环境变量控制）
4. 提供完整的管理脚本
5. 验证了完整的自动化流程（百度搜索示例）
