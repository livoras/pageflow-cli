# Loop Extraction MapReduce 去重机制设计

## 设计背景

针对循环数据提取中不同数据类型的合并和去重需求，设计基于MapReduce模式的处理机制。

## 核心设计原则

### 职责分离

将处理流程显式分为两个独立阶段：

1. **`$collect`** - 迭代聚合策略（如何合并多次循环的数据）
2. **`$dedupe`** - 去重策略（基于什么字段或规则去重）

### Schema 结构设计

```json
{
  "extract": {
    "items": "li.post",
    "id": "a@data-id",
    "title": "h3 | text"
  },
  "$collect": {
    "type": "mergeSet",
    "key": "id",
    "keep": "latest"
  },
  "$dedupe": {
    "key": "id"
  }
}
```

## 内置聚合策略

### 数组类型策略

- **`concat`** - 顺序保持合并
- **`mergeSet`** - 按字段去重保留首个
- **`mergeLatest`** - 按字段去重保留最新
- **`union`** - 基础类型集合去重

### 对象类型策略

- **`merge`** - 浅合并
- **`mergeDeep`** - 深合并
- **`collectByKey`** - 转数组并按键归组

### 后处理钩子

- **`dropNulls`** - 移除空值
- **`sortBy`** - 结果排序

## 应用场景示例

### 场景1：文章列表提取

```json
{
  "extract": {
    "items": "article.post",
    "id": "a@data-id",
    "title": "h2 | text",
    "url": "a@href"
  },
  "$collect": {
    "type": "concat"
  },
  "$dedupe": {
    "key": "id"
  }
}
```

**数据流：**

- 循环1: `[{id:"001", title:"文章1"}, {id:"002", title:"文章2"}]`
- 循环2: `[{id:"003", title:"文章3"}, {id:"001", title:"文章1"}]`
- concat结果: `[{id:"001"}, {id:"002"}, {id:"003"}, {id:"001"}]`
- dedupe结果: `[{id:"001", title:"文章1"}, {id:"002", title:"文章2"}, {id:"003", title:"文章3"}]`

### 场景2：用户信息提取

```json
{
  "extract": {
    "id": "div@data-user-id",
    "name": ".username | text",
    "avatar": "img@src"
  },
  "$collect": {
    "type": "collectByKey",
    "key": "id"
  },
  "$dedupe": {
    "key": "id"
  }
}
```

**数据流：**

- 循环1: `{id:"user1", name:"张三", avatar:"a.jpg"}`
- 循环2: `{id:"user2", name:"李四", avatar:"b.jpg"}`
- collectByKey结果: `[{id:"user1", name:"张三"}, {id:"user2", name:"李四"}]`
- dedupe结果: `[{id:"user1", name:"张三"}, {id:"user2", name:"李四"}]`

## 自定义函数支持

### 安全限制

- 限定在受信执行环境
- 接受上下文参数：当前聚合值、新值、元数据
- 返回新聚合值

### DSL 支持

支持通过DSL（如JSONPath + 运算符）表达简单逻辑，避免用户必须编写代码。

```json
{
  "$collect": {
    "type": "custom",
    "function": "prev.concat(curr).filter(item => item.score > 5)"
  }
}
```

## 实施策略

### 第一阶段

1. 实现内置策略（concat、merge、collectByKey）
2. 实现基础去重功能
3. 设计DSL原型

### 第二阶段

1. 评估自定义函数的实际需求场景
2. 编写测试用例验证各种数据类型行为
3. 完善文档和示例

## 配置参数详细说明

### collect配置

```typescript
interface CollectConfig {
  type:
    | "concat"
    | "merge"
    | "mergeDeep"
    | "collectByKey"
    | "mergeSet"
    | "mergeLatest"
    | "union";
  key?: string; // 用于mergeSet, mergeLatest, collectByKey
  keep?: "first" | "latest"; // 用于mergeSet, mergeLatest
  deep?: boolean; // 用于merge
}
```

### dedupe配置

```typescript
interface DedupeConfig {
  key: string | string[]; // 去重依据字段
  compareFn?: string; // 自定义比较函数（DSL或函数名）
}
```
