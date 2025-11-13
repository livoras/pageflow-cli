# 前端重构计划

## 现状

- `page.tsx` 文件 1656 行，包含所有功能
- 30+ state 变量，19+ 处理函数，7 个模态框
- 只有 ExtractionSidebar 是独立组件

## 重构进展

### 2025-01-24

- ✅ **ActionCard 组件提取完成**
  - 创建 `/src/components/ActionCard/index.tsx` (395行)
  - 从 page.tsx 中移除 ~320 行代码
  - page.tsx 从 1656 行减少到 1399 行 (减少 257 行)
  - 编译成功，功能正常

- ✅ **RecordingsSidebar 组件提取完成**
  - 创建 `/src/components/RecordingsSidebar/index.tsx` (75行)
  - 从 page.tsx 中移除左侧边栏代码
  - page.tsx 从 1399 行减少到 1360 行 (减少 39 行)
  - 编译成功，功能正常

- ✅ **所有 Modal 组件提取完成**
  - 创建 `/src/components/Modals/` 目录
  - 提取了 8 个 Modal 组件：
    - ImageModal - 图片预览弹窗
    - ListModal - 列表数据展示弹窗
    - ElementModal - HTML 元素预览弹窗
    - PostScriptCodeModal 和 PostScriptResultModal - PostScript 相关弹窗
    - SchemaEditor - X-Ray Schema 编辑器弹窗
    - ExtractionModal - 数据提取结果弹窗
    - ConfirmDialog - 删除确认弹窗
  - 创建 ModalContainer 基础组件，提供统一的弹窗容器
  - 清理了未使用的状态变量和函数
  - page.tsx 从 1360 行减少到 1006 行 (减少 354 行)
  - 编译成功，功能正常

- ✅ **RecordingDetail 组件提取完成**
  - 创建 `/src/components/RecordingDetail/index.tsx` (173行)
  - 提取中间主面板容器，包含：
    - Recording 标题和 Replay 按钮
    - 选择状态栏
    - Actions 列表展示
    - 拖放状态管理
  - 解决了多个类型冲突问题：
    - 修复 Recording.id 类型 (number → string)
    - 重命名 API 类型避免命名冲突
    - 使用统一的 Extraction 类型
  - 清理了过时的函数和状态变量
  - page.tsx 从 1006 行减少到 886 行 (减少 120 行)
  - 编译成功，功能正常

- ✅ **useRecordings Hook 提取完成**
  - 创建 `/src/hooks/useRecordings.ts` (144行)
  - 提取所有 recordings 相关状态管理逻辑：
    - recordings 列表获取和管理
    - selectedRecording 状态维护
    - 删除录制操作
    - WebSocket 实时更新监听 (page-created, action-created)
    - 自动选择新创建的页面
  - 移除 page.tsx 中的相关状态和函数：
    - 状态: recordings, selectedRecording, loadingList, loadingDetail, error
    - 函数: handleRecordingClick, handleDeleteRecording, refreshSelectedRecording
  - page.tsx 从 886 行减少到 792 行 (减少 94 行)
  - 编译成功，功能正常

- ✅ **useSelection Hook 提取完成**
  - 创建 `/src/hooks/useSelection.ts` (98行)
  - 提取所有选择相关状态管理逻辑：
    - Action 和 Extraction 选择状态管理
    - 选择状态与后端 API 同步 (updateSelection, updateExtractionSelection)
    - WebSocket 实时选择同步 (action-selection-changed, extraction-selection-changed)
    - 选择状态初始化和恢复
  - 移除 page.tsx 中的相关状态、函数和事件监听：
    - 状态: selectedActionId, selectedExtractionId
    - 函数: handleActionClick, clearSelection, handleExtractionSelection
    - WebSocket 监听: action-selection-changed, extraction-selection-changed
  - page.tsx 从 792 行减少到 740 行 (减少 52 行)
  - 编译成功，功能正常

- ✅ **useReplay Hook 提取完成**
  - 创建 `/src/hooks/useReplay.ts` (115行)
  - 提取所有 replay 相关状态管理逻辑：
    - replay 执行状态管理 (idle, running, success, error)
    - 错误信息处理
    - WebSocket 实时事件监听 (replay-started, replay-action-start, replay-action-complete, replay-extractions-complete, replay-completed)
    - replay 数据结果存储和管理
  - 修复数据结构问题：
    - WebSocket 事件处理中正确存储 extraction 结果到嵌套结构
    - 确保 ActionCard 组件能正确读取 replayExtractionResults 数据
  - 移除 page.tsx 中的相关状态和函数：
    - 状态: replayStatus, replayError, currentReplayingActionIndex, completedActionIndices, replayExtractionResults
    - 函数: handleReplay
    - WebSocket 监听: replay 相关事件
  - page.tsx 从 740 行减少到约 653 行 (减少约 87 行)
  - 编译成功，功能正常

