# 单节点循环支持实现

## 背景

系统原本使用 `sequence_number` 字段标识循环的起止范围，限制循环必须包含至少2个action。需要迁移到基于 `action_id` 的架构，并支持单节点循环（一个action重复执行多次）。

## 架构变更

### 从 sequence_number 迁移到 action_id

**旧架构：**

- loops 表使用 `start_sequence` 和 `end_sequence` 字段
- actions 表包含 `sequence_number` 字段
- 验证逻辑：`start_sequence < end_sequence`

**新架构：**

- loops 表使用 `start_action_id` 和 `end_action_id` 字段
- actions 表移除 `sequence_number` 字段
- 验证逻辑：`start_action_id <= end_action_id`（允许相等）

## 数据库迁移

### 迁移 011: 移除 sequence_number 并重建 loops

文件：`src/database/migrations.ts`

**步骤：**

1. 备份现有 loops 数据并转换为 action_id

```sql
CREATE TEMPORARY TABLE loops_backup AS
SELECT l.*,
       (SELECT MIN(a.id) FROM actions a WHERE a.recording_id = l.recording_id
        AND a.sequence_number >= l.start_sequence) as start_action_id,
       (SELECT MAX(a.id) FROM actions a WHERE a.recording_id = l.recording_id
        AND a.sequence_number <= l.end_sequence) as end_action_id
FROM loops l
```

2. 重建 loops 表

```sql
CREATE TABLE IF NOT EXISTS loops (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recording_id INTEGER NOT NULL,
  name TEXT,
  start_action_id INTEGER NOT NULL,
  end_action_id INTEGER NOT NULL,
  loop_count INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (recording_id) REFERENCES recordings(id) ON DELETE CASCADE,
  FOREIGN KEY (start_action_id) REFERENCES actions(id) ON DELETE CASCADE,
  FOREIGN KEY (end_action_id) REFERENCES actions(id) ON DELETE CASCADE
)
```

3. 恢复数据并清理

```sql
INSERT INTO loops (id, recording_id, name, start_action_id, end_action_id, loop_count, created_at)
SELECT id, recording_id, name, start_action_id, end_action_id, loop_count, created_at
FROM loops_backup
WHERE start_action_id IS NOT NULL AND end_action_id IS NOT NULL
```

4. 重建 actions 表（移除 sequence_number 列）
5. 重建索引

### 迁移 012: 修改外键约束支持单节点循环

文件：`src/database/migrations.ts`

**目的：**
防止误删被循环引用的 action，将 loops 表的外键约束从 CASCADE 改为 RESTRICT。

**变更：**

```sql
-- 旧约束
FOREIGN KEY (start_action_id) REFERENCES actions(id) ON DELETE CASCADE
FOREIGN KEY (end_action_id) REFERENCES actions(id) ON DELETE CASCADE

-- 新约束
FOREIGN KEY (start_action_id) REFERENCES actions(id) ON DELETE RESTRICT
FOREIGN KEY (end_action_id) REFERENCES actions(id) ON DELETE RESTRICT
```

## 后端修改

### 1. LoopModel (src/database/models/LoopModel.ts)

**修改点：**

- **create()** - 第25行

  ```typescript
  // 旧验证
  if (loop.start_sequence >= loop.end_sequence) {
    throw new Error("start_sequence must be less than end_sequence");
  }

  // 新验证
  if (loop.start_action_id > loop.end_action_id) {
    throw new Error(
      "start_action_id must be less than or equal to end_action_id",
    );
  }
  ```

- **update()** - 第147行：相同的验证修改
- **validateActionRange()** - 第265行：相同的验证修改
- 添加了 action 存在性验证
- 更新了重叠检测逻辑使用 action_id

### 2. LoopRoutes (src/routes/LoopRoutes.ts)

**修改点：**

- **POST /api/recordings/:recordingId/loops** - 第71行

  ```typescript
  // 旧验证
  if (startActionId >= endActionId) { ... }

  // 新验证
  if (startActionId > endActionId) { ... }
  ```

- **PUT /api/loops/:loopId** - 第150-154行：相同的验证修改
- **POST /api/loops/:loopId/validate** - 第248行：相同的验证修改

### 3. SimplePage (src/SimplePage.ts)

**修改点：**

- 添加 `loopModel` 属性（第96行）
- 构造函数接受 `loopModel` 参数（第108-119行）
- **deleteAction()** - 添加循环引用检查（第1136-1152行）
  ```typescript
  if (this.loopModel) {
    const allLoops = this.loopModel.getByRecordingId(this.recordingId);
    const referencingLoops = allLoops.filter(
      (loop) =>
        loop.start_action_id === actionId || loop.end_action_id === actionId,
    );
    if (referencingLoops.length > 0) {
      const loopNames = referencingLoops
        .map((l) => l.name || `Loop ${l.id}`)
        .join(", ");
      throw new Error(
        `Cannot delete action: it is referenced by loop(s): ${loopNames}. ` +
          `Please delete or modify the loop(s) first.`,
      );
    }
  }
  ```
