# Loop 功能设计

## 背景

用户需要在录制的动作序列中支持循环操作，实现工作流式的自动化重复执行。

## 需求

1. 一个 recording 支持多个 loop
2. loop 包含连续的 action 序列，不能跨断
3. 一个 action 只能属于一个 loop
4. replay 时支持循环执行

## 数据库设计

### 新增 loops 表

```sql
CREATE TABLE loops (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recording_id INTEGER NOT NULL,
  name TEXT,
  start_sequence INTEGER NOT NULL,
  end_sequence INTEGER NOT NULL,
  loop_count INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (recording_id) REFERENCES recordings(id) ON DELETE CASCADE
);
```

### 修改 actions 表

```sql
ALTER TABLE actions ADD COLUMN loop_id INTEGER;
ALTER TABLE actions ADD CONSTRAINT fk_action_loop
  FOREIGN KEY (loop_id) REFERENCES loops(id) ON DELETE SET NULL;
```

## 约束规则

- 同一 recording 内 loop 的 sequence 范围不能重叠
- action 的 loop_id 必须对应包含其 sequence_number 的 loop

## Replay 执行逻辑

```typescript
for (const action of actions) {
  if (action.loop_id && isLoopStart(action)) {
    const loop = getLoop(action.loop_id);
    for (let i = 0; i < loop.loop_count; i++) {
      await executeLoopActions(loop.start_sequence, loop.end_sequence);
    }
  } else if (!action.loop_id) {
    await executeAction(action);
  }
}
```

## 前端功能

- 选择连续 actions 创建 loop
- 可视化显示 loop 范围
- 设置 loop 名称和循环次数
- Loop 重叠验证

## API 接口

### 获取录制的所有循环

```
GET /api/recordings/:recordingId/loops
```

**响应示例：**

```json
[
  {
    "id": 1,
    "recording_id": 36,
    "name": "Test Loop",
    "start_sequence": 1,
    "end_sequence": 2,
    "loop_count": 3,
    "created_at": "2025-09-24 03:06:44"
  }
]
```

### 创建新循环

```
POST /api/recordings/:recordingId/loops
Content-Type: application/json

{
  "name": "Test Loop",
  "start_sequence": 1,
  "end_sequence": 2,
  "loop_count": 3
}
```

**响应示例：**

```json
{
  "id": 1,
  "recording_id": 36,
  "name": "Test Loop",
  "start_sequence": 1,
  "end_sequence": 2,
  "loop_count": 3,
  "created_at": "2025-09-24 03:06:44"
}
```

### 获取特定循环

```
GET /api/loops/:loopId
```

**响应示例：**

```json
{
  "id": 1,
  "recording_id": 36,
  "name": "Test Loop",
  "start_sequence": 1,
  "end_sequence": 2,
  "loop_count": 3,
  "created_at": "2025-09-24 03:06:44"
}
```

### 更新循环

```
PUT /api/loops/:loopId
Content-Type: application/json

{
  "name": "Updated Test Loop",
  "loop_count": 5
}
```

**响应示例：**

```json
{
  "id": 1,
  "recording_id": 36,
  "name": "Updated Test Loop",
  "start_sequence": 1,
  "end_sequence": 2,
  "loop_count": 5,
  "created_at": "2025-09-24 03:06:44"
}
```

### 删除循环

```
DELETE /api/loops/:loopId
```

**响应示例：**

```json
{
  "success": true
}
```

### 验证序列范围

```
POST /api/loops/:loopId/validate
Content-Type: application/json

{
  "start_sequence": 2,
  "end_sequence": 3
}
```

**响应示例：**

```json
{
  "valid": true
}
```

## 错误响应

### 序列范围验证错误

```json
{
  "error": "start_sequence must be less than end_sequence"
}
```

### 循环重叠错误

```json
{
  "error": "Loop sequence range overlaps with existing loops"
}
```

### 循环未找到错误

```json
{
  "error": "Loop not found"
}
```

## 实施状态

- ✅ 数据库迁移完成（migrations 008、009、010）
- ✅ LoopModel 实现完成
- ✅ ActionModel 扩展完成
- ✅ API 路由实现完成
- ✅ 接口测试验证完成
