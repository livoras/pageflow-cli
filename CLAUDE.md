# Pageflow CLI 项目说明

## 项目架构

- **CLI 工具**：`./pageflow` - 多实例浏览器自动化和数据提取工具
- **本地实例**：可启动多个独立的本地 Pageflow 实例，每个实例有独立端口和用户数据
- **远程服务器**：可连接到远程 Pageflow 服务器（如 tago: http://100.91.155.104:5200）

## 存储位置

- **实例注册表**：`~/.pageflow/instances.json`
- **Extraction 模板**：`~/.pageflow/extractions/<id>.json`
- **实例用户数据**：`~/.pageflow/<instance-name>/user-data/`

## 实例管理

### 本地实例
```bash
# 启动默认实例（自动分配端口）
./pageflow start

# 启动命名实例
./pageflow start my-browser

# 连接到远程 Chrome（通过 CDP）
./pageflow start --cdp http://localhost:9222

# 停止实例
./pageflow stop [instance-name]

# 查看所有实例状态
./pageflow status
```

### 远程服务器
```bash
# 添加远程服务器
./pageflow add-server <url> --name <name>

# 示例
./pageflow add-server http://100.91.155.104:5200 --name tago
```

### Docker 部署（推荐）
远程服务器使用 Docker 部署 pageflow-client：
```bash
# 构建并推送镜像
cd scripts/docker/pageflow-client && ./build.sh

# 服务器部署（单实例）
docker pull crpi-vxng4q8jdjplcz7n.cn-shenzhen.personal.cr.aliyuncs.com/face-match/pageflow-client:latest
docker run -d --name pageflow-client -p 3100:3100 --restart unless-stopped \
  -v /root/.pageflow:/root/.pageflow \
  crpi-vxng4q8jdjplcz7n.cn-shenzhen.personal.cr.aliyuncs.com/face-match/pageflow-client:latest

# 同一服务器多实例（需要独立目录避免 profile 锁冲突）
docker run -d --name pageflow-tago -p 3100:3100 --restart unless-stopped \
  -v /root/.pageflow-tago:/root/.pageflow \
  crpi-vxng4q8jdjplcz7n.cn-shenzhen.personal.cr.aliyuncs.com/face-match/pageflow-client:latest
docker run -d --name pageflow-tago2 -p 3101:3100 --restart unless-stopped \
  -v /root/.pageflow-tago2:/root/.pageflow \
  crpi-vxng4q8jdjplcz7n.cn-shenzhen.personal.cr.aliyuncs.com/face-match/pageflow-client:latest
```
Docker 镜像内置 Xvfb，无需额外配置 DISPLAY。必须挂载宿主目录以持久化 cookies 和用户数据

## 数据提取

### Extraction 模板管理
```bash
# 列出所有模板
./pageflow extraction list

# 查看模板详情
./pageflow extraction show <id>

# 删除模板
./pageflow extraction delete <id1,id2,id3>
```

### 在线提取
```bash
# 使用模板ID提取（使用默认实例）
./pageflow extract <url> <extraction_id>

# 使用自定义schema文件
./pageflow extract --schema <schema-file> <url>

# 指定实例
./pageflow extract --use <instance-name> <url> <extraction_id>

# 随机选择实例
./pageflow extract --random <url> <extraction_id>

# 保存HTML（用于离线提取）
./pageflow extract --save-html <url> <output-file>

# 滚动加载
./pageflow extract <url> <extraction_id> --scrolls 5 --delay 1000

# 创建定时提取任务（推荐：所有爬虫任务都用此方式）
./pageflow extract --use <instance> --interval <minutes> --webhook <url> <url> <extraction_id>

# 例1：每 0.2 分钟提取百度搜索，结果发送到 webhook
./pageflow extract --use tago --interval 0.2 --webhook "http://localhost:8888/webhook" "https://www.baidu.com/s?wd=test" 25

# 例2：每 10 分钟提取小红书帖子详情
./pageflow extract --use tago --interval 10 --webhook "http://100.94.195.92:9999/test-webhook" "https://www.xiaohongshu.com/explore/68d10e8f00000000130047e5?xsec_token=xxx&xsec_source=pc_collect" 24

# 停止定时任务
./pageflow extract --stop-job <number>
```

### 离线提取
```bash
# 从本地HTML文件提取
./pageflow extract-html <html-file> <schema-json>
```

## Job 管理

### 查看和配置 Job
```bash
# 查看所有 job 状态
./pageflow jobs list --use <instance-name>

# 配置 job（使用 --key 和 --value）
./pageflow jobs config <job-id> --key <key> --value <value> --use <instance-name>

# 例：配置 webhook URL
./pageflow jobs config cm1fpc --key webhookUrl --value "http://100.94.195.92:9999/api/xiaohongshu/webhook" --use tago
./pageflow jobs config fskqhv --key webhookUrl --value "http://100.94.195.92:9999/api/baidu/webhook" --use tago

# 例：配置提取间隔（分钟）
./pageflow jobs config abc123 --key interval --value "10" --use tago

# 例：配置目标 URL
./pageflow jobs config abc123 --key targetUrl --value "http://example.com" --use tago
```

## 核心原则

**运行测试的目的是为了发现 pageflow 的问题，而不是为了得到运行结果。**

所有的运行都是为了检测和测试 pageflow 的问题。专注于运行中所呈现的 pageflow 的设计缺陷、架构问题和 bug，而不是仅仅让功能"能用"。

## 操作原则

**先问"应该怎么做"，再问"怎么能做到"。**

- 行动前先理解项目设计的正确使用方式
- 使用项目提供的接口，不绕过设计直接操作内部实现
- 如果发现自己在手动设置环境变量、删除锁文件、直接调用内部脚本 —— 停下来，问：我是不是走错路了？
- 目标是"正确"，不是"能跑"

**案例**：启动远程实例应该用 `ssh tago "pageflow start tago2 --port 3101"`，而不是手动拼环境变量调用 `node start-server.js`。后者导致 INSTANCE_NAME 缺失，造成 jobs 跨实例污染。

## 开发规则

- 代码输出的临时内容放到 `output/` 目录
- 不用内联样式、不创建新文件、不用Tailwind类名
- 不要使用 emoji
- 修改 `src/` 代码后，需要重启对应的本地实例才能生效
- **禁止使用 headless 模式**：服务器和本地都不允许用 `--headless` 启动 `pageflow start`

## 测试规则

- **必须使用 `./pageflow` 命令**，不要手动用 `tsx bin/pageflow.ts`
- `./pageflow` 会执行编译后的代码（dist/pageflow.js），确保测试的是实际发布的版本

## Viewer 开发

### 启动方式
```bash
# 本地开发服务器
cd viewer && pnpm dev
# 访问 http://localhost:9999

# 生产部署（ali 服务器）
bash scripts/deploy-viewer.sh
# 访问 http://8.155.175.166:7005
```

### 功能
- 展示小红书数据监控（点赞、收藏、评论变化）
- 启动新的爬虫任务（输入 URL）
- 删除数据并停止对应的 job
