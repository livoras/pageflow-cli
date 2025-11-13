# Extraction 后端核心架构

## 概述

Extraction 系统负责从 HTML 页面中提取结构化数据。核心组件包括数据层、提取引擎、业务逻辑层、路由层，以及与 Replay 的集成。

## 1. 数据层 (Database Layer)

### 文件位置

`src/database/models/ExtractionModel.ts`

### 核心数据结构

```typescript
interface Extraction {
  id?: number;
  name: string;
  description?: string;
  strategy?: LoopStrategy | null; // Loop 提取策略
  schema: XRaySchema; // 提取规则
  created_at?: string;
  updated_at?: string;
}
```

**字段说明：**

- `schema`: CSS 选择器映射规则，定义如何从 HTML 提取数据
- `strategy`: Loop 场景下的数据处理策略（merge + unique）
- `name`: 模板名称，用于标识和复用

### 数据库操作

**ExtractionModel 类方法：**

```typescript
class ExtractionModel {
  create(extraction): number; // 创建模板，返回 ID
  getById(id: number): Extraction | null; // 根据 ID 查询
  getByName(name): Extraction | null; // 根据名称查询
  getAll(): Extraction[]; // 获取所有模板
  update(id, extraction): void; // 更新模板
  delete(id: number): void; // 删除模板
  exists(id: number): boolean; // ID 存在性检查
  existsByName(name): boolean; // 名称存在性检查
}
```

**JSON 序列化：**

- `strategy` 和 `schema` 字段以 JSON 字符串形式存储在 SQLite
- 查询时自动反序列化为 JavaScript 对象
- 更新时自动序列化为 JSON 字符串

## 2. 提取引擎层 (Extraction Engine)

### XRay Extractor (`src/utils/xray-extractor.ts`)

#### 核心类型定义

```typescript
// Schema 支持两种格式
type XRaySchema =
  | XRaySchemaObject // 对象格式: {field: "selector"}
  | [string, XRaySchemaObject]; // 数组格式: ["selector", {...}]

// Schema 值类型
type XRayValue =
  | string // 简单选择器: "h1"
  | XRaySchemaObject // 嵌套对象
  | Array<string> // 简单数组: ["a@href"]
  | [string, XRaySchemaObject]; // 对象数组: ["article", {...}]

// Loop 策略
interface LoopStrategy {
  merge: "concat" | "collect" | "merge";
  unique?: UniqueValue;
}

type UniqueValue =
  | string // 单字段: "url"
  | string[] // 多字段: ["title", "url"]
  | {
      // 配置对象
      by: string | string[];
      keep: "first" | "last";
    };
```

#### XRayExtractor 类

```typescript
class XRayExtractor {
  private $: cheerio.CheerioAPI;

  constructor(html: string);
  extract(schema: XRaySchema): XRayResult | any[];

  private processSchema(schema, context): XRayResult;
  private extractValue(selector, context): string;
  private extractArray(value, context): any[];
  private parseSelector(selector): { cssSelector; attribute };
}
```

**核心方法：**

1. **extract()** - 入口方法
   - 判断 schema 是数组还是对象格式
   - 数组格式调用 `extractArray()`
   - 对象格式调用 `processSchema()`

2. **processSchema()** - 处理对象 schema
   - 遍历 schema 的每个字段
   - 根据值类型调用对应的提取方法

3. **extractValue()** - 提取单个值
   - 解析选择器和属性名
   - 支持文本提取（默认）、HTML 提取、属性提取

4. **extractArray()** - 提取数组
   - 简单数组: `["a@href"]` → 提取所有匹配元素的属性
   - 对象数组: `["article", {...}]` → 提取对象列表

5. **parseSelector()** - 解析选择器
   - 分离 CSS 选择器和属性名
   - 格式: `"selector@attribute"`
   - 示例: `"img@src"` → `{cssSelector: "img", attribute: "src"}`

#### 选择器语法

