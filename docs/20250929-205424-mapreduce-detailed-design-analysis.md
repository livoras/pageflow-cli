# Loop Extraction MapReduce 详细设计分析

基于文档和前面的讨论，对 `$collect` 和 `$dedupe` 进行深度设计分析：

## 核心场景分析

### 1. 数据结构类型矩阵

| 提取结果类型 | 数据特征                   | 最佳collect策略      | 典型场景             |
| ------------ | -------------------------- | -------------------- | -------------------- |
| **扁平数组** | `[item1, item2, ...]`      | `concat`             | 商品列表、文章列表   |
| **嵌套数组** | `[[items...], [items...]]` | `concat` + `flatten` | 分类数据、多层级列表 |
| **单一对象** | `{key: value, ...}`        | `collectByKey`       | 用户信息、详情页     |
| **对象集合** | `[{obj1}, {obj2}, ...]`    | `concat`             | 用户列表、评论列表   |
| **键值映射** | `{key1: obj1, key2: obj2}` | `mergeDeep`          | 配置数据、状态数据   |

### 2. 业务场景深度分析

#### 场景A：电商商品爬取

```json
{
  "extract": {
    "items": ".product-item",
    "id": "@data-product-id",
    "name": ".title | text",
    "price": ".price | text",
    "stock": ".stock | text",
    "lastUpdated": ".timestamp | text"
  },
  "$collect": {
    "type": "mergeLatest",
    "key": "id",
    "keep": "latest",
    "sortBy": "lastUpdated"
  },
  "$dedupe": {
    "key": "id",
    "strategy": "keep-latest"
  }
}
```

**特点**：商品信息可能会更新，需要保留最新版本

#### 场景B：社交媒体内容抓取

```json
{
  "extract": {
    "items": ".post",
    "id": "@data-post-id",
    "content": ".content | text",
    "author": ".author | text",
    "timestamp": ".time@datetime",
    "likes": ".likes-count | text",
    "comments": [
      ".comment",
      {
        "id": "@data-comment-id",
        "text": ".text | text",
        "author": ".author | text"
      }
    ]
  },
  "$collect": {
    "type": "concat",
    "preserveOrder": true
  },
  "$dedupe": {
    "key": "id",
    "strategy": "merge-nested",
    "nestedMerge": {
      "comments": "concat-unique"
    }
  }
}
```

**特点**：帖子不变但评论可能增加，需要合并嵌套数组

#### 场景C：新闻聚合（多源数据）

```json
{
  "extract": {
    "items": "article",
    "url": "a@href",
    "title": "h2 | text",
    "source": ".source | text",
    "publishTime": ".time@datetime",
    "content": ".summary | text"
  },
  "$collect": {
    "type": "mergeConflict",
    "key": "url",
    "conflictResolution": {
      "title": "longest",
      "content": "longest",
      "publishTime": "earliest",
      "source": "collect-array"
    }
  },
  "$dedupe": {
    "key": "url",
    "fuzzyMatch": {
      "title": "similarity-90%"
    }
  }
}
```

**特点**：同一新闻可能在多个源出现，需要智能合并

## 详细配置设计

### $collect 高级配置

```typescript
interface CollectConfig {
  // 基础策略
  type:
    | "concat"
    | "merge"
    | "mergeDeep"
    | "collectByKey"
    | "mergeSet"
    | "mergeLatest"
    | "union"
    | "mergeConflict";

  // 通用配置
  key?: string | string[]; // 合并键
  keep?: "first" | "latest" | "all"; // 冲突处理
  sortBy?: string | string[]; // 排序字段
  preserveOrder?: boolean; // 保持原始顺序

  // 高级策略配置
  conflictResolution?: {
    // 字段冲突解决策略
    [field: string]:
      | "first"
      | "latest"
      | "longest"
      | "shortest"
      | "sum"
      | "max"
      | "min"
      | "collect-array";
  };

  nestedMerge?: {
    // 嵌套数组合并策略
    [field: string]: "concat" | "concat-unique" | "merge" | "replace";
  };

  // 条件过滤
  filter?: {
    condition: string; // DSL条件表达式
    beforeMerge?: boolean; // 合并前还是合并后过滤
  };

  // 转换
  transform?: {
    [field: string]: string; // 字段转换表达式
  };
}
```

