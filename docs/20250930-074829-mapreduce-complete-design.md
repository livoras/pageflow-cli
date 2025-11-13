# Loop Extraction MapReduce 完整设计文档

## 1. $collect 详细设计

### 1.1 concat 策略

**适用场景：** 从多个页面或迭代中收集列表数据，需要保留所有项目和原始顺序。

**配置参数：**

```typescript
{
  "$collect": {
    "type": "concat"
  }
}
```

**数据流转示例：**

```
循环1提取: [{id: 1, title: "A"}, {id: 2, title: "B"}]
循环2提取: [{id: 3, title: "C"}, {id: 1, title: "A"}]
循环3提取: [{id: 4, title: "D"}]

concat结果: [
  {id: 1, title: "A"},
  {id: 2, title: "B"},
  {id: 3, title: "C"},
  {id: 1, title: "A"},
  {id: 4, title: "D"}
]
```

**边界情况：**

- 空数组：返回空数组 `[]`
- 非数组类型：自动转换为单元素数组 `[value]`
- undefined/null：跳过该迭代

### 1.2 mergeSet 策略

**适用场景：** 在聚合阶段就需要去重，保留首次出现的记录。

**配置参数：**

```typescript
{
  "$collect": {
    "type": "mergeSet",
    "key": "id",           // 必填：去重依据字段
    "keep": "first"        // 默认：保留首次出现
  }
}
```

**数据流转示例：**

```
循环1提取: [{id: 1, title: "A", score: 10}]
循环2提取: [{id: 2, title: "B", score: 20}, {id: 1, title: "A-updated", score: 15}]
循环3提取: [{id: 3, title: "C", score: 30}]

mergeSet结果: [
  {id: 1, title: "A", score: 10},        // 保留首次
  {id: 2, title: "B", score: 20},
  {id: 3, title: "C", score: 30}
]
```

**边界情况：**

- key字段缺失：跳过该条记录并记录警告
- key字段值为null/undefined：视为独立记录
- 多层嵌套key：支持点号路径如 `"key": "user.id"`

### 1.3 mergeLatest 策略

**适用场景：** 需要保留最新版本的数据，适合数据可能被更新的场景。

**配置参数：**

```typescript
{
  "$collect": {
    "type": "mergeLatest",
    "key": "id",
    "keep": "latest"       // 保留最后出现的版本
  }
}
```

**数据流转示例：**

```
循环1提取: [{id: 1, title: "旧标题", views: 100}]
循环2提取: [{id: 2, title: "文章2", views: 50}]
循环3提取: [{id: 1, title: "新标题", views: 150}]

mergeLatest结果: [
  {id: 1, title: "新标题", views: 150},   // 保留最新
  {id: 2, title: "文章2", views: 50}
]
```

**边界情况：**

- 同一循环内重复：保留最后一个
- 字段部分更新：完全替换，不做字段级合并

### 1.4 union 策略

**适用场景：** 收集基础类型值（字符串、数字），自动去重。

**配置参数：**

```typescript
{
  "$collect": {
    "type": "union"
  }
}
```

**数据流转示例：**

```
循环1提取: ["tag1", "tag2", "tag3"]
循环2提取: ["tag2", "tag4"]
循环3提取: ["tag5", "tag1"]

union结果: ["tag1", "tag2", "tag3", "tag4", "tag5"]
```

**边界情况：**

- 混合类型：按字符串转换后比较
- 对象类型：JSON序列化后比较

### 1.5 merge 策略

**适用场景：** 合并单个对象的多次更新，适合单记录多次增量提取。

**配置参数：**

```typescript
{
  "$collect": {
    "type": "merge",
    "deep": false          // false=浅合并，true=深合并
  }
}
```

**数据流转示例：**

```
循环1提取: {id: 1, title: "文章", author: "张三"}
循环2提取: {id: 1, views: 100, likes: 20}
循环3提取: {id: 1, comments: 5}

merge结果: {
  id: 1,
  title: "文章",
  author: "张三",
  views: 100,
  likes: 20,
  comments: 5
}
```

**边界情况：**

- 字段冲突：后者覆盖前者
- 数组字段：直接替换不合并
- null值：覆盖已有值

### 1.6 mergeDeep 策略

**适用场景：** 需要深度合并嵌套对象的场景。

**配置参数：**

```typescript
{
  "$collect": {
    "type": "mergeDeep",
    "deep": true
  }
}
```

**数据流转示例：**

