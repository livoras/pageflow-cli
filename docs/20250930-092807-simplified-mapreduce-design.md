# Loop Extraction MapReduce 简化设计

## 设计原则

1. **直观命名**：使用web scraping领域的常见术语
2. **原子操作**：每个策略只做一件事，保持原子性
3. **内置策略**：不支持自定义函数，只提供经过验证的内置策略
4. **渐进式**：从简单到复杂，覆盖90%的使用场景

## 核心设计

### 配置格式说明

本设计支持两种配置格式：

**简洁格式（推荐）：**

```json
{
  "$merge": "concat", // 直接指定策略名称
  "$unique": "id" // 直接指定去重字段
}
```

**完整格式（需要额外参数时）：**

```json
{
  "$merge": "concat", // merge始终使用简洁格式
  "$unique": {
    // unique有额外参数时使用完整格式
    "by": "id",
    "keep": "last"
  }
}
```

### 术语重命名

| 旧术语     | 新术语    | 说明                     |
| ---------- | --------- | ------------------------ |
| `$collect` | `$merge`  | 更直观地表达"合并"的含义 |
| `$dedupe`  | `$unique` | 更通俗易懂的"唯一化"表达 |

### Schema结构

**简洁格式（推荐）：**

```json
{
  "extract": {
    "items": "li.post",
    "id": "a@data-id",
    "title": "h3 | text"
  },
  "$merge": "concat",
  "$unique": "id"
}
```

**完整格式（需要额外参数时）：**

```json
{
  "extract": {
    "items": "li.post",
    "id": "a@data-id",
    "title": "h3 | text"
  },
  "$merge": "concat",
  "$unique": {
    "by": "id",
    "keep": "last"
  }
}
```

## 1. $merge 策略（精简为4个核心策略）

### 1.1 concat - 数组拼接（默认）

**用途：** 简单拼接所有迭代的数组结果

**配置：**

```json
{
  "$merge": "concat"
}
```

**示例：**

```
迭代1: [A, B]
迭代2: [C, D]
结果: [A, B, C, D]
```

**适用场景：**

- 列表数据抓取（商品、文章、帖子）
- 需要保留顺序
- 去重由$unique处理

---

### 1.2 flatten - 数组扁平化

**用途：** 拼接并扁平化嵌套数组

**配置：**

```json
{
  "$merge": "flatten"
}
```

**示例：**

```
迭代1: [[A, B], [C]]
迭代2: [[D, E]]
结果: [A, B, C, D, E]
```

**适用场景：**

- 提取结果本身是嵌套数组
- 需要展平为一维数组

---

### 1.3 collect - 对象收集

**用途：** 将单个对象收集到数组

**配置：**

```json
{
  "$merge": "collect"
}
```

**示例：**

```
迭代1: {id: 1, name: "A"}
迭代2: {id: 2, name: "B"}
结果: [{id: 1, name: "A"}, {id: 2, name: "B"}]
```

**适用场景：**

- 每次迭代提取单个对象
- 需要收集为列表

---

### 1.4 merge - 对象合并

**用途：** 合并对象的字段（浅合并）

**配置：**

```json
{
  "$merge": "merge"
}
```

**示例：**

```
迭代1: {id: 1, title: "A"}
迭代2: {views: 100, likes: 20}
结果: {id: 1, title: "A", views: 100, likes: 20}
```

**适用场景：**

- 单个对象的增量更新
- 不同部分分批提取

---

### 策略选择逻辑

**自动检测（未指定strategy时）：**

```typescript
function autoDetectStrategy(data: any) {
  if (Array.isArray(data)) {
    return "concat"; // 数组 → concat
  } else if (typeof data === "object" && data !== null) {
    return "collect"; // 对象 → collect
  } else {
    return "concat"; // 基础类型 → concat（自动转数组）
  }
}
```

## 2. $unique 策略（简化为核心功能）

### 2.1 单字段去重

**配置：**

```json
{
  "$unique": "id"
}
```

**示例：**

```
输入: [{id: 1, name: "A"}, {id: 2, name: "B"}, {id: 1, name: "A"}]
输出: [{id: 1, name: "A"}, {id: 2, name: "B"}]
```

---

### 2.2 多字段组合去重

**配置：**

```json
{
  "$unique": {
    "by": ["author", "title"]
  }
}
```

**示例：**

```
输入: [
  {author: "张三", title: "文章A"},
  {author: "李四", title: "文章A"},
  {author: "张三", title: "文章A"}
]
输出: [
  {author: "张三", title: "文章A"},
  {author: "李四", title: "文章A"}
]
```

---

### 2.3 保留策略

**配置：**

