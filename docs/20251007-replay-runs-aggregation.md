# Replay Runs Aggregation & Merge Flow

## 背景

定时任务或手动重放同一条 Recording 时，旧实现只返回原始 `replay_runs` 记录，前端若想看到聚合后的提取结果，需要自行遍历每一次运行，体验较差。我们为 `/api/recordings/:recordingId/replay-runs` 增加了 `merge=true` 支持，同时补齐 `limit` 参数，用于：

- 只关心最近 N 次运行的提取数据；
- 对同一 extraction 的结果执行 `$merge` + `$unique` 策略，并提供合并后的列表与统计信息；
- 仍保留原始 run 列表（默认 `merge=false`）。

## 请求与响应

```
GET /api/recordings/:recordingId/replay-runs?limit=2&merge=true

响应：
{
  "recordingId": 33,
  "runsCount": 2,                // 本次参与聚合的 run 数量
  "aggregated": [
    {
      "extractionId": 23,
      "strategy": { "merge": "concat", "unique": "url" },
      "runs": 2,                  // 有多少 run 提供了该 extraction 的数据
      "lastRunAt": "2025-10-07T13:40:47.451Z",
      "data": [ ...合并后的结果数组... ]
    }
  ]
}
```

- `limit`：可选，默认不限制；用于截取最新 N 次 run 参与聚合。
- `merge=true`：启用聚合模式；不带该参数时返回原始 run 列表。

## 合并流程

1. **取 Run 列表**：`ReplayRunModel.getByRecordingId(recordingId, limit)` 会按 `created_at DESC` 取最新 run。上例中返回 run #220 和 #219。
2. **分桶**：遍历每条 run 的 `extractions`，按 `extractionId` 建立聚合桶，累计：
   - `pieces`：同一 extraction 在各 run 的原始数组；
   - `runs`：该 extraction 出现的次数；
   - `lastRunAt`：记录该 extraction 最近一次 run 的时间。
3. **策略选择**：
   - 优先读取 extraction 本身定义的 `strategy.merge`；若为空则调用 `autoDetectMergeStrategy`（数组默认 `concat`）。
   - 拿到第一个 `piece` 后作为合并的基准数据结构。
4. **应用 `$merge`**：调用 `applyMergeStrategy(pieces, strategy.merge)`，将多个数组按顺序拼接或按其他策略归并。
5. **应用 `$unique`**（可选）：若 extraction 的 `strategy.unique` 存在，则运行 `applyUniqueStrategy` 去重。支持：
   - `string`：单字段（如 `"url"`）；
   - `string[]`：多字段组合键；
   - `{ by: string | string[], keep: 'first' | 'last' }`：同时指定保留顺序。
   - `null`：针对原始值（如 primitive 数组）。

## 示例：Recording 33

- 两次 run 的 extraction 23 均产出 7 条数据，总计 14 条；
- `strategy.merge = "concat"`，顺序为最新 run 220 在前、run 219 在后；
- `strategy.unique = "url"`，分别从内容中提取 `url` 字段生成去重键；
- 由于两次 run 的 url 参数不同，本次没有重复项被剔除；若未来 run 再次返回相同 url，`keep: 'first'` 会保留最早出现的那条记录。

## 设计注意事项

- 聚合 API 仅作为“快照”使用，不会修改原始 `replay_runs` 表；前端如需单 run 详情，可继续用 `merge=false` 或访问 `/api/replay-runs/:id`。
- 由于 `limit` 在数据库层截取 run 列表，最终 `aggregated.data` 数量可能少于 `limit * 每 run 数据量`，具体取决于 `$unique` 的去重规则。
- 当前聚合仅针对 extraction 结果；若未来需要合并 `errors` 或其他字段，可在 `ReplayRoutes` 中扩展聚合结构。