```
循环1提取: {
  id: 1,
  user: {name: "张三", age: 30},
  stats: {views: 100}
}
循环2提取: {
  id: 1,
  user: {city: "北京"},
  stats: {likes: 20}
}

mergeDeep结果: {
  id: 1,
  user: {name: "张三", age: 30, city: "北京"},
  stats: {views: 100, likes: 20}
}
```

**边界情况：**

- 嵌套数组：直接替换
- 深度限制：最大10层，超过则使用浅合并

### 1.7 collectByKey 策略

**适用场景：** 每次循环提取单个对象，需要收集到数组中。

**配置参数：**

```typescript
{
  "$collect": {
    "type": "collectByKey",
    "key": "id"
  }
}
```

**数据流转示例：**

```
循环1提取: {id: "user1", name: "张三", age: 30}
循环2提取: {id: "user2", name: "李四", age: 25}
循环3提取: {id: "user3", name: "王五", age: 28}

collectByKey结果: [
  {id: "user1", name: "张三", age: 30},
  {id: "user2", name: "李四", age: 25},
  {id: "user3", name: "王五", age: 28}
]
```

**边界情况：**

- 提取结果是数组：展平后收集
- 提取结果是null：跳过该迭代

## 2. $dedupe 详细设计

### 2.1 单字段去重

**配置方式：**

```typescript
{
  "$dedupe": {
    "key": "id"
  }
}
```

**示例：**

```
输入: [
  {id: 1, title: "A"},
  {id: 2, title: "B"},
  {id: 1, title: "A"}
]

输出: [
  {id: 1, title: "A"},
  {id: 2, title: "B"}
]
```

### 2.2 多字段组合去重

**配置方式：**

```typescript
{
  "$dedupe": {
    "key": ["author", "title"]  // 组合唯一性
  }
}
```

**示例：**

```
输入: [
  {author: "张三", title: "文章A", date: "2025-01-01"},
  {author: "李四", title: "文章A", date: "2025-01-02"},
  {author: "张三", title: "文章A", date: "2025-01-03"}
]

输出: [
  {author: "张三", title: "文章A", date: "2025-01-01"},
  {author: "李四", title: "文章A", date: "2025-01-02"}
]
```

### 2.3 自定义比较函数

**配置方式：**

```typescript
{
  "$dedupe": {
    "compareFn": "item => item.url.split('?')[0]"  // 忽略URL参数
  }
}
```

**示例：**

```
输入: [
  {url: "https://example.com/page?id=1"},
  {url: "https://example.com/page?id=2"}
]

输出: [
  {url: "https://example.com/page?id=1"}
]
```

### 2.4 去重保留策略

**配置方式：**

```typescript
{
  "$dedupe": {
    "key": "id",
    "keep": "first" | "latest" | "all"
  }
}
```

**策略说明：**

- `first`：保留首次出现（默认）
- `latest`：保留最后出现
- `all`：保留所有，将重复项收集到数组

**all策略示例：**

```
输入: [
  {id: 1, score: 10, date: "2025-01-01"},
  {id: 1, score: 15, date: "2025-01-02"},
  {id: 2, score: 20, date: "2025-01-01"}
]

输出: [
  {
    id: 1,
    versions: [
      {score: 10, date: "2025-01-01"},
      {score: 15, date: "2025-01-02"}
    ]
  },
  {id: 2, score: 20, date: "2025-01-01"}
]
```

## 3. 完整应用场景

### 3.1 电商商品列表抓取

**场景描述：** 抓取多页商品列表，商品可能在多页重复出现（推荐算法导致）。

**Schema配置：**

```json
{
  "extract": {
    "items": "div.product-item",
    "id": "div@data-product-id",
    "title": "h3.title | text",
    "price": "span.price | text",
    "url": "a.link@href",
    "rating": "span.rating | text"
  },
  "$collect": {
    "type": "concat"
  },
  "$dedupe": {
    "key": "id",
    "keep": "first"
  }
}
```

**数据流：**

```
第1页: 提取20个商品
第2页: 提取20个商品（5个与第1页重复）
第3页: 提取20个商品（3个与前两页重复）

concat: 60个商品
dedupe: 52个唯一商品
```

### 3.2 社交媒体帖子抓取

**场景描述：** 滚动加载抓取推特帖子，需要保留最新版本（点赞数、评论数会变化）。

**Schema配置：**

