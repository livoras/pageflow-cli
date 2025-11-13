# Temporary Authentication Overview

## 目标

- 部署环境暂时只允许内部成员访问，因此在 Express API 与 Viewer 之间增加一层简易登录保护。
- 本期实现采取“写死用户名密码 + 内存会话”方案，后续可逐步替换成持久化或 SSO。

## 后端实现

- 新增 `AuthService`：
  - 校验固定凭据（默认 `admin / pagaflow`，可通过 `PAGEFLOW_AUTH_USER` / `PAGEFLOW_AUTH_PASS` 覆盖）。
  - 生成 UUID 作为会话 token，保存在内存 Map，默认 12 小时过期。
  - 负责写入/清除 `pf_session` HttpOnly Cookie，并提供中间件 `requireAuth`。
- 新增 `/api/login`、`/api/logout`、`/api/session` 三个路由（`AuthRoutes`）。
  - 登录成功写入 Cookie 并返回用户名。
  - 登出清理 Cookie 并移除会话（无论当前是否存在）。
  - `GET /api/session` 用于前端轮询登录状态，未授权时返回 401。
- `SimplePageServer` 在注册业务路由前挂载 `authService.requireAuth`，并将 `/api/health`、`/api/login`/`logout` 标记为公开路径。
- WebSocket 握手阶段读取同一 Cookie，未通过校验时直接以 `1008` 关闭连接，避免订阅推送。
- CORS 头部新增 `Access-Control-Allow-Credentials: true` 与 `X-Session-Token`，前端所有 Fetch 默认携带凭据。

## 前端改动

- `simple-page-viewer` 新增 `useAuth` Hook 和 `/login` 页面：
  - 打开页面先调用 `/api/session`，未登录停留在登录页，已登录跳转 `/`。
  - 登录表单提交后写入 Cookie 并跳回主界面；右上角支持“退出登录”。
- 所有 API 请求通过封装的 `authorizedFetch`，默认 `credentials: "include"`。
- Viewer 主页面在渲染前强制等待 `useAuth` 校验；未认证用户会被重定向到 `/login`。
- 直接访问数据文件（HTML/JSON/Snapshot）的 `fetch` 同样增加 `credentials`，确保跨端口 Cookie 能被携带。

## 使用说明

1. 启动后端：
   ```bash
   CDP_ENDPOINT=http://localhost:9222 \
   PAGEFLOW_AUTH_USER=admin \
   PAGEFLOW_AUTH_PASS=pagaflow \
   PORT=3100 SCREENSHOT=true pnpm run server
   ```
2. 前端访问 http://localhost:3102/login ，输入用户名/密码登录，成功后进入原有控制台。
3. 如需临时更换口令或延长会话时间，可修改环境变量或调整 `AuthService` 构造参数。

> 注意：当前会话信息仅存于进程内存，重启服务会导致所有用户下线；若后续引入多实例部署，需要切换到共享存储（Redis/数据库）或标准身份系统。
