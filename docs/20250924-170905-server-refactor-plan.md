# SimplePageServer 重构计划

## 现状

- SimplePageServer.ts: 2472 行，单一职责违反
- registerRoutes(): 2100+ 行，40+ 路由端点
- 功能耦合严重，维护困难

## 目标架构

```
src/
├── routes/                    # 路由层
│   ├── BaseRouteHandler.ts    # 抽象基类
│   ├── HealthRoutes.ts        # 健康检查
│   ├── FileRoutes.ts          # 文件服务
│   ├── PageRoutes.ts          # 页面管理
│   ├── RecordingRoutes.ts     # 录制管理
│   ├── ActionRoutes.ts        # 操作执行
│   ├── ExtractionRoutes.ts    # 数据提取
│   ├── ReplayRoutes.ts        # 回放系统
│   ├── SelectionRoutes.ts     # 选择状态
│   └── LoopRoutes.ts          # 循环功能
├── services/                  # 业务逻辑层
│   ├── PageService.ts         # 页面业务逻辑
│   ├── RecordingService.ts    # 录制业务逻辑
│   ├── ExtractionService.ts   # 提取业务逻辑
│   ├── StateManager.ts        # 状态管理服务
│   ├── BroadcastService.ts    # 业务广播服务
│   └── ServerService.ts       # 服务器生命周期管理
├── utils/                     # 工具类
│   ├── RequestValidator.ts    # 请求验证
│   ├── ResponseFormatter.ts   # 响应格式化
│   └── WebSocketManager.ts    # WebSocket 连接管理
├── types/                     # 类型定义
│   ├── Action.ts              # Action 接口
│   └── PageInfo.ts            # PageInfo 接口
└── SimplePageServer.ts        # 服务器入口
```

## 端点分组详情

### HealthRoutes

- `GET /api/health`

### FileRoutes

- `GET /api/recordings/:recordingId/files/:filename`
- `GET /api/recordings/:recordingId/data/:filename`

### PageRoutes

- `GET/POST /api/pages`
- `DELETE /api/pages/:pageId`
- `GET /api/pages/:pageId` (页面信息)
- `POST /api/pages/:pageId/navigate`
- `POST /api/pages/:pageId/navigate-back`
- `POST /api/pages/:pageId/navigate-forward`
- `POST /api/pages/:pageId/reload`
- `GET /api/pages/:pageId/structure`
- `GET /api/pages/:pageId/screenshot`
- `GET /api/pages/:pageId/html`
- `GET /api/pages/:pageId/xpath/:encodedId`
- `POST /api/pages/:pageId/element-info`

### RecordingRoutes

- `GET /api/recordings`
- `GET /api/recordings/:recordingId`
- `GET /api/actions/:actionId`
- `GET /api/actions` (批量查询)
- `DELETE /api/pages/:pageId/records` (写操作)
- `DELETE /api/pages/:pageId/actions/:actionId` (写操作)

### ActionRoutes

- `POST /api/pages/:pageId/act-xpath`
- `POST /api/pages/:pageId/act-id`
- `POST /api/pages/:pageId/wait`
- `POST /api/pages/:pageId/condition`
- `POST /api/pages/:pageId/highlight`
- `POST /api/pages/:pageId/unhighlight`
- `POST /api/pages/:pageId/clear-highlights`
- `POST /api/pages/:pageId/highlight-cdp`
- `POST /api/pages/:pageId/clear-cdp-highlights`
- `POST /api/pages/:pageId/enable-inspect-mode`
- `POST /api/pages/:pageId/disable-inspect-mode`

### ExtractionRoutes

- `GET/POST/PUT/DELETE /api/extractions`
- `GET /api/extractions/:id`
- `POST /api/pages/:pageId/get-list-html`
- `POST /api/pages/:pageId/get-list-html-by-parent`
- `POST /api/pages/:pageId/get-element-html`
- `POST /api/recordings/:pageId/actions/:actionIndex/extract`
- `POST /api/recordings/:pageId/actions/:actionIndex/rerun-extraction`
- `PUT/GET/DELETE /api/recordings/:recordingId/actions/:actionIndex/extracts`

### SelectionRoutes

