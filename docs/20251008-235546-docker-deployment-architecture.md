# Pageflow Docker 部署架构

## 服务器信息

- **服务器地址**: 8.155.175.166
- **SSH 端口**: 7070
- **部署目录**: /root/git/pageflow
- **数据目录**: ~/.pageflow

## 端口映射

| 服务       | 容器内端口 | 宿主机端口    | 外部访问                              |
| ---------- | ---------- | ------------- | ------------------------------------- |
| Backend    | 3100       | 8006          | http://8.155.175.166:8006             |
| Frontend   | 3102       | 8007          | http://8.155.175.166:8007             |
| Chrome CDP | 9222       | 19222 (nginx) | 容器内通过 host.docker.internal:19222 |

## 架构设计

### 网络架构

```
Docker 容器 (pageflow-network)
├── pageflow-backend (172.19.0.x)
│   ├── 监听: 3100
│   ├── 映射: 8006:3100
│   └── CDP: http://host.docker.internal:19222
│
└── pageflow-frontend (172.19.0.x)
    ├── 监听: 3102
    ├── 映射: 8007:3102
    └── 后端: http://backend:3100

宿主机服务
├── Chrome (127.0.0.1:9222)
└── Nginx (0.0.0.0:19222 → 127.0.0.1:9222)
    └── 设置 Host: localhost:9222 (解决 Chrome Host header 验证)
```

### Chrome CDP 访问链路

```
Docker 容器
  ↓ host.docker.internal:19222
Nginx 代理 (0.0.0.0:19222)
  ↓ proxy_pass + Host: localhost:9222
Chrome (127.0.0.1:9222)
```

**关键问题与解决方案：**

1. **问题**: Chrome `--remote-debugging-address=0.0.0.0` 在非 headless 模式下不生效，只监听 127.0.0.1
2. **问题**: Chrome 验证 Host header，拒绝域名（如 host.docker.internal），只接受 localhost 或 IP
3. **解决**: 使用 nginx 反向代理，设置 `proxy_set_header Host localhost:9222`

## 关键文件

### Docker 配置

**docker-compose.prod.yml** (生产环境配置)

```yaml
services:
  backend:
    image: crpi-vxng4q8jdjplcz7n.cn-shenzhen.personal.cr.aliyuncs.com/face-match/pageflow-backend:latest
    ports: ["8006:3100"]
    environment:
      - CDP_ENDPOINT=http://host.docker.internal:19222
    volumes:
      - ~/.pageflow:/data
      - ~/.simple-page-server/user-data:/root/.simple-page-server/user-data
    extra_hosts:
      - "host.docker.internal:host-gateway"
    networks:
      - pageflow-network

  frontend:
    image: crpi-vxng4q8jdjplcz7n.cn-shenzhen.personal.cr.aliyuncs.com/face-match/pageflow-frontend:latest
    ports: ["8007:3102"]
    environment:
      - BACKEND_URL=http://backend:3100
    depends_on:
      backend:
        condition: service_healthy
    networks:
      - pageflow-network
```

**Dockerfile** (后端)

```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile --prod
COPY . .
RUN pnpm run build
EXPOSE 3100
CMD ["pnpm", "run", "server"]
```

**simple-page-viewer/Dockerfile** (前端)

```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build
EXPOSE 3102
CMD ["pnpm", "run", "start", "-p", "3102"]
```

### Nginx 配置

**服务器路径**: /etc/nginx/sites-available/chrome-cdp

```nginx
server {
    listen 19222;
    listen [::]:19222;

    location / {
        proxy_pass http://127.0.0.1:9222;
        proxy_http_version 1.1;
        proxy_set_header Host localhost:9222;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 86400;
    }
}
```

**启用配置**:

```bash
ln -sf /etc/nginx/sites-available/chrome-cdp /etc/nginx/sites-enabled/chrome-cdp
systemctl reload nginx
```

### 前端 API 代理配置

**simple-page-viewer/next.config.ts**

