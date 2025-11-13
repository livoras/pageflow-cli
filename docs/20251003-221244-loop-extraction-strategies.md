# Loop 提取策略：merge 和 unique

## 背景

在页面数据采集场景中，经常需要通过循环操作（如滚动加载、翻页）来获取完整数据。每次循环迭代会产生一批数据，需要将多次迭代的结果合并并去重。

Loop 提取策略通过 `merge` 和 `unique` 两个配置项来控制数据的合并和去重行为。

实现位置：`src/utils/extraction-processor.ts`

## merge - 合并策略

控制多次迭代结果的合并方式。

### concat - 数组拼接

**定义**：将所有迭代的数组元素平铺合并成一个大数组。

**实现逻辑**：

- 如果迭代结果是数组，展开后合并
- 如果迭代结果不是数组，转换为单元素数组再合并

**数据转换**：

```javascript
// 输入
迭代1: [A, B];
迭代2: [C, D];
迭代3: [E][
  // 输出
  (A, B, C, D, E)
];
```

**使用场景**：列表滚动加载

**示例**：

```javascript
{
  "schema": ["section.note-item", {
    "title": ".title",
    "url": "a@href"
  }],
  "strategy": {
    "merge": "concat"
  }
}

// 滚动3次，每次提取到的笔记列表会合并成一个大数组
```

### collect - 收集对象

**定义**：将每次迭代的结果收集成数组，如果迭代结果本身是数组则会展开。

**实现逻辑**：

- 如果迭代结果是数组，使用扩展运算符添加元素
- 如果迭代结果是对象，直接作为单个元素添加

**数据转换**：

```javascript
// 输入
迭代1: [A, B]; // 数组
迭代2: {
  c: 1;
} // 对象
迭代3: [D, E][ // 数组
  // 输出
  (A, B, { c: 1 }, D, E)
];
```

**使用场景**：主要作为 concat 的容错实现，实际页面爬取场景中很少使用

### merge - 对象合并

**定义**：浅合并对象属性。

**实现逻辑**：

- 使用 `Object.assign` 合并对象
- 只处理对象类型，忽略数组

**数据转换**：

```javascript
// 输入
迭代1: {a: 1, b: 2}
迭代2: {c: 3}
迭代3: {b: 99, d: 4}

// 输出
{a: 1, b: 99, c: 3, d: 4}  // 后面的值会覆盖前面的
```

**使用场景**：分步提取同一对象的不同字段（实际很少使用）

## unique - 去重策略

对合并后的数组数据进行去重，只处理数组类型。

### 配置方式

#### 1. null - 按值去重

```javascript
"unique": null
```

直接按元素值去重，适用于基本类型数组。

**示例**：

```javascript
// 输入：[1, 2, 2, 3, 1, 4]
// 输出：[1, 2, 3, 4]
```

#### 2. 字符串 - 按单个字段去重

```javascript
"unique": "url"
```

按指定字段的值去重。

**示例**：

```javascript
// 输入
[
  { title: "文章1", url: "/a" },
  { title: "文章2", url: "/b" },
  { title: "文章1重复", url: "/a" }, // url重复
][
  // 输出（保留第一个）
  ({ title: "文章1", url: "/a" }, { title: "文章2", url: "/b" })
];
```

#### 3. 数组 - 按多字段组合去重

```javascript
"unique": ["title", "url"]
```

按多个字段的组合值去重（用 `|` 连接）。

**示例**：

```javascript
// 输入
[
  { title: "文章1", url: "/a" },
  { title: "文章1", url: "/b" }, // title相同但url不同
  { title: "文章1", url: "/a" }, // title和url都相同
][
  // 输出
  ({ title: "文章1", url: "/a" }, { title: "文章1", url: "/b" })
];
```

#### 4. 对象 - 指定去重字段和保留策略

```javascript
"unique": {
  "by": "url",           // 或 ["field1", "field2"]
  "keep": "first"        // 或 "last"
}
```

**keep 策略**：

- `first`（默认）：保留第一次出现的记录
- `last`：保留最后一次出现的记录

**示例**：

```javascript
// 配置
"unique": {
  "by": "id",
  "keep": "last"
}

// 输入
[
  {id: 1, price: 100, time: "10:00"},
  {id: 2, price: 200, time: "10:00"},
  {id: 1, price: 99, time: "11:00"}   // id重复
]

// 输出（保留最后一个）
[
  {id: 2, price: 200, time: "10:00"},
  {id: 1, price: 99, time: "11:00"}   // 保留了最新的价格
]
```

### 嵌套字段支持

去重支持通过 `.` 访问嵌套字段：

```javascript
"unique": "user.id"

// 数据
[
  {user: {id: 1, name: "Alice"}},
  {user: {id: 2, name: "Bob"}},
  {user: {id: 1, name: "Alice"}}  // user.id 重复
]

// 结果
[
  {user: {id: 1, name: "Alice"}},
  {user: {id: 2, name: "Bob"}}
]
```

