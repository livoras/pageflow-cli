# Loop Count 显示修复与编辑功能

## 问题描述

workflow UI 中 loop count 没有显示。NodeGroup 组件中 loopCount 显示为 undefined。

## 问题定位

通过在数据流各个环节添加 debug 日志，发现：

- ActionWorkflow 正确创建了带 loopCount: 42 的 group
- WorkflowContainer 正确接收到 loopCount: 42
- NodeGroup 接收到的 loopCount 为 undefined

根本原因：WorkflowLayoutEngine.prepareGroupBounds() 方法在创建 layout bounds 时没有复制 loopCount 字段。

## 修复内容

### 1. 数据流修复

修改 WorkflowLayoutEngine.ts：

- 在 GroupConfig 接口添加 `loopCount?: number`
- 在 LayoutResult.groupBounds 类型定义添加 loopCount 字段
- 修改 prepareGroupBounds() 方法，复制 loopCount 字段：

```typescript
this.config.groups.forEach((group) => {
  bounds.set(group.id, {
    id: group.id,
    name: group.name,
    loopCount: group.loopCount, // 添加此行
    nodes: group.nodes,
    style: group.style,
    resizable: group.resizable,
  });
});
```

修改 WorkflowContainer.tsx：

- 在 GroupData 接口添加 `loopCount?: number`
- 在 finalWorkflowConfig 映射时传递 loopCount

### 2. 显示格式

NodeGroup 组件显示格式：`(×${loopCount})`

示例：Loop Name (×42)

### 3. 编辑功能

实现 loop count 双击编辑：

- 双击 loopCount 数字进入编辑模式
- 输入框宽度固定 30px
- 验证规则：必须是正整数（>= 1）
- 无效输入时恢复原值
- 支持 Enter 确认、Escape 取消、失焦保存

### 4. 标题编辑 UI 修复

问题：编辑标题时，输入框使用 `length * 7` 计算宽度，中文字符被截断。

解决方案：使用 HTML input 元素的 size 属性，它能正确处理多字节字符：

```typescript
<input
  size={Math.max(5, editingTitleValue.length + 2)}
  style={{ maxWidth: '200px' }}
/>
```

### 5. 后端验证

LoopRoutes.ts 中已有 loop_count 验证：

- POST 创建时：loop_count 默认为 1
- PUT 更新时：验证 loop_count >= 1
- 无效值返回 400 错误

## 修改文件

- simple-page-viewer/src/components/Workflow/WorkflowLayoutEngine.ts
- simple-page-viewer/src/components/Workflow/WorkflowContainer.tsx
- simple-page-viewer/src/components/Workflow/NodeGroup.tsx
- simple-page-viewer/src/components/Workflow/WorkflowCanvas.tsx
- simple-page-viewer/src/components/ActionWorkflow/index.tsx

## 提交记录

- commit 13c1f977: feat: implement loop count display and editing in workflow UI
- commit ec70ba7a: docs: update database storage location in CLAUDE.md

## 其他更新

更新 CLAUDE.md 中数据库存储位置描述：

- 旧描述：{系统临时目录}/simplepage/recordings.db
- 新描述：~/.pageflow/recordings.db（可通过 DB_PATH 环境变量自定义）