- `GET/PUT /api/selection`
- `GET/PUT /api/extraction-selection`
- `GET /api/selected-action`
- `GET /api/selected-extraction`

### ReplayRoutes

- `POST /api/replay`
- `POST /api/recordings/:pageId/actions/:actionIndex/postscripts/:scriptIndex/run`
- `DELETE /api/recordings/:pageId/actions/:actionIndex/postscripts/:scriptIndex`
- `GET /api/recordings/:pageId/actions/:actionIndex/postscripts/:scriptIndex`

### LoopRoutes

- `GET/POST /api/recordings/:recordingId/loops`
- `GET/PUT/DELETE /api/loops/:loopId`
- `POST /api/loops/:loopId/validate`

## 核心组件迁移

### 接口和类型定义 (23-60行)

- **Action接口**: 动作数据结构定义
- **PageInfo接口**: 页面信息数据结构定义
- 迁移到 `/src/types/` 目录

### 服务器状态管理 (67-78行)

- `pages`: Map<string, PageInfo> - 活跃页面管理
- `selectedActionIds`: Set<number> - 选中的Action ID
- `selectedExtractionIds`: Set<number> - 选中的Extraction ID
- 数据库模型实例 (RecordingModel, ActionModel等)
- WebSocket 客户端连接管理

### 服务器生命周期方法

- `start()` (2248-2282行) - 服务器启动逻辑
- `stop()` (2284-2310行) - 服务器停止逻辑
- `initDatabase()` (2312-2334行) - 数据库初始化
- `initBrowser()` (2336-2386行) - 浏览器初始化

### 业务逻辑方法

- `broadcast()` (2388-2395行) - WebSocket 广播逻辑
- `createPage()` (2397-2458行) - 页面创建业务逻辑
- `closePage()` (2460-2471行) - 页面关闭业务逻辑

### 构造函数逻辑 (80-107行)

- Express 应用初始化
- CORS 配置 (内联实现，不独立提取)
- 路由注册

### 迁移方案

- **StateManager**: 管理 pages, selectedActionIds, selectedExtractionIds 状态
- **ServerService**: 包含服务器生命周期方法 (start, stop, initDatabase, initBrowser)
- **PageService**: 第一阶段创建空壳，第二阶段提取页面业务逻辑 (createPage, closePage)
- **WebSocketManager**: 纯粹的连接管理和消息发送
- **BroadcastService**: 处理业务相关的广播逻辑 (broadcast方法)

## 两阶段重构计划

### 第一阶段：路由分离（按风险级别）

#### 阶段1.1: 基础设施搭建

- 创建目录结构 `/src/routes/`, `/src/services/`, `/src/utils/`, `/src/types/`
- 迁移接口定义: Action.ts, PageInfo.ts 到 types 目录
- 实现 BaseRouteHandler 抽象类
- 实现 StateManager, WebSocketManager, ServerService, PageService (空壳)
- 建立依赖注入机制和路由注册系统

#### 阶段1.2: 最低风险模块（验证可行性）

- **HealthRoutes**: 迁移健康检查端点
- **FileRoutes**: 迁移静态文件服务端点

#### 阶段1.3: 低风险只读模块

- **RecordingRoutes (只读部分)**: 查询类端点

#### 阶段1.4: 中等风险业务模块

- **PageRoutes**: 页面生命周期管理
- **RecordingRoutes (写操作)**: 删除操作端点

#### 阶段1.5: 高风险交互模块

- **ActionRoutes**: 元素操作和高亮功能
- **SelectionRoutes**: 状态同步和实时通信
- **BroadcastService**: 迁移 broadcast 方法，支持选择状态广播

#### 阶段1.6: 最高风险复杂模块

- **ExtractionRoutes**: 数据提取和Schema管理
- **ReplayRoutes**: 动作回放和PostScript系统
- **LoopRoutes**: 循环控制功能

#### 阶段1.7: 服务器核心重构

- **ServerService 迁移**: 将服务器生命周期方法迁移到 ServerService
- **构造函数精简**: 保留基础的 Express 和 CORS 配置
- **依赖注入完成**: SimplePageServer 通过依赖注入使用各种服务