### 空值处理

如果去重字段缺失或为空，该记录会被保留：

```javascript
"unique": "url"

// 输入
[
  {title: "文章1", url: "/a"},
  {title: "文章2"},              // 缺少 url 字段
  {title: "文章3", url: "/a"}    // url 重复
]

// 输出
[
  {title: "文章1", url: "/a"},
  {title: "文章2"}               // 保留了缺少url的记录
]
```

## 处理流程

```
迭代结果数组 → merge 合并 → unique 去重 → 最终结果
```

实现代码（`processLoopExtractionResults` 函数）：

```typescript
// Step 1: Apply merge strategy
const mergeStrategy =
  strategy?.merge || autoDetectMergeStrategy(iterationData[0]);
let mergedData = applyMergeStrategy(iterationData, mergeStrategy);

// Step 2: Apply unique strategy (if specified)
if (strategy?.unique && Array.isArray(mergedData)) {
  mergedData = applyUniqueStrategy(mergedData, strategy.unique);
}

return mergedData;
```

## 自动检测

如果未指定 `merge` 策略，系统会根据第一次迭代结果的类型自动选择：

```typescript
function autoDetectMergeStrategy(data: any): MergeStrategy {
  if (Array.isArray(data)) {
    return "concat";
  } else if (typeof data === "object" && data !== null) {
    return "collect";
  } else {
    return "concat";
  }
}
```

## 典型使用场景

### 场景1：列表滚动加载（最常用）

```javascript
{
  "name": "小红书笔记列表",
  "schema": ["section.note-item", {
    "title": ".title span",
    "url": "a.cover@href",
    "cover": "img@src"
  }],
  "strategy": {
    "merge": "concat",    // 合并所有迭代的列表
    "unique": "url"       // 按URL去重
  }
}
```

**执行过程**：

1. 滚动加载第1页：提取到20条笔记
2. 滚动加载第2页：提取到20条笔记（可能有重复）
3. 滚动加载第3页：提取到15条笔记
4. merge concat：合并成55条
5. unique url：去重后得到50条唯一笔记

### 场景2：价格监控（保留最新）

```javascript
{
  "name": "商品价格监控",
  "schema": [".product", {
    "id": "@data-id",
    "name": ".name",
    "price": ".price"
  }],
  "strategy": {
    "merge": "concat",
    "unique": {
      "by": "id",
      "keep": "last"      // 保留最新价格
    }
  }
}
```

### 场景3：分步提取对象（少见）

```javascript
{
  "name": "用户详情分步提取",
  "schema": {
    "name": ".user-name",
    "email": ".user-email"
  },
  "strategy": {
    "merge": "merge"      // 对象合并
  }
}
```

## 实际数据流示例

### 完整示例：X.com 推文滚动加载

**Extraction 配置**：

```javascript
{
  "name": "X.com推文列表",
  "schema": ["article", {
    "author": ".author-name",
    "text": ".tweet-text",
    "url": "a@href"
  }],
  "strategy": {
    "merge": "concat",
    "unique": "url"
  }
}
```

**执行过程**：

迭代1（初始加载）：

```javascript
[
  { author: "Alice", text: "Hello", url: "/tweet/1" },
  { author: "Bob", text: "World", url: "/tweet/2" },
];
```

迭代2（滚动后）：

```javascript
[
  { author: "Bob", text: "World", url: "/tweet/2" }, // 重复
  { author: "Charlie", text: "Hi", url: "/tweet/3" },
  { author: "David", text: "Hey", url: "/tweet/4" },
];
```

迭代3（再次滚动）：

```javascript
[
  { author: "David", text: "Hey", url: "/tweet/4" }, // 重复
  { author: "Eve", text: "Bye", url: "/tweet/5" },
];
```

**merge concat 结果**：

```javascript
[
  { author: "Alice", text: "Hello", url: "/tweet/1" },
  { author: "Bob", text: "World", url: "/tweet/2" },
  { author: "Bob", text: "World", url: "/tweet/2" }, // 重复
  { author: "Charlie", text: "Hi", url: "/tweet/3" },
  { author: "David", text: "Hey", url: "/tweet/4" },
  { author: "David", text: "Hey", url: "/tweet/4" }, // 重复
  { author: "Eve", text: "Bye", url: "/tweet/5" },
];
```

**unique url 结果**：

```javascript
[
  { author: "Alice", text: "Hello", url: "/tweet/1" },
  { author: "Bob", text: "World", url: "/tweet/2" },
  { author: "Charlie", text: "Hi", url: "/tweet/3" },
  { author: "David", text: "Hey", url: "/tweet/4" },
  { author: "Eve", text: "Bye", url: "/tweet/5" },
];
```

最终得到5条唯一推文。
