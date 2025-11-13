# 拖拽视觉反馈修复

## 问题描述

extraction 拖拽到 action card 上的视觉反馈不显示，功能正常但缺少拖拽时的边框高亮效果。

## 根本原因

Node 组件的 `overflow: 'hidden'` 样式导致 ActionCard 的拖拽视觉效果被裁剪。

## 技术背景

- 组件层级：Node (容器) > ActionCard (内容)
- Node 宽度：400px
- Node overflow: 'hidden'
- ActionCard 的拖拽视觉效果使用 CSS 伪元素，超出容器边界被裁剪

## 解决方案

### 方案设计

将拖拽视觉反馈从 ActionCard 层级移动到 Node 层级，利用 Node 现有的视觉系统。

### 具体实现

#### 1. Node 组件修改

**文件：** `/Users/djh/git/pagaflow/simple-page-viewer/src/components/Workflow/Node.tsx`

- 添加 `isDragOver` prop 到 NodeProps 接口
- 实现动态样式函数：
  - `getBorderColor()`: 拖拽时蓝色 (#3b82f6)，选中时绿色 (#10b981)，默认灰色 (#e5e7eb)
  - `getBackgroundColor()`: 拖拽时浅蓝 (#eff6ff)，选中时浅绿 (#f0fdf4)，默认白色 (#ffffff)
  - `getBoxShadow()`: 拖拽时蓝色阴影，选中时绿色阴影，默认灰色阴影
- 更新鼠标事件处理，拖拽时禁用悬停效果

#### 2. ActionWorkflow 组件修改

**文件：** `/Users/djh/git/pagaflow/simple-page-viewer/src/components/ActionWorkflow/index.tsx`

- 给 Node 组件添加 `isDragOver={dragOverActionIndex === index}` prop
- 从 ActionCard 组件移除 `isDragOver` prop

#### 3. ActionCard 组件修改

**文件：** `/Users/djh/git/pagaflow/simple-page-viewer/src/components/ActionCard/index.tsx`

- 移除 `margin: '5px'` 样式
- 保持宽度为 400px

## 修改文件列表

1. `src/components/Workflow/Node.tsx`
   - 添加 isDragOver prop
   - 实现动态样式系统
   - 修改鼠标事件处理

2. `src/components/ActionWorkflow/index.tsx`
   - 将 isDragOver 传递给 Node 而非 ActionCard

3. `src/components/ActionCard/index.tsx`
   - 移除 margin 调整

## 技术要点

- 利用现有组件的视觉系统而非创建新的样式覆盖
- 保持组件边界内的视觉效果，避免裁剪问题
- 维持拖拽状态管理的数据流不变

## 状态优先级

视觉效果优先级：isDragOver > isSelected > 默认状态

## 颜色规范

- 拖拽状态：蓝色系 (#3b82f6, #eff6ff)
- 选中状态：绿色系 (#10b981, #f0fdf4)
- 默认状态：灰色系 (#e5e7eb, #ffffff)
