---
allowed-tools: Bash(*), Read
description: 更新远程服务器的 pageflow 到最新版本并添加到本地
---

# 更新远程服务器 pageflow

服务器：**{{args}}**

## 服务器信息

- **tago**: 100.91.155.104, SSH: `root@100.91.155.104`, Port: 5200
- **free**: 100.74.12.43, SSH: `free-server`, Port: 3100

## 执行步骤

### 1. 获取最新版本号
```bash
npm view pageflow-cli version
```
- 记录最新版本号

### 2. 停止远程服务器所有实例
```bash
ssh [server] "pageflow stop all"
```

### 3. 更新 pageflow 到最新版本
```bash
ssh [server] "npm install -g pageflow-cli@latest"
```

### 4. 验证版本（必须和最新版本一致）
```bash
ssh [server] "pageflow --version"
```
- 确认版本号和步骤1获取的最新版本一致
- 如果不一致，报告错误

### 5. 启动默认服务器
```bash
ssh [server] "pageflow start"
```

### 6. 检查本地是否已存在同名实例
```bash
pageflow status
```
- 查看是否已有名为 {{args}} 的实例
- 如果存在本地实例（type: local），执行 `pageflow stop {{args}}`
- 如果存在远程服务器（type: remote），需要先处理（目前需要手动从 instances.json 删除）

### 7. 本地添加远程服务器
```bash
pageflow add-server http://[IP]:[Port] --name {{args}}
```

### 8. 验证
```bash
pageflow status
```

## 注意事项
- 每步执行后检查是否成功
- 报告每步的执行结果
