# Extraction Schema 与 Strategy 分离重构方案

## 重构目标

将 MapReduce 配置（`$merge`, `$unique`）从 extraction schema 中分离出来，解决当前 schema 返回对象时无法正确应用 concat 策略的问题。

## 核心改动

### 当前设计问题

**现有结构：**

```typescript
schema: {
  $merge: "concat",
  $unique: "url",
  items: ["article", {...}]
}
```

**问题：**

- 每次迭代返回 `{items: [...]}`（对象）
- concat 策略期望数组输入，实际收到对象
- 无法正确合并多次迭代的数组数据

### 新设计方案

**新结构：**

```typescript
{
  strategy: {
    merge: "concat",
    unique: "url"
  },
  schema: ["article", {...}]  // 直接返回数组
}
```

**解决方案：**

- 每次迭代返回 `[item1, item2, ...]`（数组）
- concat 策略直接作用在数组上
- 正确合并为 `[...iter1, ...iter2, ...]`

## 类型定义改动

### 1. XRaySchema - 去除元数据，支持数组

**文件：** `src/utils/xray-extractor.ts`

```typescript
// 对象形式的 schema
interface XRaySchemaObject {
  [key: string]: XRayValue; // 不再包含 $merge/$unique
}

// schema 可以是对象或数组
export type XRaySchema = XRaySchemaObject | [string, XRaySchemaObject]; // 支持数组作为顶层结构
```

### 2. LoopStrategy - 新增独立的策略配置

**文件：** `src/utils/extraction-processor.ts` 或 `src/utils/xray-extractor.ts`

```typescript
export interface LoopStrategy {
  merge: MergeStrategy; // 'concat' | 'collect' | 'merge'
  unique?: UniqueValue; // string | string[] | {by, keep}
}
```

### 3. Extraction - 添加 strategy 字段

**文件：** `src/database/models/ExtractionModel.ts`

```typescript
export interface Extraction {
  id?: number;
  name: string;
  description?: string;
  strategy?: LoopStrategy | null; // 循环策略（可选）
  schema: XRaySchema; // 纯提取规则
  created_at?: string;
  updated_at?: string;
}
```

## 实现改动

### 1. XRayExtractor - 支持数组 schema

**文件：** `src/utils/xray-extractor.ts`

```typescript
extract(schema: XRaySchema): XRayResult | any[] {
  if (Array.isArray(schema)) {
    // 数组形式：["selector", {...}]
    return this.extractArray(schema, this.$.root());
  } else {
    // 对象形式：{field: "selector"}
    return this.processSchema(schema, this.$.root());
  }
}

private processSchema(
  schema: XRaySchemaObject,  // 不再需要跳过 $ 开头的字段
  context: cheerio.Cheerio<any>
): XRayResult {
  const result: XRayResult = {};

  for (const [key, value] of Object.entries(schema)) {
    if (value === undefined) continue;

    if (typeof value === "string") {
      result[key] = this.extractValue(value, context);
    } else if (Array.isArray(value)) {
      result[key] = this.extractArray(value, context);
    } else if (typeof value === "object") {
      result[key] = this.processSchema(value as XRaySchemaObject, context);
    }
  }

  return result;
}
```

### 2. processLoopExtractionResults - 使用独立的 strategy

**文件：** `src/utils/extraction-processor.ts`

```typescript
export function processLoopExtractionResults(
  iterations: LoopExtractionIteration[],
  extractionId: number,
  strategy?: LoopStrategy | null, // 从 Extraction 传入
): any {
  // 提取所有迭代的数据
  const iterationData: any[] = iterations
    .map((iter) => iter.results[extractionId.toString()]?.result)
    .filter(Boolean);

  if (iterationData.length === 0) return null;

  // 应用 merge 策略
  const mergeStrategy =
    strategy?.merge || autoDetectMergeStrategy(iterationData[0]);
  let merged = applyMergeStrategy(iterationData, mergeStrategy);

  // 应用 unique 策略
  if (strategy?.unique && Array.isArray(merged)) {
    merged = applyUniqueStrategy(merged, strategy.unique);
  }

  return merged;
}
```

### 3. replay.ts - 传递 strategy 参数

**文件：** `src/replay.ts`

```typescript
// 在处理 loop extraction 结果时
const extraction = extractionModel.getById(extractId);
const processed = processLoopExtractionResults(
  sortedIterations,
  extractId,
  extraction.strategy, // 传入独立的 strategy 配置
);
```

## 数据库改动

### 1. 迁移 SQL

```sql
ALTER TABLE extractions ADD COLUMN strategy TEXT;
```

### 2. ExtractionModel 读写逻辑

**文件：** `src/database/models/ExtractionModel.ts`

