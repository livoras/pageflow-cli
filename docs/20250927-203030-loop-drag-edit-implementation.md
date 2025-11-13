# Loop 拖拽编辑功能实现

## 项目目标

实现工作流UI中通过拖拽group边界来编辑loop action范围的功能。用户可以通过拖拽紫色边框组来修改loop的start_sequence和end_sequence，更改会自动保存到数据库。

## 技术架构

### 前端

- React/TypeScript with Next.js App Router (端口 3102)
- 工作流UI组件系统 with NodeGroup拖拽功能
- 互斥系统防止组重叠

### 后端

- Node.js/Express (端口 3100)
- SQLite数据库 with LoopModel和ActionModel
- REST API端点用于loop CRUD操作

### 数据结构

- Loop: id, recording_id, name, start_sequence, end_sequence, loop_count, created_at
- 序列号映射：0-based action indexes to 1-based sequences

## 实现的功能

### 1. Loop 可视化显示

- 使用现有workflow group系统显示loop
- 紫色边框样式区分loop组：`borderColor: '#8b5cf6'`, `backgroundColor: 'rgba(139, 92, 246, 0.08)'`
- 显示格式：`${loop.name || 'Loop'} (×${loop.loop_count})`

### 2. 可调整大小的Group

- 启用 `resizable: true` 属性
- 拖拽手柄组件支持边界调整
- 实时预览拖拽效果

### 3. 双向数据流

- 拖拽操作 → API调用 → 状态更新
- 序列号转换：action-{index} ↔ start_sequence/end_sequence

## 代码修改

### `/simple-page-viewer/src/lib/api.ts`

添加loop管理API函数：

```typescript
export async function updateLoop(
  loopId: number,
  updates: {
    name?: string;
    start_sequence?: number;
    end_sequence?: number;
    loop_count?: number;
  },
): Promise<Loop> {
  const response = await fetch(`${API_BASE_URL}/api/loops/${loopId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  if (!response.ok) throw new Error("Failed to update loop");
  const data = await response.json();
  return data.loop;
}

export async function deleteLoop(
  loopId: number,
): Promise<{ success: boolean }> {
  const response = await fetch(`${API_BASE_URL}/api/loops/${loopId}`, {
    method: "DELETE",
  });
  if (!response.ok) throw new Error("Failed to delete loop");
  return response.json();
}
```

### `/simple-page-viewer/src/components/ActionWorkflow/index.tsx`

实现拖拽编辑逻辑：

```typescript
const groups = useMemo(() => {
  return loops.map((loop) => ({
    id: `loop-${loop.id}`,
    name: `${loop.name || "Loop"} (×${loop.loop_count})`,
    nodes: Array.from(
      { length: loop.end_sequence - loop.start_sequence + 1 },
      (_, i) => `action-${loop.start_sequence - 1 + i}`,
    ),
    resizable: true,
    style: {
      borderColor: "#8b5cf6",
      backgroundColor: "rgba(139, 92, 246, 0.08)",
      borderRadius: "12px",
      paddingHorizontal: "20",
      paddingVertical: "40",
    },
  }));
}, [loops]);

