# NodeGroup 删除按钮悬停显示功能

## 实现时间

2025-09-27

## 功能描述

为 NodeGroup 组件的删除按钮添加悬停显示功能，删除按钮只在鼠标悬停在分组区域时显示，改善界面清洁度。

## 实现详情

### 状态管理

在 NodeGroup 组件中添加 hover 状态：

```typescript
const [isHovered, setIsHovered] = React.useState(false);
```

### 鼠标事件处理

在分组容器上添加鼠标进入和离开事件：

```typescript
<div
  onMouseEnter={() => setIsHovered(true)}
  onMouseLeave={() => setIsHovered(false)}
  // ... 其他属性
>
```

### 条件渲染

删除按钮仅在悬停状态时渲染：

```typescript
{onDelete && isHovered && (
  <button>×</button>
)}
```

### 动画效果

删除按钮出现时添加渐显动画：

```css
animation: fadeIn 0.2s ease-in;
```

## React Hooks 顺序修复

解决了 React Hooks 调用顺序问题：

- 将 `useState(false)` 移至组件顶部，在其他 hooks 之前
- 确保 hooks 调用顺序一致性

### 修复前的 hooks 顺序问题

```typescript
// 错误：在其他 hooks 之后添加 useState
const displayBounds = dragPreview ? { ... } : groupBounds;
const [isHovered, setIsHovered] = React.useState(false); // ❌
```

### 修复后的正确顺序

```typescript
// 正确：所有 useState 在顶部
const [groupBounds, setGroupBounds] = React.useState(null);
const [dragPreview, setDragPreview] = React.useState(null);
const [isHovered, setIsHovered] = React.useState(false); // ✅
```

## 文件修改

- **文件路径**: `simple-page-viewer/src/components/Workflow/NodeGroup.tsx`
- **修改行**: 51, 195-196, 232

## 用户体验改进

1. 界面更加清洁，删除按钮不再常驻显示
2. 保持删除功能的可访问性
3. 提供视觉反馈，悬停时按钮平滑出现
4. 避免界面元素过于拥挤

## 技术要点

- 使用 React 状态管理悬停状态
- 条件渲染控制按钮显示/隐藏
- CSS 动画提供平滑过渡效果
- 遵循 React Hooks 规则确保组件稳定性