#### 阶段1.8: 清理旧代码

- 移除 registerRoutes() 中已迁移的路由代码
- SimplePageServer 精简为服务器启动入口和依赖注入容器

### 第二阶段：业务逻辑分离

#### 阶段2.1: 服务层抽取

- **PageService**: 从 SimplePageServer 提取页面业务逻辑到已创建的 PageService (createPage, closePage等)
- **RecordingService**: 从 RecordingRoutes 提取数据处理逻辑
- **ExtractionService**: 从 ExtractionRoutes 提取提取算法逻辑
- **ServerService**: 已在阶段1.7完成，包含服务器生命周期管理
- **BroadcastService**: 已在阶段1.5完成，统一管理所有业务广播逻辑

#### 阶段2.2: 依赖注入优化

- 路由层通过构造函数注入服务层依赖
- 统一错误处理和日志记录
- 实现服务层单元测试

#### 阶段2.3: 最终优化 🚧

- ✅ 引入 `RequestValidator` / `ResponseFormatter`，统一请求校验与标准响应格式
- ✅ BaseRouteHandler 错误处理改造，集中处理 `ValidationError` 并输出一致日志
- ✅ PageRoutes / ActionRoutes / RecordingRoutes / LoopRoutes 等高频路由去重，替换重复的 ID 解析、必填校验与成功响应模式
- ✅ FileRoutes / SelectionRoutes 对齐响应工具，减少硬编码状态码
- 🔜 继续梳理服务层与剩余路由的潜在重复逻辑，补充缺失单元测试

## 风险控制

- 新旧路由并存
- 环境变量开关控制
- 每步独立验证

## 重构方法论基本法

### 核心原则：增量重构与验证

**基本法则：一次只做一小步，删掉老代码，测试通过后才进行下一步**

#### 1. 单步重构原则

- 每次只迁移 1-2 个相关端点
- 立即删除对应的旧代码
- 不允许新旧代码长期并存
- 每步都必须通过测试验证

#### 2. 验证标准流程

1. **代码迁移**：创建新的路由处理器
2. **集成替换**：在 SimplePageServer 中集成新路由，删除旧路由
3. **启动测试**：启动服务器确保没有语法错误
4. **功能验证**：使用 curl 测试端点功能正常
5. **确认通过**：只有测试完全通过才进行下一步

#### 3. 测试验证方法

```bash
# 启动服务器
PORT=3100 SCREENSHOT=true pnpm run server

# 在另一个终端测试端点
curl http://localhost:3100/api/health
curl http://localhost:3100/api/pages
# ... 其他相关端点

# 确认返回正确的 JSON 响应
```

#### 4. 成功标准

每个阶段完成的标志：

1. 新路由处理器功能完整
2. 旧代码完全删除
3. 服务器启动无错误
4. 所有相关端点 curl 测试通过
5. 功能行为与迁移前完全一致

**只有满足所有5个标准，才能进入下一个迁移阶段**

## 实施进度记录

### 已完成阶段

#### 阶段1.1: 基础设施搭建 ✅

- ✅ 创建目录结构：routes/, services/, utils/, types/
- ✅ 迁移接口定义：Action.ts, PageInfo.ts 到 types 目录
- ✅ 实现 BaseRouteHandler 抽象类
- ✅ 实现 StateManager, WebSocketManager, ServerService, PageService (空壳)
- ✅ 建立依赖注入机制和路由注册系统

#### 阶段1.2: 最低风险模块验证 ✅

- ✅ **HealthRoutes**: 迁移健康检查端点
  - 创建 `src/routes/HealthRoutes.ts`
  - 删除 SimplePageServer 中旧代码
  - 测试通过: `curl http://localhost:3100/api/health` → `{"status":"ok"}`
- ✅ **FileRoutes**: 迁移静态文件服务端点
  - 创建 `src/routes/FileRoutes.ts`
  - 处理 `/api/recordings/:recordingId/files/:filename` 和 `/api/recordings/:recordingId/data/:filename`
  - 删除 SimplePageServer 中旧文件服务代码
  - 测试通过: 两个端点都正确返回 `{"error":"File not found"}`

#### 当前进行阶段