```javascript
// 文本提取
"h1"                    // 提取 h1 的文本内容
".title"                // 提取 .title 的文本

// 属性提取
"img@src"               // 提取 img 的 src 属性
"a@href"                // 提取 a 的 href 属性
".content@html"         // 提取 .content 的 HTML
"div@data-id"           // 提取自定义属性

// 简单数组
["a@href"]              // 提取所有 a 标签的 href
["img@src"]             // 提取所有图片的 src

// 对象数组
["article", {           // 提取所有 article 元素
  "title": "h2",
  "author": ".author",
  "link": "a@href"
}]

// 嵌套对象
{
  "user": {
    "name": ".user-name",
    "avatar": "img@src"
  }
}
```

#### Schema 格式规则

**列表提取必须使用数组格式作为根：**

```javascript
// 正确 - 数组作为根
["section.note-item", {
  "title": ".title",
  "url": "a@href"
}]

// 错误 - 对象包裹数组
{
  "items": ["section.note-item", {
    "title": ".title"
  }]
}
```

### Extraction Processor (`src/utils/extraction-processor.ts`)

#### Merge 策略实现

**1. concat - 数组拼接**

```typescript
function mergeConcat(iterations: any[]): any;
```

- 输入: `[[A, B], [C, D]]`
- 输出: `[A, B, C, D]`
- 适用场景: 列表数据的合并

**2. collect - 收集为数组**

```typescript
function mergeCollect(iterations: any[]): any;
```

- 输入: `[{a:1}, {b:2}]` 或 `[[A,B], [C,D]]`
- 输出: `[{a:1}, {b:2}]` 或 `[A, B, C, D]`
- 适用场景: 对象收集或数组展平

**3. merge - 对象合并**

```typescript
function mergeMerge(iterations: any[]): any;
```

- 输入: `[{a:1}, {b:2}]`
- 输出: `{a:1, b:2}`
- 适用场景: 对象字段合并

#### Unique 策略实现

**核心函数：**

```typescript
function applyUniqueStrategy(data: any[], config: UniqueValue): any[];
```

**去重逻辑：**

1. **解析配置**

   ```typescript
   // 字符串形式
   "url" → {by: "url", keep: "first"}

   // 数组形式
   ["title", "url"] → {by: ["title", "url"], keep: "first"}

   // 对象形式
   {by: "url", keep: "last"} → 保留最后一个
   ```

2. **生成唯一键**

   ```typescript
   function generateUniqueKey(item: any, by: UniqueBy): string;
   ```

   - 单字段: 直接取值
   - 多字段: 用 `|` 连接多个字段的值
   - 支持嵌套字段: `"user.id"` → 通过路径获取值

3. **去重执行**
   - 使用 Map 存储已见过的键
   - `keep: 'first'` - 跳过重复项
   - `keep: 'last'` - 覆盖已存在的项

#### Loop 结果处理主函数

```typescript
function processLoopExtractionResults(
  iterations: LoopExtractionIteration[],
  extractionId: number,
  strategy?: LoopStrategy | null,
): any;
```

**处理流程：**

1. 从所有迭代中提取指定 extractionId 的数据
2. 应用 merge 策略合并数据
3. 如果指定了 unique 策略，执行去重
4. 返回最终处理后的结果

**示例：**

```typescript
// 输入迭代数据
iterations = [
  { iteration: 0, results: { 18: { result: [{ url: "a" }, { url: "b" }] } } },
  { iteration: 1, results: { 18: { result: [{ url: "b" }, { url: "c" }] } } },
];

// 策略配置
strategy = { merge: "concat", unique: "url" }[
  // 输出
  ({ url: "a" }, { url: "b" }, { url: "c" })
]; // concat 合并 + 按 url 去重
```

## 3. 业务逻辑层 (Service Layer)

### ExtractionService (`src/services/ExtractionService.ts`)

#### 依赖注入

```typescript
constructor(
  stateManager: StateManager,
  serverService: ServerService,
  broadcastService: BroadcastService
)
```

#### 核心方法

**1. getAllExtractions()**

