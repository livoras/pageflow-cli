# Pageflow Docker 生产环境部署

## 概述

本文档说明如何使用 Docker 将 Pageflow 部署到生产服务器。

## 服务器信息

- **服务器**：8.155.175.166
- **SSH 端口**：7070
- **部署目录**：`/root/git/pageflow`
- **远程 Chrome**：需要在服务器上运行 Chrome + autossh 隧道

## 前置条件

### 本地环境

1. Docker 已安装
2. 已登录阿里云容器镜像仓库
   ```bash
   docker login crpi-vxng4q8jdjplcz7n.cn-shenzhen.personal.cr.aliyuncs.com
   ```
3. SSH 密钥已配置到服务器

### 服务器环境

1. Docker 和 Docker Compose 已安装
2. 远程 Chrome 服务已启动（通过 autossh 隧道）

   ```bash
   # 在本地启动 autossh 隧道
   ./scripts/start-remote-and-autossh.sh

   # 验证 Chrome 连接
   curl http://localhost:9222/json/version
   ```

## 部署方式

### 一键部署（推荐）

```bash
./scripts/docker/deploy.sh
```

这个脚本会自动完成：

1. 构建前后端 Docker 镜像（多平台 linux/amd64）
2. 推送镜像到阿里云容器镜像仓库
3. 同步配置文件到服务器
4. 在服务器上拉取镜像并启动容器

### 手动部署步骤

#### 1. 构建镜像

```bash
./scripts/docker/build.sh
```

或手动构建：

```bash
# 后端
docker build --platform linux/amd64 \
  -t crpi-vxng4q8jdjplcz7n.cn-shenzhen.personal.cr.aliyuncs.com/pageflow/backend:latest .

# 前端
cd simple-page-viewer
docker build --platform linux/amd64 \
  -t crpi-vxng4q8jdjplcz7n.cn-shenzhen.personal.cr.aliyuncs.com/pageflow/frontend:latest .
```

#### 2. 推送到阿里云

```bash
docker push crpi-vxng4q8jdjplcz7n.cn-shenzhen.personal.cr.aliyuncs.com/pageflow/backend:latest
docker push crpi-vxng4q8jdjplcz7n.cn-shenzhen.personal.cr.aliyuncs.com/pageflow/frontend:latest
```

#### 3. 同步配置到服务器

```bash
scp -P 7070 docker-compose.prod.yml root@8.155.175.166:/root/git/pageflow/docker-compose.yml
scp -P 7070 .env.docker root@8.155.175.166:/root/git/pageflow/.env
```

#### 4. 在服务器上启动

```bash
ssh -p 7070 root@8.155.175.166
cd /root/git/pageflow
docker compose pull
docker compose down
docker compose --env-file .env up -d
```

## 配置文件说明

### docker-compose.prod.yml

生产环境 Docker Compose 配置：

```yaml
services:
  backend:
    image: crpi-xxx.aliyuncs.com/pageflow/backend:latest
    ports: ["8006:3100"]
    environment:
      - CDP_ENDPOINT=http://host.docker.internal:9222
      - PAGEFLOW_AUTH_USER=${PAGEFLOW_AUTH_USER}
      - PAGEFLOW_AUTH_PASS=${PAGEFLOW_AUTH_PASS}
    volumes:
      - ~/.pageflow:/data
      - ~/.simple-page-server/user-data:/root/.simple-page-server/user-data
      - ~/.pageflow/recordings:/tmp/simplepage
    extra_hosts:
      - "host.docker.internal:host-gateway"

  frontend:
    image: crpi-xxx.aliyuncs.com/pageflow/frontend:latest
    ports: ["8007:3102"]
    environment:
      - BACKEND_URL=http://backend:3100
    depends_on:
      backend:
        condition: service_healthy
```

### .env.docker

环境变量配置：

```bash
PAGEFLOW_AUTH_USER=admin
PAGEFLOW_AUTH_PASS=pagaflow
```

## 数据持久化

所有重要数据都挂载到服务器的 `~/.pageflow` 目录：

- **数据库**：`~/.pageflow/recordings.db`
- **Chrome 用户数据**：`~/.simple-page-server/user-data`
- **录制文件**：`~/.pageflow/recordings/`

## 网络架构

```
服务器 (8.155.175.166)
├── Docker 网络 (pageflow-network)
│   ├── pageflow-backend (容器内 3100)
│   │   └── 连接到 host.docker.internal:9222 (远程 Chrome)
│   └── pageflow-frontend (容器内 3102)
│       └── 连接到 backend:3100
│
├── 宿主机端口映射
│   ├── 8006 → backend:3100
│   └── 8007 → frontend:3102
│
└── 远程 Chrome (通过 autossh 隧道)
    └── localhost:9222 → 远程服务器 Chrome
```

## 访问地址

部署成功后：

- **前端**：http://8.155.175.166:8007
- **后端 API**：http://8.155.175.166:8006
- **健康检查**：http://8.155.175.166:8006/api/health

## 服务管理

### 查看日志

```bash
ssh -p 7070 root@8.155.175.166 'cd /root/git/pageflow && docker compose logs -f'
```

### 查看状态

```bash
ssh -p 7070 root@8.155.175.166 'cd /root/git/pageflow && docker compose ps'
```

### 重启服务

```bash
ssh -p 7070 root@8.155.175.166 'cd /root/git/pageflow && docker compose restart'
```

### 停止服务

```bash
ssh -p 7070 root@8.155.175.166 'cd /root/git/pageflow && docker compose down'
```

### 更新服务

```bash
# 1. 本地重新构建并推送
./scripts/docker/deploy.sh

# 或手动更新
ssh -p 7070 root@8.155.175.166 'cd /root/git/pageflow && docker compose pull && docker compose up -d'
```

## 本地测试

在部署到生产环境之前，可以在本地测试 Docker 配置：

```bash
# 启动
./scripts/docker/start.sh

# 停止
./scripts/docker/stop.sh

# 重启
./scripts/docker/restart.sh
```

访问地址：

- 前端：http://localhost:8007
- 后端：http://localhost:8006

## 故障排查

### 容器无法连接到远程 Chrome

**症状**：后端日志显示无法连接到 CDP

**解决方法**：

1. 确认服务器上 autossh 隧道正在运行

   ```bash
   ./scripts/start-remote-and-autossh.sh
   ```

2. 验证 Chrome 可访问

   ```bash
   curl http://localhost:9222/json/version
   ```

3. 检查 Docker `extra_hosts` 配置是否正确

### 健康检查失败

**症状**：容器状态显示 unhealthy

**解决方法**：

```bash
# 查看容器日志
docker compose logs backend

# 检查健康检查端点
curl http://localhost:8006/api/health
```

### 数据库权限问题

**症状**：无法写入数据库

**解决方法**：

```bash
# 确保目录存在且权限正确
ssh -p 7070 root@8.155.175.166 'mkdir -p ~/.pageflow ~/.simple-page-server/user-data'
```

## 安全建议

1. **修改默认密码**：编辑 `.env.docker` 修改 `PAGEFLOW_AUTH_PASS`
2. **配置防火墙**：只开放必要端口 8006、8007
3. **使用 HTTPS**：配置 Nginx 反向代理
4. **定期备份**：备份 `~/.pageflow` 目录

## 更新日志

- 2025-10-08: 创建初始部署文档
- 参考 face-match 项目的部署方案
- 支持多平台构建和阿里云镜像仓库
