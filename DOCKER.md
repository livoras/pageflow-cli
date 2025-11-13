# Pageflow Docker 部署指南

## 概述

本文档说明如何使用 Docker 运行 Pageflow 后端服务。

## 前置条件

1. 已安装 Docker 和 Docker Compose
2. 远程 Chrome 服务已在宿主机 `localhost:9222` 上运行（通过 autossh 隧道）

## 快速启动

### 使用 Docker Compose（推荐）

1. **配置环境变量**（可选）

创建 `.env` 文件：

```bash
PAGEFLOW_AUTH_USER=admin
PAGEFLOW_AUTH_PASS=your_password
```

2. **启动服务**

```bash
docker-compose up -d
```

3. **查看日志**

```bash
docker-compose logs -f pageflow-backend
```

4. **停止服务**

```bash
docker-compose down
```

### 使用 Docker 命令

1. **构建镜像**

```bash
docker build -t pageflow-backend .
```

2. **运行容器**

```bash
docker run -d \
  --name pageflow-backend \
  -p 3100:3100 \
  -e CDP_ENDPOINT=http://host.docker.internal:9222 \
  -e PAGEFLOW_AUTH_USER=admin \
  -e PAGEFLOW_AUTH_PASS=pagaflow \
  -e SCREENSHOT=true \
  -v pageflow-data:/data \
  --add-host host.docker.internal:host-gateway \
  pageflow-backend
```

3. **查看日志**

```bash
docker logs -f pageflow-backend
```

4. **停止容器**

```bash
docker stop pageflow-backend
docker rm pageflow-backend
```

## 环境变量

| 变量名               | 默认值     | 说明                              |
| -------------------- | ---------- | --------------------------------- |
| `PORT`               | `3100`     | 服务器端口                        |
| `SCREENSHOT`         | `true`     | 是否启用截图功能                  |
| `CDP_ENDPOINT`       | -          | Chrome DevTools Protocol 端点地址 |
| `PAGEFLOW_AUTH_USER` | `admin`    | 认证用户名                        |
| `PAGEFLOW_AUTH_PASS` | `pagaflow` | 认证密码                          |
| `DB_PATH`            | `/data`    | 数据库存储路径                    |

## 数据持久化

### 使用 Docker 卷（推荐）

默认配置使用命名卷 `pageflow-data`：

```bash
# 查看卷信息
docker volume inspect pageflow-data

# 备份数据
docker run --rm -v pageflow-data:/data -v $(pwd):/backup alpine tar czf /backup/pageflow-backup.tar.gz -C /data .

# 恢复数据
docker run --rm -v pageflow-data:/data -v $(pwd):/backup alpine tar xzf /backup/pageflow-backup.tar.gz -C /data
```

### 使用宿主机目录

修改 `docker-compose.yml` 中的 volumes 配置：

```yaml
volumes:
  - ~/.pageflow:/data
```

## 连接远程 Chrome

容器使用 `host.docker.internal` 访问宿主机的 `localhost:9222`。

确保在启动 Docker 容器前，远程 Chrome 服务已启动：

```bash
# 启动远程 Chrome 和 autossh 隧道
./scripts/start-remote-and-autossh.sh

# 验证 Chrome 连接
curl http://localhost:9222/json/version
```

## 健康检查

容器包含健康检查，可通过以下方式查看：

```bash
# Docker Compose
docker-compose ps

# Docker
docker ps
```

或直接访问健康检查端点：

```bash
curl http://localhost:3100/api/health
```

## 常见问题

### 1. 容器无法连接到 Chrome

**症状**：日志显示 CDP 连接失败

**解决方法**：

- 确认宿主机上 Chrome 服务在 `localhost:9222` 运行
- 检查 `host.docker.internal` 是否正确配置（Linux 需要额外配置）

Linux 系统需要在运行容器时添加：

```bash
--add-host host.docker.internal:172.17.0.1
```

### 2. 数据库文件权限问题

**症状**：容器无法写入数据库

**解决方法**：

- 使用命名卷而非宿主机目录
- 或确保宿主机目录有正确的权限（`chown -R 1000:1000 ~/.pageflow`）

### 3. 构建失败（better-sqlite3）

**症状**：安装 better-sqlite3 时失败

**解决方法**：

- 确保 Dockerfile 中包含 `python3 make g++`
- 使用 `--no-cache` 重新构建：`docker-compose build --no-cache`

## 生产环境建议

1. **使用环境变量文件**：不要将密码硬编码
2. **配置反向代理**：使用 Nginx/Traefik 处理 SSL 和域名
3. **限制资源使用**：在 docker-compose.yml 中添加资源限制
4. **定期备份数据**：定期备份 `/data` 目录或卷
5. **监控日志**：配置日志收集和监控系统

### 资源限制示例

```yaml
services:
  pageflow-backend:
    # ... 其他配置
    deploy:
      resources:
        limits:
          cpus: "2"
          memory: 2G
        reservations:
          cpus: "1"
          memory: 1G
```

## 更新镜像

```bash
# 拉取最新代码
git pull

# 重新构建并启动
docker-compose up -d --build
```

## 清理

```bash
# 停止并删除容器
docker-compose down

# 同时删除卷（注意：会删除所有数据）
docker-compose down -v

# 删除镜像
docker rmi pageflow-backend
```
