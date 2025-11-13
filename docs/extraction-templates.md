# Extraction Templates

## 功能概述

Extraction 模板系统允许用户创建可重用的数据提取规则，并应用到录制动作的 HTML 快照上进行结构化数据提取。

## 核心 API

### 模板管理

```
GET    /api/extractions           # 获取所有模板
GET    /api/extractions/:id       # 获取单个模板
POST   /api/extractions           # 创建新模板
PUT    /api/extractions/:id       # 更新模板
DELETE /api/extractions/:id       # 删除模板
```

### 选择状态管理

```
GET /api/extraction-selection     # 获取当前选中的模板ID
PUT /api/extraction-selection     # 更新选中状态
```

### 数据提取执行

```
POST /api/recordings/:recordingId/actions/:actionIndex/extract
```

## 数据模型

```typescript
interface Extraction {
  id: number;
  name: string;
  description?: string;
  schema: any; // JSON 格式的提取规则
  created_at: string;
  updated_at: string;
}
```

## 前端功能

- **模板管理**：创建、编辑、删除模板
- **单选机制**：与 action 选择一致的单选行为
- **应用提取**：将模板应用到选中 action 进行数据提取
- **实时同步**：前后端选择状态同步

## Schema 示例

```json
{
  "title": "h1",
  "links": ["a@href"],
  "items": [
    ".item",
    {
      "name": ".item-name",
      "price": ".price"
    }
  ]
}
```

## 使用流程

1. 创建/选择 extraction 模板
2. 选择要应用的 action
3. 点击"Apply to Selected Action"
4. 查看提取结果
