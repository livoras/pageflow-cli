# Workflow 布局引擎实现

## 实现时间

2025-09-27

## 背景

之前的 workflow UI 使用手动指定的节点间距（如 `marginBottom: '56px'`），当 group 动态变化时无法自动调整布局，需要手动修改每个节点的样式。

## 实现目标

创建一个声明式的布局引擎，根据节点、连接、分组配置自动计算所有元素的位置和间距。

## 架构设计

### 数据流

```
WorkflowConfig (声明式配置)
  ↓
WorkflowLayoutEngine (计算)
  ↓
LayoutResult (布局数据)
  ↓
WorkflowCanvas (渲染)
```

### 核心组件

#### 1. WorkflowLayoutEngine (WorkflowLayoutEngine.ts)

布局计算引擎，包含以下方法：

- `calculate()`: 主入口，返回完整的布局结果
- `getNodeOrder()`: 获取节点排序
- `analyzeGroupBoundaries()`: 分析 group 边界节点
- `calculateNodeSpacing()`: 计算每个节点的上下间距
- `calculateNodePositions()`: 计算节点的绝对位置
- `calculateConnectionPaths()`: 计算连接线类型
- `prepareGroupBounds()`: 准备 group 配置数据

#### 2. 配置参数

```typescript
defaultNodeHeight = 136;
defaultNodeSpacing = 24; // 普通节点间距
groupPadding = { vertical: 40, horizontal: 20 }; // group 边界额外间距
```

#### 3. 边界识别逻辑

- 识别每个 group 的第一个节点和最后一个节点
- 第一个节点：`marginTop` 增加 `groupPadding.vertical`
- 最后一个节点：`marginBottom` 增加 `groupPadding.vertical`

### 代码结构

#### WorkflowContainer.tsx

```typescript
// 声明式配置
const workflowConfig: WorkflowConfig = {
  nodes: [...],
  connections: [...],
  groups: [...]
};

// 计算布局
const layout = useMemo(() => {
  const engine = new WorkflowLayoutEngine(workflowConfig);
  return engine.calculate();
}, [workflowConfig]);

// 传递给 Canvas
<WorkflowCanvas layout={layout} ... />
```

#### WorkflowCanvas.tsx

```typescript
// 接收布局数据
{
  (layout, allNodes, onGroupNodesChange);
}

// 注入计算后的间距
React.Children.map(children, (child) => {
  // 修改每个 Node 的 marginTop/marginBottom
  // 保持外层 div 结构
});
```

#### Node.tsx

- 移除了默认的 `margin: '16px 0'`
- 完全由布局引擎控制间距

## 实现效果

1. 节点间距由布局引擎统一管理（24px）
2. group 边界前后自动增加额外间距（40px）
3. 当拖拽调整 group 范围时，布局自动重新计算
4. 无需手动指定任何节点的具体间距

## 已删除的手动配置

- `Node id="node-1" style={{ marginBottom: '56px' }}`
- `Node id="node-4" style={{ marginTop: '56px' }}`
- WorkflowContainer 中的 debug 日志
- NodeGroup 中的 debug 日志

## 文件清单

### 新增

- `simple-page-viewer/src/components/Workflow/WorkflowLayoutEngine.ts`

### 修改

- `simple-page-viewer/src/components/Workflow/WorkflowContainer.tsx`
- `simple-page-viewer/src/components/Workflow/WorkflowCanvas.tsx`
- `simple-page-viewer/src/components/Workflow/Node.tsx`
- `simple-page-viewer/src/components/Workflow/NodeGroup.tsx`

## 当前状态

- 布局引擎已实现并正常工作
- 拖拽调整 group 功能正常
- 节点间距为 24px
- 整体布局居中显示
