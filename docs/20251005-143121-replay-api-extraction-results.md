# Replay API 提取结果返回设计

## 时间

2025-10-05 14:31

## 背景

简化 replay API (`POST /api/recordings/:recordingId/replay`)，在响应中直接返回所有 extraction 的最终结果。

## API 设计

### 请求

```
POST /api/recordings/:recordingId/replay
```

### 响应格式

```json
{
  "success": true,
  "executedActions": 8,
  "errors": [],
  "extractions": [
    {
      "extractionId": 23,
      "extractionName": "百度搜索结果提取",
      "data": [
        { "title": "...", "url": "...", "description": "..." },
        { "title": "...", "url": "...", "description": "..." }
      ]
    },
    {
      "extractionId": 24,
      "extractionName": "价格提取",
      "data": [
        { "price": "99", "name": "..." },
        { "price": "199", "name": "..." }
      ]
    }
  ]
}
```

## 字段说明

### `extractions` 数组

- 包含所有执行过的 extraction 的最终结果
- 每个元素包含：
  - `extractionId`: extraction ID
  - `extractionName`: extraction 名称
  - `data`: 提取到的数据数组（最终结果）

### `data` 字段处理规则

- **单次执行的 extraction**: 直接返回提取结果
- **Loop 中的 extraction**: 返回多次迭代合并去重后的最终结果
- 不返回中间过程数据
- 不返回每次迭代的详细信息

## 示例场景

假设一个 recording 包含：

- Action 2: 提取商品标题（extraction 23）- 单次执行
- Action 4: 提取价格（extraction 24）- 在 loop 中执行 3 次
- Action 6: 提取评论（extraction 25）- 单次执行

返回的 `extractions` 数组包含 3 个元素，每个 extraction 的 `data` 都是最终的去重合并结果。

## 实现位置

- 后端: `src/routes/ReplayRoutes.ts` - POST /api/recordings/:recordingId/replay
- 前端: `simple-page-viewer/src/lib/api.ts` - replayActions 函数
