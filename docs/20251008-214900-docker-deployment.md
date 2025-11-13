# Docker 部署后端服务

## 目标

将 Pageflow 后端服务打包到 Docker 容器中运行，连接到宿主机的远程 Chrome CDP 端点。

## 遇到的问题

### 1. 缺少 pnpm-workspace.yaml

**问题**: Dockerfile 中尝试复制 `pnpm-workspace.yaml` 文件，但项目根目录不存在该文件。

**解决**: 从 Dockerfile 的 COPY 指令中移除 `pnpm-workspace.yaml`。

### 2. pnpm-lock.yaml 与 package.json 不匹配

**问题**: 使用 `--frozen-lockfile` 时，pnpm 报错 lockfile 与 package.json 中的依赖规范不匹配（特别是 zod 的 peerDependencies）。

**解决**: 使用 `--no-frozen-lockfile` 替代。

### 3. 缺少构建脚本（gen-version.ts）

**问题**: 项目 package.json 中的 build 脚本依赖 `scripts/gen-version.ts`，但该文件在 `.dockerignore` 中被排除。

**解决**: 修改 `.dockerignore`，保留构建相关的 scripts，只排除远程 Chrome 管理脚本。

### 4. 缺少 eslint

**问题**: build 流程中执行 `pnpm run lint` 时，eslint 命令未找到（devDependencies 未安装）。

**解决**: 跳过 lint 步骤，直接执行构建的核心步骤（`gen-version`、`build-dom-scripts`、`build-js`、`build-types`）。

### 5. 缺少 lib 目录

**问题**: Dockerfile 尝试复制 `/app/lib` 目录，但该目录在项目中不存在。

**解决**: 项目使用 ts-node 直接运行 TypeScript，不需要预构建。移除对 lib 和 dist 目录的复制，保留源码目录（src、examples、types）和 tsconfig.json。

### 6. 生产阶段缺少 ts-node

**问题**: 使用 `--prod` 安装依赖时，ts-node 作为 devDependency 未被安装，导致启动命令 `ts-node examples/start-server.ts` 失败。

**解决**: 在生产阶段使用 `pnpm install` 安装所有依赖（包括 devDependencies）。

### 7. better-sqlite3 native 模块未编译

**问题**: 容器启动时，better-sqlite3 报错无法找到 bindings 文件。native 模块需要在目标平台编译。

**解决**:

- 在 builder 阶段：`pnpm rebuild better-sqlite3`
- 在生产阶段：`pnpm rebuild better-sqlite3`

### 8. Docker 容器无法访问宿主机 localhost:9222

**问题**:

- autossh 隧道默认绑定到 127.0.0.1:9222，容器无法通过 `host.docker.internal` 访问
- netstat 显示端口只监听在 tcp4 和 tcp6 的 127.0.0.1/::1

**解决**: 修改 `scripts/start-autossh.sh`，将 SSH 端口转发绑定到 0.0.0.0：

```bash
# 修改前
autossh ... -L ${DEBUG_PORT}:localhost:${DEBUG_PORT} ...

# 修改后
autossh ... -L 0.0.0.0:${DEBUG_PORT}:localhost:${DEBUG_PORT} ...
```

### 9. Chrome CDP Host header 验证失败

**问题**:

- Chrome CDP 端点对 HTTP 请求的 Host header 有严格验证
- 使用 `http://host.docker.internal:9222/json/version` 请求时，返回 500 错误：
  ```
  Host header is specified and is not an IP address or localhost.
  ```

**尝试的解决方案**:

1. 覆盖 Host header 为 `localhost:9222` - 失败（Fetch API 不允许覆盖 Host header）
2. 从容器内访问 `http://localhost:9222` - 失败（连接被拒绝，容器内 localhost 是容器自己）
3. 设置 NO_PROXY 环境变量 - 失败（问题不在代理）
4. 构造 fallback WebSocket URL - 失败（缺少 browser ID）
5. 尝试访问 `/json` 端点 - 失败（同样的 Host header 错误）