```json
{
  "$unique": {
    "by": "id",
    "keep": "first" | "last"
  }
}
```

**默认：** `"keep": "first"`

**示例（keep: "last"）：**

```
输入: [
  {id: 1, title: "旧标题", views: 100},
  {id: 1, title: "新标题", views: 150}
]
输出: [{id: 1, title: "新标题", views: 150}]
```

---

### 2.4 嵌套字段支持

**配置：**

```json
{
  "$unique": {
    "by": "user.id"
  }
}
```

**示例：**

```
输入: [
  {user: {id: 1, name: "张三"}},
  {user: {id: 2, name: "李四"}},
  {user: {id: 1, name: "张三"}}
]
输出: [
  {user: {id: 1, name: "张三"}},
  {user: {id: 2, name: "李四"}}
]
```

## 3. 完整应用场景

### 3.1 电商商品列表

```json
{
  "extract": {
    "items": "div.product",
    "id": "div@data-product-id",
    "title": "h3 | text",
    "price": "span.price | text"
  },
  "$merge": "concat",
  "$unique": "id"
}
```

**说明：** 拼接多页商品，按ID去重保留首次出现

---

### 3.2 社交媒体帖子（需要最新数据）

```json
{
  "extract": {
    "items": "article.tweet",
    "id": "article@data-tweet-id",
    "content": "div.content | text",
    "likes": "span.likes | text"
  },
  "$merge": "concat",
  "$unique": {
    "by": "id",
    "keep": "last"
  }
}
```

**说明：** 拼接多次滚动的帖子，按ID去重保留最新版本（点赞数更新）

---

### 3.3 用户信息收集

```json
{
  "extract": {
    "id": "div@data-user-id",
    "name": "span.username | text",
    "avatar": "img@src"
  },
  "$merge": "collect",
  "$unique": "id"
}
```

**说明：** 每次提取单个用户对象，收集为数组并去重

---

### 3.4 单对象增量提取

```json
{
  "extract": {
    "id": "div@data-id",
    "title": "h1 | text",
    "author": "span.author | text"
  },
  "$merge": "merge"
}
```

**说明：** 多次迭代补充对象字段，无需去重

---

### 3.5 标签收集

```json
{
  "extract": {
    "tags": ["span.tag | text"]
  },
  "$merge": "flatten",
  "$unique": null
}
```

**说明：** 收集所有标签，扁平化并去重

## 4. 默认行为

### 4.1 未指定$merge

**行为：** 根据数据类型自动选择

- 数组 → concat
- 对象 → collect
- 基础类型 → concat

### 4.2 未指定$unique

**行为：** 不进行去重，返回merge后的完整结果

### 4.3 推荐的默认配置

```json
{
  "$merge": "concat",
  "$unique": "id"
}
```

## 5. 配置组合模式

### 5.1 常见组合

| merge策略 | unique配置                 | 适用场景             |
| --------- | -------------------------- | -------------------- |
| concat    | `"id"`                     | 列表抓取，简单去重   |
| concat    | `{by: "id", keep: "last"}` | 需要最新数据的列表   |
| collect   | `["userId", "postId"]`     | 关系数据，多字段去重 |
| flatten   | `null`                     | 标签、分类去重       |
| merge     | 无                         | 单对象增量更新       |

### 5.2 不推荐的组合

| merge策略 | unique配置 | 原因                        |
| --------- | ---------- | --------------------------- |
| merge     | 任何去重   | merge用于单对象，不适用去重 |

## 6. 错误处理

### 6.1 数据类型不匹配

```typescript
// concat期望数组，收到对象
if (strategy === "concat" && !Array.isArray(data)) {
  data = [data]; // 转换为单元素数组
  logWarning("concat: converted object to array");
}

// collect期望对象，收到数组
if (strategy === "collect" && Array.isArray(data)) {
  data = data[0]; // 取首个元素
  logWarning("collect: using first array element");
}
```

### 6.2 缺少unique字段

```typescript
if (!item[uniqueBy]) {
  // 宽松模式：生成临时ID
  item._uniqueId = generateId();
  logWarning(`Missing unique field "${uniqueBy}"`);
}
```

### 6.3 策略降级

```typescript
// flatten失败 → 降级到concat
try {
  result = flatten(data);
} catch (error) {
  logWarning("flatten failed, falling back to concat");
  result = concat(data);
}
```

## 7. 配置验证

### 7.1 Schema验证