- 移除 action 创建时的 `sequence_number` 字段（第276行）

### 4. ActionModel (src/database/models/ActionModel.ts)

**修改点：**

- **create()** - 移除 sequence_number 计算和插入逻辑（第61-96行）
- **getByRecordingId()** - 改用 `ORDER BY id` 替代 `ORDER BY sequence_number`（第122行）
- **delete()** - 移除 resequence 逻辑（第175-189行）
- **getByLoopId()** - 改用 `ORDER BY id` 替代 `ORDER BY sequence_number`（第206行）
- 重命名方法：`getBySequenceRange()` → `getByIdRange()`
- 重命名方法：`updateLoopId()` 参数从 sequence 改为 action_id

### 5. PageService (src/services/PageService.ts)

**修改点：**

- **createPage()** - 第56行，SimplePage 构造函数调用添加 `loopModel` 参数
  ```typescript
  const simplePage = new SimplePage(
    page,
    this.serverService.getRecordingModel() || undefined,
    this.serverService.getActionModel() || undefined,
    this.serverService.getLoopModel() || undefined, // 新增
    name,
    description,
    enableScreenshot,
    recordActions,
  );
  ```

## 前端修改

### ActionWorkflow (simple-page-viewer/src/components/ActionWorkflow/index.tsx)

**修改点：**

1. **groups** - 第86-109行：使用 action_id 查找循环中的 actions

   ```typescript
   const loopActionIds = recording.actions
     .filter(
       (action) =>
         action.id &&
         action.id >= loop.start_action_id &&
         action.id <= loop.end_action_id,
     )
     .map((action) => {
       const actionIndex = recording.actions.findIndex(
         (a) => a.id === action.id,
       );
       return `action-${actionIndex}`;
     });
   ```

2. **handleGroupNodesChange()** - 第125-158行：使用 action_id 更新循环
3. **getAllGroupedNodes()** - 第176-186行：使用 action_id 查找
4. **confirmCreateLoop()** - 第204-242行：
   - 第205行：`>= 2` → `>= 1`
   - 第209行：`>= 2` → `>= 1`
   - 使用 action_id 创建循环

5. **UI文本和按钮** - 第298-314行：
   - 第301行：`disabled={selectedNodes.length < 2}` → `< 1`
   - 第304行：`selectedNodes.length >= 2` → `>= 1`
   - 第367行：提示文本改为"需要至少选择1个节点"

### API类型 (simple-page-viewer/src/lib/api.ts)

**修改点：**

- Loop 接口使用 `start_action_id` 和 `end_action_id` 替代 `start_sequence` 和 `end_sequence`
- 移除 Action 接口的 `sequence_number` 字段
- 更新 `createLoop()` 和 `updateLoop()` 函数签名

## 测试验证

### 单节点循环创建测试

```bash
curl -X POST http://localhost:3100/api/recordings/11/loops \
  -H "Content-Type: application/json" \
  -d '{
    "name": "单节点循环测试",
    "start_action_id": 32,
    "end_action_id": 32,
    "loop_count": 5
  }'
```

**结果：**

```json
{
  "loop": {
    "id": 8,
    "recording_id": 11,
    "name": "单节点循环测试",
    "start_action_id": 32,
    "end_action_id": 32,
    "loop_count": 5,
    "created_at": "2025-09-28T00:07:22.000Z"
  }
}
```

### 删除保护测试

尝试删除被循环引用的 action：

```bash
curl -X DELETE http://localhost:3100/api/pages/9d743d52-7620-4d34-9c76-21658b29ac27/actions/32
```

**结果：**
数据库外键约束阻止删除：

```
SqliteError: FOREIGN KEY constraint failed
```

## 提交信息

**Commit:** 173e6397

**Message:**

```
feat: implement single-node loop support

- Remove sequence_number architecture and migrate to action_id-based system
- Add database migration 011 to remove sequence_number and rebuild loops with action IDs
- Add database migration 012 to modify loop foreign key constraints from CASCADE to RESTRICT
- Update LoopModel validation to allow single-node loops (start_action_id == end_action_id)
- Update LoopRoutes validation to allow single-node loops
- Add action deletion protection in SimplePage to prevent deleting actions referenced by loops
- Update ActionWorkflow frontend to support single-node loop creation
- Update API types to use start_action_id/end_action_id instead of start_sequence/end_sequence
```

**Branch:** workflow-ui

**Modified Files:**

- simple-page-viewer/src/components/ActionWorkflow/index.tsx
- simple-page-viewer/src/lib/api.ts
- src/SimplePage.ts
- src/database/migrations.ts
- src/database/models/ActionModel.ts
- src/database/models/LoopModel.ts
- src/routes/LoopRoutes.ts
- src/services/PageService.ts
- 其他相关文件

## 数据库状态

当前数据库包含：

- 11个录制会话
- 29个actions
- 3个loops（包括1个单节点循环）
- 4个提取模板

数据库路径：`~/.pageflow/recordings.db`