- 获取所有 extraction 模板
- 返回: `{extractions: Extraction[]}`

**2. getExtractionById(id: number)**

- 获取指定 ID 的模板
- 不存在时抛出异常
- 返回: `{extraction: Extraction}`

**3. createExtraction(name, description, schema, strategy)**

- 校验 name 和 schema 必填
- 校验 schema 为对象或数组
- 调用 ExtractionModel.create()
- 广播 `extraction-created` 事件
- 返回: `{extraction: Extraction}`

**4. updateExtraction(id, updates)**

- 支持部分字段更新: name, description, schema, strategy
- 校验 schema 格式
- 调用 ExtractionModel.update()
- 广播 `extraction-updated` 事件
- 返回: `{extraction: Extraction}`

**5. deleteExtraction(id)**

- 删除指定模板
- 广播 `extraction-deleted` 事件
- 返回: `{success: true}`

#### WebSocket 事件广播

所有 CRUD 操作都会触发对应的 WebSocket 事件：

- `extraction-created` - 创建模板时
- `extraction-updated` - 更新模板时
- `extraction-deleted` - 删除模板时

### RecordingService 中的提取相关方法

#### extractDataFromAction(recordingId, actionIndex, schema)

**执行流程：**

1. 验证 recording 存在
2. 根据 actionIndex 获取 action
3. 验证 action 有 html_file 字段
4. 读取 HTML 文件内容
   ```typescript
   const htmlPath = path.join(dataDir, action.html_file);
   const html = fs.readFileSync(htmlPath, "utf-8");
   ```
5. 调用提取引擎
   ```typescript
   const result = extractData(html, schema);
   ```
6. 返回结果
   ```typescript
   {
     success: true,
     result,
     actionId: action.id,
     timestamp: Date.now()
   }
   ```

#### Action Extracts 管理

**1. getActionExtracts(recordingId, actionIndex)**

- 获取 action 关联的 extraction IDs
- 返回完整的 extraction 对象列表
- 返回: `{success: true, extractIds: number[], extractions: Extraction[]}`

**2. setActionExtracts(recordingId, actionIndex, extractIds)**

- 设置 action 的 extracts 字段
- 更新 action 记录
- 返回: `{success: true}`

**3. clearActionExtracts(recordingId, actionIndex)**

- 清空 action 的 extracts 字段
- 返回: `{success: true}`

## 4. 路由层 (Route Layer)

### ExtractionRoutes (`src/routes/ExtractionRoutes.ts`)

#### API 端点

**GET /api/extractions**

- 获取所有 extraction 模板
- 响应: `{extractions: Extraction[]}`

**GET /api/extractions/:id**

- 获取指定模板
- 参数: id (number)
- 响应: `{extraction: Extraction}`

**POST /api/extractions**

- 创建新模板
- 请求体: `{name, description?, schema, strategy?}`
- 响应: `{extraction: Extraction}` (201 Created)

**PUT /api/extractions/:id**

- 更新模板
- 参数: id (number)
- 请求体: `{name?, description?, schema?, strategy?}`
- 响应: `{extraction: Extraction}`

**DELETE /api/extractions/:id**

- 删除模板
- 参数: id (number)
- 响应: `{success: true}`

### RecordingRoutes 中的提取相关端点

#### POST /api/recordings/:pageId/actions/:actionIndex/extract

**功能：** 从 action 的 HTML 快照中提取数据

**参数：**

- `pageId`: recording ID
- `actionIndex`: action 在 recording 中的索引

**请求体：**

```json
{
  "schema": {
    "items": [
      ".item",
      {
        "title": ".title",
        "link": "a@href"
      }
    ]
  }
}
```

**schema 格式支持：**

- JSON 对象（推荐）: `{...}`
- JSON 字符串（兼容旧版）: `"{...}"`

**响应：**

```json
{
  "success": true,
  "result": [...],
  "actionId": 84,
  "timestamp": 1758534856787
}
```

#### GET /api/recordings/:recordingId/actions/:actionIndex/extracts