#### 阶段1.3: 低风险只读模块 ✅

- ✅ **RecordingRoutes (只读部分)**: 迁移完成并测试通过
  - 创建 `src/routes/RecordingRoutes.ts`
  - 创建 `src/services/ServerService.ts` 提供数据库访问
  - 删除 SimplePageServer 中旧路由代码
  - 测试通过的端点：
    - `GET /api/recordings` → 返回39条录制记录 ✅
    - `GET /api/recordings/:recordingId` → 返回录制详情和动作列表 ✅
    - `GET /api/actions/:actionId` → 返回单个动作详情 ✅
    - `GET /api/actions?ids=108,109,110` → 批量查询动作 ✅

#### 阶段1.4: 中等风险业务模块 ✅

- ✅ **PageRoutes**: 迁移完成并测试通过
  - 创建 `src/routes/PageRoutes.ts`
  - 迁移页面生命周期管理端点
  - 删除 SimplePageServer 中旧路由代码
  - 测试通过
- ✅ **RecordingRoutes (写操作)**: 写操作端点迁移完成
  - 数据提取相关端点：`POST /api/recordings/:pageId/actions/:actionIndex/extract`
  - 提取重运行：`POST /api/recordings/:recordingId/actions/:actionIndex/rerun-extraction`
  - 提取管理：`GET/PUT/DELETE /api/recordings/:recordingId/actions/:actionIndex/extracts`

#### 阶段1.5: 高风险交互模块 ✅

- ✅ **ActionRoutes**: 迁移完成并测试通过
  - 创建 `src/routes/ActionRoutes.ts`
  - 迁移元素操作和高亮功能端点
  - 测试通过
- ✅ **SelectionRoutes**: 迁移完成并测试通过
  - 创建 `src/routes/SelectionRoutes.ts`
  - 迁移状态同步和实时通信端点
  - 测试通过

#### 阶段1.6: 最高风险复杂模块 ✅

- ✅ **ExtractionRoutes**: 迁移完成并测试通过
  - 创建 `src/routes/ExtractionRoutes.ts`
  - 迁移数据提取和Schema管理端点 (5个CRUD端点)
  - 测试通过：`GET /api/extractions` → 返回13个提取模板 ✅
- ✅ **ReplayRoutes**: 迁移完成并测试通过
  - 创建 `src/routes/ReplayRoutes.ts`
  - 迁移动作回放端点
  - 测试通过
- ✅ **LoopRoutes**: 迁移完成并测试通过
  - 创建 `src/routes/LoopRoutes.ts`
  - 迁移循环控制功能端点 (6个端点)
  - 测试通过：`GET /api/recordings/43/loops` → 返回循环列表 ✅

#### 阶段1.7: 服务器核心重构 ✅

- ✅ **ServerService 迁移**: 数据库初始化责任迁移到 ServerService
  - 实现 `async initialize()` 方法提供自管理的数据库初始化
  - 删除 SimplePageServer 中重复的数据库初始化代码 (32行)
  - 更新 `start()` 方法使用 ServerService 初始化数据库
  - 修复所有模型访问通过 ServerService getter 方法
- ✅ **构造函数精简**: SimplePageServer 构造函数优化
  - 保留基础的 Express 和 CORS 配置
  - 通过依赖注入使用 ServerService
- ✅ **依赖注入完成**: 完整的服务层架构

#### 阶段1.8: 清理旧代码 ✅

- ✅ 移除 registerRoutes() 中已迁移的路由代码
- ✅ SimplePageServer 精简为服务器启动入口和依赖注入容器
- ✅ 从 2472 行精简到 621 行，删除超过 1800 行旧代码

### 第一阶段总结 ✅

**路由模块化重构完成** - 9个模块，56个API端点全部迁移

- HealthRoutes (1个端点) + FileRoutes (2个端点) + RecordingRoutes (9个端点)
- PageRoutes (13个端点) + ActionRoutes (13个端点) + SelectionRoutes (6个端点)
- ExtractionRoutes (5个端点) + ReplayRoutes (1个端点) + LoopRoutes (6个端点)
- ServerService核心重构，数据库初始化责任分离
- 严格遵循"一步步重构测试"方法论，每步都删除旧代码并验证