```typescript
function validateSchema(schema: ExtractionSchema) {
  // 验证$merge
  if (schema.$merge) {
    const validStrategies = ["concat", "flatten", "collect", "merge"];
    if (!validStrategies.includes(schema.$merge.strategy)) {
      throw new Error(`Invalid merge strategy: ${schema.$merge.strategy}`);
    }
  }

  // 验证$unique
  if (schema.$unique) {
    if (!schema.$unique.by && schema.$unique.by !== null) {
      throw new Error('$unique requires "by" parameter');
    }

    if (
      schema.$unique.keep &&
      !["first", "last"].includes(schema.$unique.keep)
    ) {
      throw new Error('$unique.keep must be "first" or "last"');
    }
  }
}
```

### 7.2 运行时检查

```typescript
function validateRuntime(data: any, config: any) {
  // 检查数据类型
  if (config.$merge?.strategy === "merge" && Array.isArray(data)) {
    logWarning("merge strategy expects object, got array");
  }

  // 检查unique字段存在性
  if (config.$unique?.by && Array.isArray(data)) {
    const hasField = data.some((item) => item[config.$unique.by] !== undefined);
    if (!hasField) {
      logWarning(`No items contain unique field: ${config.$unique.by}`);
    }
  }
}
```

## 8. 类型定义

```typescript
// Merge策略
type MergeStrategy = "concat" | "flatten" | "collect" | "merge";

// Unique策略
type UniqueBy = string | string[] | null;
type KeepStrategy = "first" | "last";

interface UniqueConfig {
  by: UniqueBy;
  keep?: KeepStrategy; // 默认 'first'
}

// 完整Schema（支持简洁和完整两种格式）
interface ExtractionSchema {
  extract: Record<string, any>; // X-Ray提取规则
  $merge?: MergeStrategy; // 简洁格式：直接指定策略
  $unique?: UniqueBy | UniqueConfig; // 简洁格式：直接指定字段 | 完整格式：包含额外参数
}
```

## 9. 移除的功能

### 从原设计移除的内容：

1. **复杂策略**
   - ❌ mergeSet（可用concat + unique替代）
   - ❌ mergeLatest（可用concat + unique的keep="last"替代）
   - ❌ union（可用flatten + unique替代）
   - ❌ mergeDeep（保留merge浅合并即可）
   - ❌ collectByKey（collect已足够）

2. **自定义函数**
   - ❌ compareFn（自定义比较函数）
   - ❌ DSL表达式
   - ❌ function字段

3. **高级特性**
   - ❌ keep="all"（收集所有版本到数组）
   - ❌ 后处理钩子（dropNulls, sortBy）
   - ❌ 自定义聚合函数

### 移除理由：

- **简化原则**：4个核心策略覆盖90%场景
- **组合优于复杂**：复杂需求通过组合实现
- **安全性**：避免自定义函数的安全风险
- **可维护性**：减少代码复杂度

## 10. 迁移指南

### 从旧设计迁移到新设计

| 旧配置                                       | 新配置                                                   | 说明           |
| -------------------------------------------- | -------------------------------------------------------- | -------------- |
| `$collect: {type: "concat"}`                 | `$merge: "concat"`                                       | 术语变更+简化  |
| `$dedupe: {key: "id"}`                       | `$unique: "id"`                                          | 术语变更+简化  |
| `$collect: {type: "mergeSet", key: "id"}`    | `$merge: "concat"` + `$unique: "id"`                     | 分离为两步     |
| `$collect: {type: "mergeLatest", key: "id"}` | `$merge: "concat"` + `$unique: {by: "id", keep: "last"}` | 分离为两步     |
| `$collect: {type: "union"}`                  | `$merge: "flatten"` + `$unique: null`                    | 分离为两步     |
| `$collect: {type: "collectByKey"}`           | `$merge: "collect"`                                      | 重命名         |
| `$dedupe: {compareFn: "..."}`                | ❌ 不支持                                                | 移除自定义函数 |

## 总结

### 设计优势

1. **直观易懂**：merge和unique是常见术语
2. **原子操作**：每个策略职责单一
3. **组合灵活**：4个核心策略可组合出多种场景
4. **安全可控**：只有内置策略，无安全风险
5. **易于实现**：代码量少，维护成本低

### 覆盖场景

- ✅ 列表数据抓取（商品、文章、帖子）
- ✅ 单对象收集（用户信息、评论）
- ✅ 增量更新（单对象多次补充）
- ✅ 嵌套数组扁平化（标签、分类）
- ✅ 最新数据保留（动态更新场景）
- ✅ 多字段组合去重（关系数据）

### 不支持的场景

- ❌ 深度对象合并（只支持浅合并）
- ❌ 复杂自定义逻辑（无自定义函数）
- ❌ 保留所有重复版本（只能保留first/last）

这些场景占比不到10%，可在后续版本中评估是否添加。