```typescript
async rewrites() {
  const backendUrl = process.env.BACKEND_URL ||
    (process.env.NODE_ENV === 'production'
      ? 'http://pageflow-backend:3100'
      : 'http://localhost:3100');

  return [
    {
      source: '/api/:path*',
      destination: `${backendUrl}/api/:path*`
    }
  ];
}
```

**simple-page-viewer/src/lib/config.ts** (WebSocket 配置)

```typescript
export function getWebSocketUrl(): string {
  if (typeof window === "undefined") return "";

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.hostname;

  let port: string;
  if (window.location.port === "8007") {
    port = "8006"; // Docker production
  } else if (window.location.port === "3102") {
    port = "3100"; // Development
  } else {
    port = "3100"; // Default
  }

  return `${protocol}//${host}:${port}/ws`;
}
```

## 部署脚本

### 构建脚本

**scripts/docker/build.sh**

```bash
#!/bin/bash
set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$PROJECT_ROOT"

# 构建后端
docker build --platform linux/amd64 \
  -t pageflow-backend:latest \
  -t crpi-vxng4q8jdjplcz7n.cn-shenzhen.personal.cr.aliyuncs.com/face-match/pageflow-backend:latest .

# 构建前端
cd simple-page-viewer
docker build --platform linux/amd64 \
  -t pageflow-frontend:latest \
  -t crpi-vxng4q8jdjplcz7n.cn-shenzhen.personal.cr.aliyuncs.com/face-match/pageflow-frontend:latest .
```

### 部署脚本

**scripts/docker/deploy.sh** (完整部署流程)

```bash
#!/bin/bash
set -e

REGISTRY="crpi-vxng4q8jdjplcz7n.cn-shenzhen.personal.cr.aliyuncs.com"
NAMESPACE="face-match"
BACKEND_IMAGE="${REGISTRY}/${NAMESPACE}/pageflow-backend:latest"
FRONTEND_IMAGE="${REGISTRY}/${NAMESPACE}/pageflow-frontend:latest"
SERVER="root@8.155.175.166"
SERVER_PORT="7070"
DEPLOY_PATH="/root/git/pageflow"

# 步骤 1: 构建镜像
docker build --platform linux/amd64 -t "${BACKEND_IMAGE}" .
cd simple-page-viewer
docker build --platform linux/amd64 -t "${FRONTEND_IMAGE}" .
cd ..

# 步骤 2: 推送到阿里云
docker push "${BACKEND_IMAGE}"
docker push "${FRONTEND_IMAGE}"

# 步骤 3: 同步配置到服务器
scp -P "${SERVER_PORT}" docker-compose.prod.yml "${SERVER}:${DEPLOY_PATH}/docker-compose.yml"