```json
{
  "extract": {
    "items": "article.tweet",
    "id": "article@data-tweet-id",
    "author": "span.author | text",
    "content": "div.content | text",
    "url": "a.permalink@href",
    "likes": "span.likes | text",
    "retweets": "span.retweets | text",
    "timestamp": "time@datetime"
  },
  "$collect": {
    "type": "mergeLatest",
    "key": "id"
  },
  "$dedupe": {
    "key": "id",
    "keep": "latest"
  }
}
```

**数据流：**

```
滚动1: 提取10条推文（点赞数为滚动时的值）
滚动2: 提取10条推文（2条重复，点赞数已增加）
滚动3: 提取10条推文（1条重复，点赞数继续增加）

mergeLatest: 保留最新版本的点赞数
最终结果: 27条唯一推文，数据为最新状态
```

### 3.3 新闻文章聚合

**场景描述：** 从多个新闻源抓取文章，通过URL去重（忽略追踪参数）。

**Schema配置：**

```json
{
  "extract": {
    "items": "article.news-item",
    "title": "h2.headline | text",
    "url": "a.link@href",
    "source": "span.source | text",
    "publishDate": "time.date@datetime",
    "summary": "p.summary | text"
  },
  "$collect": {
    "type": "concat"
  },
  "$dedupe": {
    "compareFn": "item => new URL(item.url).origin + new URL(item.url).pathname",
    "keep": "first"
  }
}
```

**数据流：**

```
来源1: 提取15篇文章
来源2: 提取20篇文章（5篇与来源1相同，URL带不同参数）
来源3: 提取10篇文章（3篇重复）

concat: 45篇文章
dedupe: 37篇唯一文章（通过标准化URL去重）
```

### 3.4 用户评论收集

**场景描述：** 收集单个用户在不同页面的评论，合并用户信息。

**Schema配置：**

```json
{
  "extract": {
    "userId": "div@data-user-id",
    "username": "span.username | text",
    "avatar": "img.avatar@src",
    "comment": "div.comment-text | text",
    "postId": "div@data-post-id",
    "timestamp": "time@datetime"
  },
  "$collect": {
    "type": "collectByKey",
    "key": "userId"
  },
  "$dedupe": {
    "key": ["userId", "postId"],
    "keep": "first"
  }
}
```

**数据流：**

```
页面1: 用户A的评论1
页面2: 用户A的评论2，用户B的评论1
页面3: 用户A的评论3，用户B的评论2

collectByKey: 收集为数组
dedupe: 去除同一用户在同一帖子的重复评论
最终: 5条唯一评论
```

### 3.5 分页数据采集

**场景描述：** 采集分页API返回的数据，相邻页面可能有数据重叠。

**Schema配置：**

```json
{
  "extract": {
    "items": "div.item",
    "id": "div@data-id",
    "name": "span.name | text",
    "value": "span.value | text",
    "updatedAt": "span.time@data-timestamp"
  },
  "$collect": {
    "type": "mergeSet",
    "key": "id",
    "keep": "first"
  },
  "$dedupe": {
    "key": "id"
  }
}
```

**数据流：**

```
第1页: items 1-50
第2页: items 45-95 （5条重叠）
第3页: items 90-140 （5条重叠）

mergeSet: 在收集阶段去重，减少内存占用
最终: 140条唯一记录
```

## 4. 配置组合模式

### 4.1 常见组合

| collect策略               | dedupe策略                    | 适用场景           |
| ------------------------- | ----------------------------- | ------------------ |
| concat + 单字段去重       | `{key: "id"}`                 | 列表抓取，简单去重 |
| mergeLatest + 单字段去重  | `{key: "id", keep: "latest"}` | 需要最新数据的列表 |
| collectByKey + 多字段去重 | `{key: ["userId", "itemId"]}` | 关系数据采集       |
| union + 无dedupe          | -                             | 标签、分类收集     |
| merge + 无dedupe          | -                             | 单对象增量更新     |
| concat + 自定义比较       | `{compareFn: "..."}`          | 复杂去重逻辑       |

### 4.2 不推荐的组合

| collect策略 | dedupe策略  | 原因                          |
| ----------- | ----------- | ----------------------------- |
| mergeSet    | 相同key去重 | collect阶段已去重，dedupe冗余 |
| union       | 任何dedupe  | union本身就去重               |
| merge       | 任何去重    | merge用于单对象，不适用去重   |

### 4.3 默认行为建议

**当未指定$collect时：**

- 数组类型：默认使用 `concat`
- 对象类型：默认使用 `collectByKey`（需指定key）

**当未指定$dedupe时：**

- 不进行去重处理
- 返回collect阶段的完整结果

**推荐的默认配置：**

