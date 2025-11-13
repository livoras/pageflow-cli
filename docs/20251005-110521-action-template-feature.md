# Action Template 功能设计

## 背景

当前系统中，Action 和 Recording 是强关联的关系：

- 每个 Action 通过 `recording_id` 外键绑定到一个 Recording
- 一个 Action 只能属于一个 Recording
- 删除 Recording 会级联删除所有关联的 Action（ON DELETE CASCADE）

**问题**：用户希望能够复用 Action，将某个 Recording 中有用的 Action 应用到其他 Recording 中。

## 用户需求

1. **收藏 Action**：在查看 Recording A 时，可以将某个 Action "收藏"为模板
2. **插入 Action**：在编辑 Recording B 时，可以从收藏的模板中选择并插入新的 Action
3. **自由组合**：不同 Recording 可以复用相同的 Action 配置

## 技术方案对比

### 方案 1：多对多关系（不推荐）

**实现方式**：

- Action 表移除 `recording_id` 外键
- 创建中间表 `recording_actions` 维护 Recording 和 Action 的关联
- Action 真正共享，修改后所有引用都更新

**缺点**：

- 架构复杂度高，需要维护序号和关联关系
- 删除逻辑复杂（需判断是否被其他 Recording 引用）
- 同一 Action 在不同 Recording 中无法有不同配置（如 extraction）
- 与现有架构冲突严重，需要大量重构

### 方案 2：Action 模板表（推荐）

**实现方式**：

- 创建独立的 `action_templates` 表存储 Action 配置
- 保持现有 Action-Recording 强关联不变
- 收藏时：将 Action 配置保存为模板
- 插入时：从模板创建新的 Action 实例

**优点**：

- 简单清晰，不破坏现有架构
- 模板和 Action 完全独立，易于管理
- 每个 Recording 的 Action 可以独立修改
- 可以添加模板元数据（名称、描述、分类、使用统计）

**缺点**：

- 模板更新后，已插入的 Action 不会自动更新
- 存在数据冗余

## 选定方案：Action 模板表

基于以下原因选择方案 2：

1. 保持现有架构稳定
2. 实现简单，风险低
3. 数据隔离清晰
4. 扩展性好（可添加模板导入/导出、模板市场等功能）

## 数据库设计

### 新增表：action_templates

```sql
CREATE TABLE IF NOT EXISTS action_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,  -- 分类：导航、表单、提取等

  -- Action 核心配置
  type TEXT NOT NULL,
  xpath TEXT,
  encoded_id TEXT,
  selector TEXT,
  args TEXT,  -- JSON 数组字符串
  timeout INTEGER,
  schema TEXT,  -- JSON

  -- 使用统计
  usage_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMP,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
```

**说明**：

- 不包含 `recording_id`，模板独立存在
- 不包含文件引用字段（screenshot_file, html_file 等），因为这些是运行时生成的
- 不包含 `post_scripts` 和 `extracts`，因为这些与具体 Recording 关联
- 包含 `usage_count` 用于统计模板使用频率

## 后端实现

### 1. Model 层

**文件**: `src/database/models/ActionTemplateModel.ts`

```typescript
export interface ActionTemplate {
  id?: number;
  name: string;
  description?: string;
  category?: string;

  // Action configuration
  type: string;
  xpath?: string;
  encoded_id?: string;
  selector?: string;
  args?: string[];
  timeout?: number;
  schema?: any;

  usage_count?: number;
  last_used_at?: string;
  created_at?: string;
  updated_at?: string;
}

export class ActionTemplateModel {
  constructor(private db: DB) {}

  create(template: Omit<ActionTemplate, "id" | "created_at">): number;
  getAll(): ActionTemplate[];
  getById(id: number): ActionTemplate | null;
  getByCategory(category: string): ActionTemplate[];
  update(id: number, template: Partial<ActionTemplate>): void;
  delete(id: number): void;
  incrementUsage(id: number): void;
}
```

### 2. Service 层

**文件**: `src/services/ActionTemplateService.ts`