### 第二阶段实施进度

#### 阶段2.1: 服务层抽取 ✅

- ✅ **PageService**: 从 SimplePageServer 提取页面业务逻辑完成
  - 迁移 `createPage()` 和 `closePage()` 方法到 PageService
  - 实现依赖注入：接收 StateManager、ServerService 和 BrowserContext
  - 集成广播回调机制，支持 WebSocket 事件广播
  - SimplePageServer 通过 PageService 处理页面生命周期
  - 测试验证：页面创建和 WebSocket 事件广播功能正常

- ✅ **RecordingService**: 从 RecordingRoutes 提取数据处理逻辑完成
  - 迁移所有录制相关业务逻辑到 RecordingService (287行代码)
  - 包含方法：`getAllRecordings()`, `getRecordingById()`, `getActionById()`, `getActionsByIds()`
  - 包含提取相关：`getActionExtracts()`, `updateActionExtracts()`, `clearActionExtracts()`
  - 包含数据处理：`rerunExtraction()`, `extractDataFromAction()`
  - RecordingRoutes 从520行精简到244行，通过服务层处理业务逻辑
  - 测试验证：所有录制相关 API 功能正常

- ✅ **关键修复**: action-extractions 显示问题和 replay 高亮功能
  - 修复 `getActionExtracts()` API 返回格式不匹配问题
  - 修复 SimplePageServer WebSocket 客户端管理，确保 replay 事件广播正常
  - 验证 WebSocket 事件完整性：replay-started, replay-action-start, replay-action-complete
  - 前端 action 卡片高亮功能恢复正常

- ✅ **ExtractionService**: 从 ExtractionRoutes 提取算法逻辑完成
  - 迁移所有提取相关业务逻辑到 ExtractionService (114行代码)
  - 包含方法：`getAllExtractions()`, `getExtractionById()`, `createExtraction()`, `updateExtraction()`, `deleteExtraction()`
  - ExtractionRoutes 从复杂数据库逻辑精简到简单服务调用
  - 测试验证：所有提取相关 API 功能正常

- ✅ **BroadcastService**: 统一管理业务广播逻辑完成
  - 创建统一的 WebSocket 事件广播服务 (46行代码)
  - 包含方法：`broadcast()`, `broadcastPageCreated()`, `broadcastActionRecorded()`, `broadcastReplayStarted()` 等
  - SimplePageServer 集成 BroadcastService，替换直接 WebSocket 管理
  - 整合所有业务相关的 WebSocket 事件分发

#### 阶段2.2: 依赖注入优化 ✅

- ✅ **路由层依赖注入完善**: 修复类型定义和依赖注入系统
  - 修复 RecordingRoutes 构造函数参数类型从 any 到 StateManager/WebSocketManager
  - 统一所有路由类的构造函数类型定义
  - 修复 SimplePageServer 中的构造函数调用参数匹配
  - 测试验证：服务器正常启动，无 TypeScript 编译错误

- ✅ **统一错误处理机制**: BaseRouteHandler 错误处理增强
  - 实现智能错误状态码映射 (ValidationError→400, NotFoundError→404等)
  - 添加详细错误日志记录（timestamp, stack trace）
  - 统一错误响应格式，包含时间戳
  - 新增便利日志方法: logInfo(), logWarning()

- ✅ **服务层日志系统**: 实现全面的日志记录
  - 创建通用 Logger 工具类 (src/utils/Logger.ts)
  - 支持服务特定的日志记录器实例
  - 提供统一日志格式: [timestamp] [level] [service] message
  - 集成到 RecordingService 作为示例实现
  - 实测日志输出：成功记录服务操作和数据统计

### 重构方法论执行状况

- ✅ 严格遵循"一次一小步"原则
- ✅ 每步都删除旧代码，避免新旧并存
- ✅ 每个模块迁移后立即测试验证
- ✅ 服务器在每次重构后都能正常启动
- ✅ 系统性验证所有 API 格式与前端期望一致
- ✅ 修复重构过程中发现的回归问题

## 预期效果

- 模块化程度大幅提升
- 维护性显著改善
- 单一职责原则得到遵循