```json
{
  "$collect": {
    "type": "concat"
  },
  "$dedupe": {
    "key": "id",
    "keep": "first"
  }
}
```

## 5. 错误处理和降级策略

### 5.1 数据类型不匹配

**场景：** collect策略期望数组，但收到对象

**处理策略：**

```typescript
if (expectedArray && isObject(data)) {
  data = [data]; // 转换为单元素数组
  logWarning("Data type mismatch: converted object to array");
}

if (expectedObject && isArray(data)) {
  data = data[0]; // 取首个元素
  logWarning("Data type mismatch: using first array element");
}
```

**降级方案：**

- 继续执行，记录警告
- 在结果中添加 `_warnings` 字段

### 5.2 缺少key字段

**场景：** dedupe指定key="id"，但某些记录缺少id字段

**处理策略：**

```typescript
if (!item[dedupeKey]) {
  if (config.strictMode) {
    throw new Error(`Missing dedupe key: ${dedupeKey}`);
  } else {
    item._dedupeKey = generateUniqueId(); // 生成临时ID
    logWarning(`Missing key "${dedupeKey}", assigned temp ID`);
  }
}
```

**降级方案：**

- 宽松模式：为缺失key的记录生成临时唯一ID
- 严格模式：抛出错误，停止处理

### 5.3 策略不适用

**场景：** 使用mergeDeep但数据结构不支持深度合并

**处理策略：**

```typescript
try {
  result = mergeDeep(accumulator, current);
} catch (error) {
  logWarning("mergeDeep failed, falling back to merge");
  result = merge(accumulator, current);
}
```

**降级方案：**

- mergeDeep → merge
- mergeSet → concat + dedupe
- collectByKey → concat

### 5.4 内存溢出保护

**场景：** 数据量超过内存限制

**处理策略：**

```typescript
const MAX_ITEMS = 100000;
const MAX_SIZE_MB = 512;

if (items.length > MAX_ITEMS) {
  logWarning(`Item count exceeded ${MAX_ITEMS}, enabling streaming mode`);
  enableStreamingMode();
}

if (estimatedSize > MAX_SIZE_MB * 1024 * 1024) {
  logWarning(`Data size exceeded ${MAX_SIZE_MB}MB, truncating results`);
  items = items.slice(0, MAX_ITEMS);
}
```

**降级方案：**

- 启用流式处理
- 截断结果并记录警告
- 提供分批处理建议

### 5.5 循环异常处理

**场景：** 某次循环提取失败

**处理策略：**

```typescript
for (let i = 0; i < loopCount; i++) {
  try {
    const data = await extractData(i);
    accumulator = collect(accumulator, data);
  } catch (error) {
    logError(`Loop iteration ${i} failed: ${error.message}`);
    if (config.continueOnError) {
      continue; // 跳过失败的迭代
    } else {
      throw error; // 中止整个循环
    }
  }
}
```

**降级方案：**

- 继续模式：跳过失败的迭代，使用已收集的数据
- 中止模式：抛出错误，返回部分结果

## 6. 配置验证

### 6.1 Schema验证规则

```typescript
function validateSchema(schema: any) {
  // 验证$collect
  if (schema.$collect) {
    const validTypes = [
      "concat",
      "merge",
      "mergeDeep",
      "collectByKey",
      "mergeSet",
      "mergeLatest",
      "union",
    ];
    if (!validTypes.includes(schema.$collect.type)) {
      throw new Error(`Invalid collect type: ${schema.$collect.type}`);
    }

    // 某些策略必须指定key
    if (
      ["mergeSet", "mergeLatest", "collectByKey"].includes(
        schema.$collect.type,
      ) &&
      !schema.$collect.key
    ) {
      throw new Error(`${schema.$collect.type} requires a key parameter`);
    }
  }

  // 验证$dedupe
  if (schema.$dedupe) {
    if (!schema.$dedupe.key && !schema.$dedupe.compareFn) {
      throw new Error("$dedupe requires either key or compareFn");
    }
  }
}
```

### 6.2 运行时验证

```typescript
function validateRuntime(data: any, config: any) {
  // 检查数据类型是否匹配策略
  if (config.$collect.type === "concat" && !Array.isArray(data)) {
    logWarning("concat expects array, converting to array");
    return [data];
  }

  // 检查key字段是否存在
  if (config.$dedupe?.key) {
    const hasKey = data.some((item) => item[config.$dedupe.key] !== undefined);
    if (!hasKey) {
      logWarning(`No items contain dedupe key: ${config.$dedupe.key}`);
    }
  }

  return data;
}
```