```typescript
export class ActionTemplateService {
  constructor(
    private templateModel: ActionTemplateModel,
    private actionModel: ActionModel,
  ) {}

  // 从 Action 创建模板
  async createFromAction(
    actionId: number,
    metadata: {
      name: string;
      description?: string;
      category?: string;
    },
  ): Promise<number> {
    const action = await this.actionModel.getById(actionId);
    if (!action) throw new Error("Action not found");

    const template = {
      name: metadata.name,
      description: metadata.description,
      category: metadata.category,
      type: action.type,
      xpath: action.xpath,
      encoded_id: action.encoded_id,
      selector: action.selector,
      args: action.args,
      timeout: action.timeout,
      schema: action.schema,
    };

    return this.templateModel.create(template);
  }

  // 从模板创建 Action
  async createActionFromTemplate(
    templateId: number,
    recordingId: number,
  ): Promise<number> {
    const template = await this.templateModel.getById(templateId);
    if (!template) throw new Error("Template not found");

    const action = {
      recording_id: recordingId,
      type: template.type,
      timestamp: Date.now(),
      xpath: template.xpath,
      encoded_id: template.encoded_id,
      selector: template.selector,
      args: template.args,
      timeout: template.timeout,
      schema: template.schema,
    };

    const actionId = this.actionModel.create(action);
    await this.templateModel.incrementUsage(templateId);

    return actionId;
  }
}
```

### 3. Routes 层

**文件**: `src/routes/ActionTemplateRoutes.ts`

```typescript
export class ActionTemplateRoutes extends BaseRouteHandler {
  registerRoutes(app: Application): void {
    // GET /api/action-templates
    // 获取所有模板，可选参数 ?category=xxx
    // POST /api/action-templates
    // 从 Action 创建模板
    // Body: { actionId: number, name: string, description?: string, category?: string }
    // POST /api/recordings/:recordingId/actions/from-template
    // 从模板创建 Action
    // Body: { templateId: number }
    // PUT /api/action-templates/:id
    // 更新模板
    // DELETE /api/action-templates/:id
    // 删除模板
  }
}
```

### 4. 集成到 SimplePageServer

在 `src/SimplePageServer.ts` 中：

1. 导入 ActionTemplateModel、ActionTemplateService、ActionTemplateRoutes
2. 在构造函数中初始化
3. 注册路由

## 前端实现

### 1. API Client

**文件**: `simple-page-viewer/src/lib/api.ts`

新增接口：

```typescript
export interface ActionTemplate {
  id: number;
  name: string;
  description?: string;
  category?: string;
  type: string;
  xpath?: string;
  selector?: string;
  schema?: any;
  usage_count?: number;
  created_at?: string;
}

export async function getActionTemplates(
  category?: string,
): Promise<ActionTemplate[]>;
export async function createActionTemplate(data: {
  actionId: number;
  name: string;
  description?: string;
  category?: string;
}): Promise<{ id: number }>;
export async function createActionFromTemplate(
  recordingId: string,
  templateId: number,
): Promise<{ actionId: number }>;
export async function deleteActionTemplate(id: number): Promise<void>;
```

### 2. UI 组件

#### ActionCard 增强

在每个 Action 卡片上添加"收藏"按钮，点击后弹出保存模板对话框。

#### SaveTemplateModal

模态框组件，用于输入模板名称、描述、分类。

#### ActionTemplateSelector

模板选择器组件，展示所有模板，按分类分组，点击后插入到当前 Recording。

#### RecordingDetail 增强

添加"从模板插入 Action"按钮，点击后打开模板选择器。

## 用户流程

1. **保存模板**：
   - 在 Recording A 查看某个 Action
   - 点击 Action 卡片上的"收藏"按钮
   - 弹出对话框，输入模板名称、描述、选择分类
   - 保存

2. **使用模板**：
   - 在 Recording B 编辑界面
   - 点击"从模板插入"按钮
   - 在模板选择器中选择之前保存的模板
   - 系统创建新的 Action 并添加到 Recording B

3. **管理模板**：
   - 查看所有模板列表
   - 按分类过滤
   - 查看使用统计
   - 删除不需要的模板

## 实现步骤

### Phase 1: 后端基础

1. 创建 Migration 014（action_templates 表）
2. 实现 ActionTemplateModel
3. 实现 ActionTemplateService
4. 实现 ActionTemplateRoutes
5. 集成到 SimplePageServer

### Phase 2: 前端基础

1. 更新 API client
2. 实现 SaveTemplateModal 组件
3. 实现 ActionTemplateSelector 组件
4. 在 ActionCard 添加收藏按钮
5. 在 RecordingDetail 添加插入按钮

### Phase 3: 功能完善

1. 添加模板分类管理
2. 添加模板搜索功能
3. 添加使用统计展示
4. 添加模板预览功能

## 数据隔离

- 模板和 Action 完全独立
- 删除 Recording 不影响模板
- 删除模板不影响已创建的 Action
- 每个 Recording 的 Action 可以独立修改，不影响其他 Recording