# 步骤 4: 在服务器上部署
ssh -p "${SERVER_PORT}" "${SERVER}" << 'ENDSSH'
cd /root/git/pageflow
docker compose pull
docker compose down
docker compose up -d
docker compose ps
ENDSSH
```

### 本地测试脚本

**scripts/docker/start.sh**

```bash
#!/bin/bash
docker-compose up -d
```

**scripts/docker/stop.sh**

```bash
#!/bin/bash
docker-compose down
```

**scripts/docker/restart.sh**

```bash
#!/bin/bash
docker-compose down
docker-compose up -d
```

## 部署流程

### 完整部署步骤

1. **本地构建镜像**

   ```bash
   ./scripts/docker/build.sh
   ```

2. **推送到阿里云**

   ```bash
   docker push crpi-vxng4q8jdjplcz7n.cn-shenzhen.personal.cr.aliyuncs.com/face-match/pageflow-backend:latest
   docker push crpi-vxng4q8jdjplcz7n.cn-shenzhen.personal.cr.aliyuncs.com/face-match/pageflow-frontend:latest
   ```

3. **同步配置到服务器**

   ```bash
   scp -P 7070 docker-compose.prod.yml root@8.155.175.166:/root/git/pageflow/docker-compose.yml
   ```

4. **服务器部署**

   ```bash
   ssh -p 7070 root@8.155.175.166
   cd /root/git/pageflow
   docker compose pull
   docker compose down
   docker compose up -d
   ```

5. **验证部署**
   ```bash
   docker compose ps
   curl http://localhost:8006/api/health
   curl http://localhost:8007
   ```

### 一键部署

```bash
./scripts/docker/deploy.sh
```

## 数据持久化

### 挂载目录

| 容器路径                            | 宿主机路径                      | 用途            |
| ----------------------------------- | ------------------------------- | --------------- |
| /data                               | ~/.pageflow                     | 数据库文件      |
| /root/.simple-page-server/user-data | ~/.simple-page-server/user-data | Chrome 用户数据 |
| /tmp/simplepage                     | ~/.pageflow/recordings          | 录制文件        |

### 数据文件

- **数据库**: ~/.pageflow/recordings.db
- **WAL 文件**: ~/.pageflow/recordings.db-wal
- **录制文件**: ~/.pageflow/recordings/\*.json

## 服务管理

### 查看状态

```bash
ssh -p 7070 root@8.155.175.166 'cd /root/git/pageflow && docker compose ps'
```

### 查看日志

```bash
ssh -p 7070 root@8.155.175.166 'cd /root/git/pageflow && docker compose logs -f'
ssh -p 7070 root@8.155.175.166 'cd /root/git/pageflow && docker compose logs backend --tail 50'
```

### 重启服务

```bash
ssh -p 7070 root@8.155.175.166 'cd /root/git/pageflow && docker compose restart'
```

### 更新服务

```bash
# 本地重新构建并推送
./scripts/docker/deploy.sh

# 或手动更新
ssh -p 7070 root@8.155.175.166 'cd /root/git/pageflow && docker compose pull && docker compose up -d'
```

## 镜像信息

### 阿里云容器镜像仓库

- **地址**: crpi-vxng4q8jdjplcz7n.cn-shenzhen.personal.cr.aliyuncs.com
- **命名空间**: face-match
- **后端镜像**: face-match/pageflow-backend:latest
- **前端镜像**: face-match/pageflow-frontend:latest

### 登录命令

```bash
docker login crpi-vxng4q8jdjplcz7n.cn-shenzhen.personal.cr.aliyuncs.com
```

## 环境变量

### 后端环境变量

| 变量名       | 值                                | 说明            |
| ------------ | --------------------------------- | --------------- |
| NODE_ENV     | production                        | 运行环境        |
| PORT         | 3100                              | 监听端口        |
| SCREENSHOT   | true                              | 启用截图        |
| DB_PATH      | /data                             | 数据库目录      |
| CDP_ENDPOINT | http://host.docker.internal:19222 | Chrome CDP 地址 |

### 前端环境变量

| 变量名      | 值                  | 说明         |
| ----------- | ------------------- | ------------ |
| NODE_ENV    | production          | 运行环境     |
| PORT        | 3102                | 监听端口     |
| BACKEND_URL | http://backend:3100 | 后端服务地址 |

## 健康检查

### 后端健康检查

```bash
curl http://localhost:8006/api/health
# 返回: {"status":"ok"}
```

### 前端健康检查

```bash
curl -I http://localhost:8007
# 返回: HTTP/1.1 200 OK
```

### Docker 健康检查配置

**后端**:

```yaml
healthcheck:
  test:
    [
      "CMD",
      "node",
      "-e",
      "require('http').get('http://localhost:3100/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})",
    ]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 10s
```

**前端**:

```yaml
healthcheck:
  test:
    [
      "CMD",
      "node",
      "-e",
      "require('http').get('http://localhost:3102', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})",
    ]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 10s
```

## 认证配置

当前部署：**无认证模式**

如需启用认证，在 docker-compose.prod.yml 中添加：

```yaml
environment:
  - PAGEFLOW_AUTH_USER=admin
  - PAGEFLOW_AUTH_PASS=your_password
```

## 访问地址

- **前端界面**: http://8.155.175.166:8007
- **后端 API**: http://8.155.175.166:8006
- **API 文档**: http://8.155.175.166:8006/api/health
- **录制列表**: http://8.155.175.166:8006/api/recordings