```typescript
// 创建时
create(extraction: Omit<Extraction, "id" | "created_at" | "updated_at">): number {
  const result = this.db.query<{ id: number }>(
    `INSERT INTO extractions (name, description, schema, strategy)
     VALUES (?, ?, ?, ?)
     RETURNING id`,
    [
      extraction.name,
      extraction.description || null,
      JSON.stringify(extraction.schema),
      extraction.strategy ? JSON.stringify(extraction.strategy) : null
    ]
  );
  return result[0].id;
}

// 读取时
getById(id: number): Extraction | null {
  const result = this.db.query<any>(
    "SELECT * FROM extractions WHERE id = ?",
    [id]
  );

  if (result.length === 0) return null;

  const row = result[0];
  return {
    ...row,
    schema: JSON.parse(row.schema),
    strategy: row.strategy ? JSON.parse(row.strategy) : null
  };
}
```

## 前端改动

### 1. ExtractionSidebar - UI 分区

**文件：** `simple-page-viewer/src/components/ExtractionSidebar.tsx`

```tsx
// Schema 编辑区（纯提取规则）
<div className="extraction-schema">
  <label>Extraction Schema:</label>
  <textarea
    value={schemaText}
    onChange={(e) => setSchemaText(e.target.value)}
  />
</div>

// Strategy 配置区（循环策略）
<div className="extraction-strategy">
  <label>Loop Strategy (Optional):</label>

  <div className="strategy-field">
    <label>Merge:</label>
    <select value={mergeStrategy} onChange={(e) => setMergeStrategy(e.target.value)}>
      <option value="">None</option>
      <option value="concat">concat</option>
      <option value="collect">collect</option>
      <option value="merge">merge</option>
    </select>
  </div>

  <div className="strategy-field">
    <label>Unique Field(s):</label>
    <input
      value={uniqueField}
      onChange={(e) => setUniqueField(e.target.value)}
      placeholder="field1, field2"
    />
  </div>

  <div className="strategy-field">
    <label>Keep:</label>
    <select value={uniqueKeep} onChange={(e) => setUniqueKeep(e.target.value)}>
      <option value="first">first</option>
      <option value="last">last</option>
    </select>
  </div>
</div>
```

### 2. 数据提交逻辑

```typescript
const handleSave = () => {
  const schema = JSON.parse(schemaText);

  const strategy = mergeStrategy
    ? {
        merge: mergeStrategy,
        unique: uniqueField
          ? uniqueField.includes(",")
            ? uniqueField.split(",").map((f) => f.trim())
            : uniqueField
          : undefined,
      }
    : null;

  updateExtraction(extractionId, {
    name,
    description,
    schema,
    strategy,
  });
};
```

## 示例对比

### 小红书笔记提取

**重构前：**

```json
{
  "$merge": "concat",
  "$unique": "url",
  "notes": [
    "section.note-item",
    {
      "title": ".footer .title span",
      "url": "a.cover@href",
      "cover_image": "a.cover img@src",
      "author": {
        "name": ".author-wrapper .author .name",
        "avatar": ".author-wrapper .author img@src"
      },
      "likes": ".like-wrapper .count"
    }
  ]
}
```

- 每次迭代返回：`{notes: [note1, note2, ...]}`
- 问题：对象无法 concat

**重构后：**

```json
{
  "strategy": {
    "merge": "concat",
    "unique": "url"
  },
  "schema": [
    "section.note-item",
    {
      "title": ".footer .title span",
      "url": "a.cover@href",
      "cover_image": "a.cover img@src",
      "author": {
        "name": ".author-wrapper .author .name",
        "avatar": ".author-wrapper .author img@src"
      },
      "likes": ".like-wrapper .count"
    }
  ]
}
```

- 每次迭代返回：`[note1, note2, note3, ...]`
- 解决：数组直接 concat

### Twitter 推文提取

**重构前：**

```json
{
  "$merge": "concat",
  "$unique": "url",
  "items": ["article[data-testid=\"tweet\"]", {...}]
}
```

**重构后：**

```json
{
  "strategy": {
    "merge": "concat",
    "unique": "url"
  },
  "schema": ["article[data-testid=\"tweet\"]", {...}]
}
```

## 删除的代码

### XRayExtractor.processSchema

删除 `$ 开头字段的跳过逻辑`：

```typescript
// 删除这段
if (key.startsWith("$")) {
  continue;
}
```

### XRaySchema 接口

删除元数据字段：

```typescript
// 删除这两个字段
export interface XRaySchema {
  $merge?: MergeStrategy; // 删除
  $unique?: UniqueValue; // 删除
  [key: string]: XRayValue;
}
```

## 迁移任务

### 数据库迁移

1. 添加 `strategy` 列到 `extractions` 表
2. 迁移现有数据（extraction #7, #18）提取 `$merge`/`$unique` 到 `strategy` 字段
3. 更新 schema 字段移除 `$` 开头的元数据

### 代码迁移顺序

1. 类型定义（xray-extractor.ts, extraction-processor.ts）
2. 数据库模型（ExtractionModel.ts）
3. 提取器实现（XRayExtractor.extract, processSchema）
4. 处理逻辑（processLoopExtractionResults, replay.ts）
5. 前端 UI（ExtractionSidebar.tsx）
6. 数据库迁移脚本