**功能：** 获取 action 关联的 extraction 模板

**响应：**

```json
{
  "success": true,
  "extractIds": [14, 18],
  "extractions": [
    {
      "id": 14,
      "name": "推文提取",
      "schema": [...],
      "strategy": {...}
    }
  ]
}
```

#### PUT /api/recordings/:recordingId/actions/:actionIndex/extracts

**功能：** 设置 action 关联的 extraction IDs

**请求体：**

```json
{
  "extractIds": [14, 18]
}
```

**响应：**

```json
{
  "success": true
}
```

#### DELETE /api/recordings/:recordingId/actions/:actionIndex/extracts

**功能：** 清除 action 的 extraction 关联

**响应：**

```json
{
  "success": true
}
```

## 5. Replay 集成 (Replay Integration)

文件位置: `src/replay.ts`

### 单次提取流程 (executeSingleAction)

```typescript
async function executeSingleAction(action, ...options) {
  // 1. 执行 action 对应的操作（create/navigate/act 等）
  await executeActionByType(action);

  // 2. 如果 action 有 extracts 字段
  if (action.extracts && action.extracts.length > 0) {
    const html = await client.getPageHtml(pageId);
    const extractionResults: Record<number, any> = {};

    // 3. 对每个 extractId 执行提取
    for (const extractId of action.extracts) {
      // 3.1 获取 extraction 模板
      const response = await fetch(
        `http://localhost:3100/api/extractions/${extractId}`,
      );
      const { extraction } = await response.json();

      // 3.2 执行提取
      const extractResult = extractData(html, extraction.schema);

      // 3.3 存储结果
      extractionResults[extractId] = {
        extractId,
        extractionName: extraction.name,
        result: extractResult,
        schema: extraction.schema,
        strategy: extraction.strategy,
        success: true,
      };
    }

    // 4. 广播提取完成事件
    broadcast("replay-extractions-complete", {
      actionIndex,
      extractionResults,
    });
  }
}
```

**数据流：**

```
action.extracts → fetch extraction → extractData(html, schema) → broadcast
```

### Loop 提取流程 (executeLoop)

```typescript
async function executeLoop(loop, actions, ...options) {
  const iterations: LoopExtractionIteration[] = [];
  const extractionCollector: Record<number, any> = {};

  // 1. 执行 loop_count 次迭代
  for (let i = 0; i < loop.loop_count; i++) {
    const iterationResults: Record<string, any> = {};

    // 1.1 执行 loop 内的每个 action
    for (const action of loopActions) {
      await executeSingleAction(action);

      // 1.2 收集 extraction 结果
      if (action.extracts) {
        for (const extractId of action.extracts) {
          const html = await client.getPageHtml(pageId);
          const extraction = await fetchExtraction(extractId);
          const result = extractData(html, extraction.schema);

          iterationResults[extractId] = {
            extractId,
            result,
            schema: extraction.schema,
            strategy: extraction.strategy,
          };

          // 收集 strategy 信息
          if (!extractionCollector[extractId]) {
            extractionCollector[extractId] = {
              strategy: extraction.strategy,
              schema: extraction.schema,
              name: extraction.name,
            };
          }
        }
      }
    }

    // 1.3 保存本次迭代结果
    iterations.push({
      iteration: i,
      results: iterationResults,
    });
  }

  // 2. 处理所有 extraction 的结果
  const processedResults: Record<number, any> = {};

  for (const extractId in extractionCollector) {
    const { strategy, schema, name } = extractionCollector[extractId];

    // 2.1 应用 merge + unique 策略
    const processed = processLoopExtractionResults(
      iterations,
      parseInt(extractId),
      strategy,
    );

    processedResults[extractId] = {
      result: processed,
      schema,
      strategy,
      extractionName: name,
    };
  }

  // 3. 广播 loop 提取完成事件
  broadcast("replay-loop-extractions-complete", {
    loopId: loop.id,
    extractionResults: {
      [actionIndex]: {
        type: "loop",
        iterations, // 原始迭代数据
        processed, // merge + unique 后的结果
      },
    },
  });
}
```

**数据流：**

```
loop × N → action.extracts × N → extractData × N
  → iterations[] → processLoopExtractionResults
  → {iterations, processed} → broadcast
