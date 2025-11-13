# Replay Schedule Feature Implementation Notes

## 背景 & 目标

- 现有 replay 仅支持手动触发，无法定时运行。
- 用户要求在后端添加“定时 replay”能力，并在前端提供配置入口。
- 需要兼容已有的远程 Chrome/CDP 部署模式，并通过 WebSocket 广播状态。

## 需求拆分

1. **服务器侧**
   - 落地持久化：记录定时任务、下次触发时间、历史状态。
   - 定时轮询队列，按计划触发 `replay()`，保留原有 loops/extractions 写法。
   - 暴露 CRUD API，返回 `next_run_at` 等关键字段，用于前端渲染。
   - 与现有广播、`replay_runs` 表对接，统一记录执行结果。
   - 提供执行超时防护：默认 10 分钟，可按任务覆盖，避免单次任务阻塞队列。

2. **前端侧**
   - 录制详情头部展示最近一次计划状态 / 下一次触发时间。
   - 新增 Modal 管理任务（创建、编辑、启停、删除、刷新）。
   - 通过 WebSocket 监听 schedule 相关事件，保持 UI 实时更新。
   - 解决既有 Modal 视觉问题：统一宽度、滚动、底部按钮布局，可配置执行超时。

## 方案设计

- **数据库**：新增 `replay_schedules` 表（`start_at` / `cron` / `interval_seconds` / `next_run_at` / options 等），并建立 recording、下次执行、启用状态索引。
- **服务层**：
  - `ReplayScheduleModel` 负责 CRUD + 查询 due 任务。
  - `ReplayScheduleService` 负责：
    - 校验录制存在，计算下一次触发时间（支持一次性、固定间隔、cron）。
    - 管理轮询定时器（默认 15s），排重并触发重放逻辑。
    - 与 `ReplayRunModel` 协同记录结果，失败时更新状态 & 推送失败事件。
    - 广播：created / updated / deleted / fired / failed，用于前端刷新。
- **路由**：`ReplayScheduleRoutes` 暴露 `/api/recordings/:id/replay-schedules`（GET/POST）与 `/api/replay-schedules/:id`（PUT/DELETE）。
- **补充接口**：`/api/recordings/:id/replay-runs` 支持 `limit` 限制条数，并在 `merge=true` 时聚合历史提取结果（应用 extraction 模板的 `$merge/$unique` 策略）。
- **前端**：
  - `useReplaySchedules` hook 统一 fetch / WebSocket 订阅 / 状态管理。
  - `ReplayScheduleModal` 进行计划配置，支持一次性、interval、cron。
  - 录制详情顶部展示 `upcomingSchedule`，新增“管理定时”按钮。
  - Modal 视觉集中重构：统一宽度、Flex 布局、单滚动、底部按钮样式，新增“超时时间”输入，与后端单位（秒）对齐。
- **启动文档**：`.claude/commands/start.md` 增加 CDP 模式示例命令以便远程 Chrome 场景。

## 实现摘要

- 新增依赖 `cron-parser`（处理 cron 表达式 & interval 计算）。
- `src/database/migrations.ts` 添加 016/017 两条迁移；自动执行后建表。
- `ServerService` 注入 `ReplayScheduleModel`；`SimplePageServer` 启动时实例化 `ReplayScheduleService` 并开启轮询，停止服务时关闭轮询。
- `BroadcastService` 增补 schedule 相关 broadcast 方法。
- 前端完成 hook、Modal、UI 调整，以及 Modal 样式修复；支持输入延迟（秒）、超时（秒）。
- 结束后实际创建计划测试：
  - 任务成功落库，`next_run_at` 自动滚动。
  - 触发 replay 会生成 `replay_runs` 记录，并更新 schedule 状态。

## 20251007 更新

- `018_add_timeout_to_replay_schedules` 迁移新增 `options_timeout_ms` 字段；`ReplayScheduleService` 默认 10 分钟超时，并在 API 层接受 `timeoutSeconds` 自定义。
- `ReplayRoutes` 对 `/api/recordings/:recordingId/replay-runs` 增加 `limit` 与 `merge` 参数：
  - `merge=false`（默认）返回原始运行记录。
  - `merge=true` 时，按 extraction 聚合历史运行数据，自动选择 `$merge` 与 `$unique` 策略并统计执行次数、最后运行时间。
- 前端 Modal 加入“超时时间（秒）”输入；展示已配置的超时时间，避免编辑时丢失。
- Modal 底部按钮区重新排版：减少多余内边距，取消双层滚动，显式放大内容区宽度（64rem 上限 / 48rem 最小值）。
- Scheduler 启动时会扫描 `last_status = 'running'` 的任务，若 `last_run_at` 超过配置/默认超时，则自动标记为 `timeout`、恢复 `next_run_at` 并推送失败事件，防止旧任务阻塞队列。
- 同步更新未完成的 `replay_runs` 记录：检测到超时时会把最新的未完成 run 标记为 `timeout`（写入 `finished_at` 与错误信息），保持前端历史列表与实际状态一致。

## 后续 & 风险

- 目前轮询周期固定 15s，可考虑改为更精细（或使用任务队列/worker）。
- 尚未做“任务并发保护”之外的资源限制（若多个任务同一时间触发）。
- 前端 Modal 仍依赖用户手动刷新列表，后续可在 `schedule-fired` 事件时高亮。
- `cron-parser` 解析若输入非法字符串会抛错，前端尚未做语法校验，可考虑补充。
- 生产环境需注意 cron 时区（当前按照传入 `timezone` 加以处理，默认使用浏览器/服务端默认时区）。