**最终解决**: 直接使用 WebSocket URL 而不是 HTTP URL：

- 从宿主机获取正确的 WebSocket URL：
  ```bash
  curl -s http://localhost:9222/json/version | jq -r .webSocketDebuggerUrl
  # 输出: ws://localhost:9222/devtools/browser/b00afe4f-d265-4898-9213-4aa34dc4f539
  ```
- 将 localhost 替换为 host.docker.internal
- 设置环境变量：`CDP_ENDPOINT=ws://host.docker.internal:9222/devtools/browser/<browser-id>`

## 最终配置

### Dockerfile

```dockerfile
# Multi-stage build
FROM node:20-alpine AS builder

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Copy source code
COPY . .

# Install dependencies (skip prepare script to avoid build)
RUN pnpm install --no-frozen-lockfile --ignore-scripts

# Rebuild native modules
RUN pnpm rebuild better-sqlite3

# Production stage
FROM node:20-alpine

# Install runtime dependencies
RUN apk add --no-cache python3 make g++
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install all dependencies (including devDependencies for ts-node)
RUN pnpm install --no-frozen-lockfile --ignore-scripts

# Rebuild native modules for production stage
RUN pnpm rebuild better-sqlite3

# Copy source files from builder
COPY --from=builder /app/src ./src
COPY --from=builder /app/examples ./examples
COPY --from=builder /app/types ./types
COPY --from=builder /app/tsconfig.json ./tsconfig.json

# Create data directory
RUN mkdir -p /data

# Environment variables
ENV PORT=3100
ENV SCREENSHOT=true
ENV DB_PATH=/data

EXPOSE 3100

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3100/api/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1) })"

CMD ["pnpm", "run", "server"]
```

### 启动命令

```bash
# 1. 获取 WebSocket URL
WS_URL=$(curl -s http://localhost:9222/json/version | jq -r .webSocketDebuggerUrl | sed 's/localhost/host.docker.internal/')

# 2. 启动容器
docker run -d \
  --name pageflow-backend \
  -p 3100:3100 \
  -e CDP_ENDPOINT="$WS_URL" \
  -e PAGEFLOW_AUTH_USER=admin \
  -e PAGEFLOW_AUTH_PASS=pagaflow \
  -e SCREENSHOT=true \
  -e PORT=3100 \
  -v ~/.pageflow:/data \
  --add-host host.docker.internal:host-gateway \
  pageflow-backend
```

### autossh 配置修改

文件: `scripts/start-autossh.sh`

```bash
# 修改端口转发绑定地址
AUTOSSH_GATETIME=0 autossh -M 0 -f -N \
  -o "ServerAliveInterval=60" \
  -o "ServerAliveCountMax=3" \
  -L 0.0.0.0:${DEBUG_PORT}:localhost:${DEBUG_PORT} \
  -p ${REMOTE_PORT} ${REMOTE_USER}@${REMOTE_HOST}
```

### SimplePageServer.ts 修改

文件: `src/SimplePageServer.ts`

添加了 CDP 连接的详细日志和错误处理，用于调试 Docker 环境下的连接问题（保留了调试日志以便后续排查）。

## 验证结果

启动后的容器日志：

```
Connecting to remote Chrome via CDP: ws://host.docker.internal:9222/devtools/browser/...
✓ Connected to remote Chrome
✓ Using existing browser context
✓ Anti-detection script injected
Successfully connected to remote Chrome
Server started on port 3100
SimplePageServer running on http://localhost:3100
```

健康检查：

```bash
curl http://localhost:3100/api/health
# {"status":"ok"}
```

容器状态：

```
CONTAINER ID   IMAGE              STATUS                    PORTS
51ba37a7681f   pageflow-backend   Up 12 seconds (healthy)   0.0.0.0:3100->3100/tcp
```

## 前后端连接

- Docker 后端：http://localhost:3100
- 前端（Next.js）：http://localhost:3102
- 前端通过 localhost:3100 访问 Docker 后端 API