### $dedupe 高级配置

```typescript
interface DedupeConfig {
  // 基础去重
  key: string | string[]; // 去重键
  strategy?: "strict" | "fuzzy" | "custom";

  // 模糊匹配
  fuzzyMatch?: {
    [field: string]: string; // 'similarity-90%', 'levenshtein-5', 'soundex'
  };

  // 自定义比较
  compareFn?: string; // DSL函数或注册函数名

  // 冲突解决
  onConflict?: "keep-first" | "keep-latest" | "merge" | "custom";

  // 复合键处理
  compositeKey?: {
    fields: string[];
    separator?: string;
    ignoreCase?: boolean;
  };

  // 性能优化
  optimization?: {
    hashIndex?: boolean; // 使用哈希索引
    batchSize?: number; // 批处理大小
  };
}
```

## 复杂案例详解

### 案例1：电商价格监控系统

**需求**：监控商品价格变化，保留历史记录但去重相同价格

```json
{
  "extract": {
    "items": ".product",
    "id": "@data-id",
    "name": ".name | text",
    "price": ".price | text",
    "originalPrice": ".original-price | text",
    "timestamp": ".updated | text",
    "availability": ".stock | text"
  },
  "$collect": {
    "type": "mergeConflict",
    "key": "id",
    "conflictResolution": {
      "name": "latest",
      "price": "collect-array",
      "originalPrice": "collect-array",
      "timestamp": "latest",
      "availability": "latest"
    },
    "transform": {
      "priceHistory": "collectChanges(price, timestamp)"
    }
  },
  "$dedupe": {
    "key": "id",
    "strategy": "custom",
    "compareFn": "priceChangeDedup",
    "onConflict": "merge-arrays"
  }
}
```

### 案例2：用户行为轨迹分析

**需求**：用户在不同页面的行为数据，按时间顺序合并

```json
{
  "extract": {
    "userId": "@data-user-id",
    "actions": [
      ".action",
      {
        "type": "@data-action",
        "timestamp": "@data-time",
        "target": ".target | text",
        "value": ".value | text"
      }
    ]
  },
  "$collect": {
    "type": "mergeDeep",
    "key": "userId",
    "nestedMerge": {
      "actions": "concat-unique"
    },
    "sortBy": "actions.timestamp",
    "filter": {
      "condition": "actions.timestamp > lastWeek",
      "beforeMerge": false
    }
  },
  "$dedupe": {
    "key": "userId",
    "strategy": "custom",
    "compareFn": "actionDedup",
    "compositeKey": {
      "fields": ["userId", "actions.type", "actions.timestamp"],
      "separator": "|"
    }
  }
}
```

### 案例3：多语言新闻聚合

**需求**：同一新闻的不同语言版本，保留所有语言但避免重复

```json
{
  "extract": {
    "items": "article",
    "canonicalUrl": "link[rel='canonical']@href",
    "title": "h1 | text",
    "language": "html@lang",
    "content": ".content | text",
    "publishTime": "time@datetime",
    "translations": [
      ".lang-link",
      {
        "lang": "@hreflang",
        "url": "@href"
      }
    ]
  },
  "$collect": {
    "type": "mergeConflict",
    "key": "canonicalUrl",
    "conflictResolution": {
      "publishTime": "earliest",
      "translations": "collect-array"
    },
    "nestedMerge": {
      "versions": "collect-by-language"
    }
  },
  "$dedupe": {
    "key": "canonicalUrl",
    "strategy": "fuzzy",
    "fuzzyMatch": {
      "title": "similarity-85%"
    },
    "onConflict": "merge"
  }
}
```

## 性能与边界考虑

### 内存管理

- 大数据集分批处理
- 流式去重算法
- 增量更新机制

### 错误处理

- 字段缺失容错
- 类型转换异常
- 循环引用检测

### 扩展性设计

- 插件化collect策略
- 自定义比较器注册
- 配置模板系统