```

### WebSocket 事件结构

**replay-extractions-complete (单次提取)**

```json
{
  "actionIndex": 4,
  "extractionResults": {
    "14": {
      "extractId": 14,
      "extractionName": "推文提取",
      "result": [...],
      "schema": {...},
      "strategy": {...},
      "success": true
    }
  }
}
```

**replay-loop-extractions-complete (Loop 提取)**

```json
{
  "loopId": 3,
  "extractionResults": {
    "79": {
      "type": "loop",
      "iterations": [
        {
          "iteration": 0,
          "results": {
            "18": {
              "extractId": 18,
              "result": [{...}, {...}],
              "schema": [...],
              "strategy": {...}
            }
          }
        }
      ],
      "processed": {
        "18": {
          "result": [...],        // merge + unique 后的结果
          "schema": [...],
          "strategy": {...},
          "extractionName": "笔记提取"
        }
      }
    }
  }
}
```

## 6. 数据存储机制

### SQLite 数据表

**extractions 表结构：**

```sql
CREATE TABLE extractions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  strategy TEXT,              -- JSON 字符串
  schema TEXT NOT NULL,       -- JSON 字符串
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Action 中的 Extraction 关联

**actions 表的 extracts 字段：**

```sql
extracts TEXT  -- JSON 数组，存储 extraction IDs
```

**示例数据：**

```json
{
  "id": 79,
  "type": "act",
  "method": "scrollY",
  "args": ["500"],
  "extracts": [14, 18] // 关联的 extraction IDs
}
```

## 7. 核心设计原则

### Schema 和 Strategy 分离

**设计目的：**

- `schema`: 定义"如何提取"（CSS 选择器映射）
- `strategy`: 定义"如何处理"（Loop 场景的 merge 和 unique）

**好处：**

- schema 可用于单次提取和 loop 提取
- strategy 只在 loop 场景下生效
- 提高 schema 的复用性

### 两种提取模式

**单次提取：**

```
action → HTML snapshot → extract(schema) → result
```

**Loop 提取：**

```
action × N → HTML × N → extract(schema) × N
  → merge(results) → unique(merged) → final result
```

### Schema 格式设计

**对象格式：** 用于单个数据或嵌套结构

```javascript
{
  "title": "h1",
  "author": {
    "name": ".author-name",
    "avatar": "img@src"
  }
}
```

**数组格式：** 用于列表数据（必须作为根）

```javascript
[
  "article",
  {
    title: "h2",
    content: ".content",
  },
];
```

### 事件驱动架构

**WebSocket 广播事件：**

- Extraction CRUD 操作触发事件
- Replay 执行过程触发进度事件
- 前端监听事件实时更新 UI

**事件列表：**

- `extraction-created`
- `extraction-updated`
- `extraction-deleted`
- `replay-extractions-complete`
- `replay-loop-extractions-complete`

## 8. 关键文件清单

### 数据层

- `src/database/models/ExtractionModel.ts` - Extraction 数据模型

### 提取引擎

- `src/utils/xray-extractor.ts` - XRay 提取引擎
- `src/utils/extraction-processor.ts` - Loop 结果处理

### 业务逻辑

- `src/services/ExtractionService.ts` - Extraction 模板管理
- `src/services/RecordingService.ts` - 提取执行

### 路由

- `src/routes/ExtractionRoutes.ts` - Extraction API
- `src/routes/RecordingRoutes.ts` - 提取执行 API

### Replay 集成

- `src/replay.ts` - executeSingleAction, executeLoop

### 前端

- `simple-page-viewer/src/lib/api.ts` - API 类型定义
- `simple-page-viewer/src/components/ExtractionSidebar.tsx` - UI 管理