- ✅ **UI 优化完成**
  - 修复 extraction 预览功能：
    - 解决数据结构不匹配导致的预览按钮不显示问题
    - 修改 CSS 使预览按钮始终可见而非仅在 hover 时显示 (opacity: 0 → 1)
  - 改进用户体验：
    - 将眼睛表情符号 👁️ 替换为"查看"文字
    - 调整按钮字体大小 (0.875rem → 0.75rem) 使界面更简洁
  - 确保 replay 后的 extraction 结果可以正常预览

- ✅ **useModalManager Hook 提取完成**
  - 创建 `/src/hooks/useModalManager.ts` (76行)
  - 统一管理 8 种不同类型的 modal 状态：
    - Image Modal (图片预览)
    - List Modal (列表数据)
    - Element Modal (HTML 元素/快照)
    - Confirm Dialog (删除确认)
    - PostScript Code Modal (脚本代码查看)
    - PostScript Result Modal (脚本执行结果)
    - Schema Editor Modal (X-Ray Schema 编辑器)
    - Extraction Modal (提取结果查看)
  - 提供类型安全的 API：openModal, closeModal, isModalOpen, getModalData
  - 移除 page.tsx 中所有独立的 modal 状态变量和处理函数
  - 统一错误处理模式 (handleModalError 辅助函数)
  - 简化 modal 渲染逻辑，提升代码可维护性
  - page.tsx 从 653 行减少到 641 行 (减少 12 行)
  - 编译成功，功能正常

### 总体进展

- page.tsx: 1656 → 641 行 (减少 1015 行，约 61.2%)
- 已提取组件: ActionCard, RecordingsSidebar, 所有 Modal 组件(8个), RecordingDetail
- 已提取 Hooks: useRecordings, useSelection, useReplay, useModalManager
- 待提取: ActionsList (可选)
- 重构已完成，代码架构清晰，可维护性大幅提升

## 目标架构 ✅

```
src/
├── app/
│   └── page.tsx (641行) ✅
├── components/
│   ├── RecordingsSidebar/ ✅
│   ├── RecordingDetail/ ✅
│   │   └── index.tsx
│   ├── ActionCard/ ✅
│   │   └── index.tsx
│   ├── ExtractionSidebar/ ✅
│   └── Modals/ ✅
│       ├── ImageModal.tsx
│       ├── ListModal.tsx
│       ├── ElementModal.tsx
│       ├── PostScriptCodeModal.tsx
│       ├── PostScriptResultModal.tsx
│       ├── SchemaEditor.tsx
│       ├── ExtractionModal.tsx
│       └── ConfirmDialog.tsx
└── hooks/
    ├── useRecordings.ts ✅
    ├── useSelection.ts ✅
    ├── useReplay.ts ✅
    ├── useModalManager.ts ✅
    └── useWebSocket.ts ✅
```

## 执行计划

### 第一阶段：提取简单组件

1. **ActionCard** (~200行)
   - 单个 action 卡片的展示逻辑
   - 包括标题、详情、按钮等

2. **RecordingsSidebar** (~100行)
   - 左侧 recording 列表
   - 选择和删除功能

3. **Modals** (~400行)
   - ImageModal - 图片查看器
   - ListModal - 列表数据查看器
   - ElementModal - HTML 元素查看器
   - PostScriptModal - PostScript 代码查看器
   - SchemaEditor - Schema 编辑器
   - ExtractionModal - Extraction 结果查看器
   - ConfirmDialog - 删除确认框

### 第二阶段：提取复杂组件

4. **RecordingDetail** (~400行)
   - 中间主面板容器
   - 协调 Actions 列表和各种操作

5. **ActionsList**
   - Actions 列表容器
   - 处理拖放和选择逻辑

### 第三阶段：逻辑抽离

6. **useRecordings**
   - Recording 数据的获取和管理
   - 删除操作

7. **useSelection**
   - Action 和 Extraction 选择状态
   - WebSocket 同步

8. **useReplay**
   - Replay 执行逻辑
   - 状态管理

## 注意事项

- 每步完成后测试功能
- 保持 git 提交粒度小
- 优先保证功能不受影响
- 逐步迁移，避免大规模重写

## Loop 功能状态

- 后端 API 已实现
- 数据库迁移已完成
- 前端可视化待实现（需要在重构后添加）