const handleGroupNodesChange = async (groupId: string, newNodes: string[]) => {
  const loopId = parseInt(groupId.replace("loop-", ""));
  if (isNaN(loopId)) return;

  const nodeIndexes = newNodes
    .map((nodeId) => parseInt(nodeId.replace("action-", "")))
    .filter((index) => !isNaN(index))
    .sort((a, b) => a - b);

  if (nodeIndexes.length === 0) return;

  const newStartSequence = nodeIndexes[0] + 1;
  const newEndSequence = nodeIndexes[nodeIndexes.length - 1] + 1;

  try {
    const updatedLoop = await updateLoop(loopId, {
      start_sequence: newStartSequence,
      end_sequence: newEndSequence,
    });
    setLoops((prevLoops) =>
      prevLoops.map((loop) => (loop.id === loopId ? updatedLoop : loop)),
    );
  } catch (error) {
    console.error("Failed to update loop:", error);
  }
};
```

### `/src/routes/LoopRoutes.ts`

修复API端点错误：

- 移除无效的 `updated_at: new Date().toISOString()` 字段
- 确保PUT请求正确更新loop数据

## API设计

### 获取loops

```
GET /api/recordings/{recordingId}/loops
Response: { loops: Loop[] }
```

### 更新loop

```
PUT /api/loops/{loopId}
Body: { start_sequence?: number, end_sequence?: number, ... }
Response: { loop: Loop }
```

### 删除loop

```
DELETE /api/loops/{loopId}
Response: { success: boolean }
```

## 测试结果

### API测试

- ✅ 成功修复 `updated_at` 字段错误
- ✅ PUT /api/loops/1 更新测试通过
- ✅ 将loop 1序列从 (2,3) 更新到 (1,3)

### 服务状态

- ✅ 后端服务运行在端口 3100
- ✅ 前端服务运行在端口 3102
- ✅ WebSocket连接正常

### 功能验证

- ✅ 录制11包含测试循环 (id: 1, start_sequence: 1, end_sequence: 3, loop_count: 2)
- ✅ 可在 http://localhost:3102?id=11 查看和测试拖拽功能
- ✅ 循环显示为紫色边框组，支持拖拽边界修改

## 已完成任务

1. ✅ 为loop groups启用resizable属性
2. ✅ 实现handleGroupNodesChange回调函数
3. ✅ 添加loop更新API调用
4. ✅ 处理拖拽后的状态更新
5. ✅ 测试拖拽功能
6. ✅ Loop标题双击编辑功能

## 技术要点

- 序列号转换：0-based action index → 1-based database sequence
- 互斥系统：现有workflow group不支持重叠
- 实时更新：拖拽操作立即触发API调用和状态同步
- 错误处理：网络请求失败时保持UI状态一致性

## Loop标题编辑功能

### 组件层级结构

```
ActionWorkflow (index.tsx)
  └─ WorkflowContainer
      └─ WorkflowCanvas
          └─ NodeGroup
```

### 实现的功能

- 双击Loop标题进入编辑模式
- 回车键确认保存
- 失去焦点自动保存
- ESC键取消编辑
- 组件通过props提供编辑能力控制和事件回调

### 代码修改

#### NodeGroup组件 (`src/components/Workflow/NodeGroup.tsx`)

添加Props:

```typescript
interface NodeGroupProps {
  // ... 原有props
  titleEditable?: boolean;
  onTitleChange?: (newTitle: string) => void;
}
```

状态管理:

```typescript
const [isEditingTitle, setIsEditingTitle] = React.useState(false);
const [editingTitleValue, setEditingTitleValue] = React.useState(name || "");
```

事件处理函数:

- `handleTitleDoubleClick`: 检查titleEditable，进入编辑模式
- `handleTitleSubmit`: 退出编辑，调用onTitleChange
- `handleTitleCancel`: 取消编辑，恢复原值
- `handleTitleKeyDown`: 处理Enter和Escape键
- `handleTitleBlur`: 失去焦点时提交

#### WorkflowCanvas组件 (`src/components/Workflow/WorkflowCanvas.tsx`)

传递props到NodeGroup:

```typescript
<NodeGroup
  titleEditable={titleEditable}
  onTitleChange={onGroupTitleChange ? (newTitle) => onGroupTitleChange(group.id, newTitle) : undefined}
/>
```

#### WorkflowContainer组件 (`src/components/Workflow/WorkflowContainer.tsx`)

透传props:

```typescript
<WorkflowCanvas
  titleEditable={titleEditable}
  onGroupTitleChange={onGroupTitleChange}
/>
```

#### ActionWorkflow组件 (`src/components/ActionWorkflow/index.tsx`)

实现标题更新处理:

```typescript
const handleGroupTitleChange = async (groupId: string, newTitle: string) => {
  const loopId = parseInt(groupId.replace("loop-", ""));
  if (isNaN(loopId)) return;

  const currentLoop = loops.find((loop) => loop.id === loopId);
  if (!currentLoop) return;

  try {
    const updatedLoop = await updateLoop(loopId, {
      name: newTitle,
    });
    setLoops((prevLoops) =>
      prevLoops.map((loop) => (loop.id === loopId ? updatedLoop : loop)),
    );
  } catch (error) {
    console.error("Failed to update loop title:", error);
  }
};
```

启用编辑:

```typescript
<WorkflowContainer
  titleEditable={true}
  onGroupTitleChange={handleGroupTitleChange}
/>
```

### 数据流

编辑保存流程:

1. 用户双击NodeGroup标题
2. NodeGroup检查titleEditable prop
3. 设置isEditingTitle = true，渲染input元素
4. 用户按Enter或失去焦点
5. NodeGroup调用onTitleChange(newTitle) prop
6. WorkflowCanvas接收，调用onGroupTitleChange(groupId, newTitle)
7. WorkflowContainer透传到ActionWorkflow
8. ActionWorkflow执行handleGroupTitleChange
9. 调用API updateLoop(loopId, { name: newTitle })
10. 更新本地loops状态
