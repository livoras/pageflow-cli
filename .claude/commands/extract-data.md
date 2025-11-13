---
allowed-tools: Bash(./pageflow:*), Read, Write
description: 数据提取标准操作流程，从URL或HTML文件中精确提取结构化数据
---

# 数据提取 SOP v3

用户需求：$ARGUMENTS

## 操作流程

### 步骤1: 获取 HTML 数据

#### 场景判断

根据用户输入的参数类型：
- 如果是 URL（http:// 或 https:// 开头）→ 走场景A
- 如果是文件路径 → 走场景B

#### 场景A: 从 URL 获取 HTML

**操作**:

```bash
# 保存 HTML 到临时文件
./pageflow extract --save-html "<url>" /tmp/pageflow-extract.html
```

**示例**:

```bash
./pageflow extract --save-html "https://www.baidu.com/s?wd=playwright" /tmp/pageflow-extract.html
```

**产出**: `/tmp/pageflow-extract.html`

#### 场景B: 使用已有 HTML 文件

**操作**:

直接使用用户提供的 HTML 文件路径。

**读取 HTML**:

```bash
# 使用 Read 工具读取 HTML 文件
Read(<html_file_path>)
```

**产出**: HTML 文件内容

---

### 步骤2: 分析 HTML 结构

**操作**:

- 使用 DOM 解析器分析 HTML 结构
- 识别包含目标数据的关键元素
- 分析 CSS 选择器路径
- 理解数据层次关系和重复模式

**选择器稳定性原则**（重要）：

优先使用：
- 语义化的 HTML 标签（`article`, `nav`, `header`, `section`）
- 稳定的属性选择器（`[data-testid]`, `[role]`, `[tpl]`, `[srcid]`）
- 结构化的类名（`.product-item`, `.user-profile`, `.result-card`）

避免使用：
- 疑似动态生成的 ID（如 `#result_1762948558`, `#item-abc123`）
- 带哈希值的类名（如 `.button_3a8f2b`, `.title_1ml43_1`）
- 带时间戳的选择器
- 单字符或纯数字的类名

判断方法：
- 刷新页面或换搜索词，检查选择器是否变化
- 优先选择有明确语义的属性（如百度的 `tpl="www_index"` 比 `srcid="1599"` 更稳定）

**产出**: 对数据结构的理解

---

### 步骤3: 设计提取方案

**设计原则**:

- 字段命名符合业务语义
- 数据类型准确（字符串/数组/对象）
- 层次结构清晰合理

#### 3.1 确定 Schema 类型

**决策流程**:

1. 判断数据性质：单个对象 or 列表？
2. 识别字段类型：文本、属性、嵌套对象、数组？
3. 确定选择器：CSS class、属性选择器、伪类？

**列表提取** - 使用数组作为根:

```json
[
  "article",
  {
    "title": "h2",
    "url": "a@href",
    "price": ".price-current",
    "rating": ".rating@data-rating",
    "tags": [".tag"]
  }
]
```

**单对象提取** - 使用对象作为根:

```json
{
  "profile": {
    "username": ".username",
    "avatar": ".avatar@src",
    "bio": ".user-bio"
  },
  "stats": {
    "followers": ".followers-count"
  }
}
```

**错误做法** - 不要用对象包裹列表:

```json
{
  "items": ["selector", {...}]  // 错误：多了一层对象包裹
}
```

#### 3.2 配置 Loop 策略

**自动判断规则**:

1. **列表提取场景**（schema 是数组格式 `["selector", {...}]`）：
   - **默认配置 strategy**，适用于滚动加载、翻页等场景
   - 标准配置：
     ```json
     "strategy": {
       "merge": "concat",
       "unique": "url"  // 根据实际情况选择唯一标识字段
     }
     ```

2. **单对象提取场景**（schema 是对象格式 `{...}`）：
   - **通常不需要 strategy**
   - 特殊情况：分步提取同一对象的不同字段时才配置 `"merge": "merge"`

**unique 去重字段选择优先级**:

1. URL链接 → `"unique": "url"` 或 `"unique": "link"` 或 `"unique": "href"`
2. 数据库ID → `"unique": "id"` 或 `"unique": "data-id"`
3. 标题+作者 → `"unique": ["title", "author"]`
4. 需要保留最新数据 → `"unique": {"by": "id", "keep": "last"}`

**完整配置示例**:

1. **推文列表滚动加载**:

```json
{
  "name": "推文列表提取",
  "schema": [
    "article",
    {
      "author": "[data-testid='User-Name'] span",
      "text": "[data-testid='tweetText']",
      "url": "a@href",
      "timestamp": "time"
    }
  ],
  "strategy": {
    "merge": "concat",
    "unique": "url"
  }
}
```

2. **商品价格监控（保留最新）**:

```json
{
  "name": "商品价格监控",
  "schema": [
    ".product",
    {
      "id": "@data-id",
      "name": ".name",
      "price": ".price"
    }
  ],
  "strategy": {
    "merge": "concat",
    "unique": { "by": "id", "keep": "last" }
  }
}
```

**产出**: 完整的 schema 和 strategy 配置

**🛑 等待用户确认**:

- Schema 结构是否正确（列表 vs 对象）
- 关键选择器是否准确
- Strategy 配置的 unique 字段选择是否合理

---

### 步骤4: 创建或更新 Extraction

#### 场景判定

```bash
# 查看现有 extraction 列表
./pageflow extraction list
```

**输出示例**:

```
Available extraction templates:

ID: 1
Name: 百度搜索结果提取
Description: 提取百度搜索结果页的标题、链接、摘要等信息

ID: 2
Name: 商品列表提取
Description: 提取电商商品列表信息
```

**场景选择**:
- 如果需要修改已有 extraction → 走场景A（更新现有）
- 如果创建新的 extraction → 走场景B（创建新的）

#### 场景A: 修改现有 Extraction

**修改方案**:

- 添加新字段（如：添加时间戳、点赞数等）
- 修改选择器（优化现有字段的CSS选择器）
- 调整数据结构（嵌套对象、数组格式等）

**注意**: 保留不需要修改的字段，只更新需要调整的部分

**操作示例** - 更新 ID 为 14 的 extraction:

```bash
# 1. 先读取现有配置
cat ~/.pageflow/extractions/14.json

# 2. 使用 Write 工具写入更新后的配置
# Write 工具会完整覆盖文件内容
```

**配置示例**:

```json
{
  "name": "X.com推文提取",
  "description": "提取X.com推文的详细信息",
  "schema": ["article", {
    "author": {
      "name": "[data-testid=\"User-Name\"] span",
      "username": "[data-testid=\"User-Name\"] a@href",
      "avatar": "img@src"
    },
    "content": {
      "text": "[data-testid=\"tweetText\"]",
      "timestamp": "time",
      "images": ["img@src"]
    },
    "engagement": {
      "replies": "[data-testid=\"reply\"] span",
      "retweets": "[data-testid=\"retweet\"] span",
      "likes": "[data-testid=\"like\"] span"
    }
  }],
  "strategy": {
    "merge": "concat",
    "unique": "url"
  }
}
```

#### 场景B: 创建新 Extraction

**操作步骤**:

1. 查看现有 ID，确定新 ID
2. 创建新的 JSON 文件

**操作示例** - 创建新的列表提取:

```bash
# 1. 查看现有 extractions，确定最大 ID
./pageflow extraction list

# 2. 使用 Write 工具创建新文件（假设新 ID 为 15）
# 文件路径: ~/.pageflow/extractions/15.json
```

**配置示例**:

```json
{
  "name": "商品列表提取",
  "description": "提取电商商品列表信息",
  "schema": [".product-item", {
    "title": ".product-title",
    "price": ".price-current",
    "url": "a@href",
    "image": "img@src",
    "rating": ".rating@data-rating"
  }],
  "strategy": {
    "merge": "concat",
    "unique": "url"
  }
}
```

**产出**: Extraction 配置已保存到 `~/.pageflow/extractions/<id>.json`

---

### 步骤5: 测试提取

**重要**: 从本地HTML文件提取数据必须使用 `extract-html` 命令，不能使用 `extract` 命令。

#### 方式1: 使用已保存的 extraction ID 测试

**操作**:

```bash
# 使用已保存的 extraction 配置文件（假设 ID 为 25）
./pageflow extract-html <html_file_path> ~/.pageflow/extractions/25.json
```

**完整示例**:

```bash
# 从 URL 获取 HTML
./pageflow extract --save-html "https://www.baidu.com/s?wd=playwright" /tmp/baidu.html

# 使用 extraction ID 25 提取数据
./pageflow extract-html /tmp/baidu.html ~/.pageflow/extractions/25.json
```

#### 方式2: 使用临时 schema 文件测试

**操作**:

```bash
# 1. 创建临时 schema 文件（使用 Write 工具写入）
# 2. 执行离线提取
./pageflow extract-html <html_file_path> /tmp/test-schema.json
```

**Schema 文件示例** (`/tmp/test-schema.json`):

```json
{
  "name": "测试提取",
  "schema": ["article", {
    "author": {
      "name": "[data-testid=\"User-Name\"] span",
      "username": "[data-testid=\"User-Name\"] a@href",
      "avatar": "img@src"
    },
    "content": {
      "text": "[data-testid=\"tweetText\"]",
      "timestamp": "time"
    },
    "engagement": {
      "replies": "[data-testid=\"reply\"] span",
      "likes": "[data-testid=\"like\"] span"
    }
  }],
  "strategy": {
    "merge": "concat",
    "unique": "url"
  }
}
```

**完整示例**:

```bash
# 从 URL 获取 HTML
./pageflow extract --save-html "https://x.com/search?q=playwright" /tmp/x.html

# 使用临时 schema 文件测试
./pageflow extract-html /tmp/x.html /tmp/test-schema.json
```

**输出示例**:

```json
{
  "success": true,
  "data": [
    {
      "author": {
        "name": "用户名",
        "username": "/username",
        "avatar": "https://..."
      },
      "content": {
        "text": "推文内容",
        "timestamp": "时间"
      },
      "engagement": {
        "replies": "10",
        "likes": "100"
      }
    }
  ],
  "extractedFrom": "/tmp/x.html"
}
```

**检查**:

- 字段是否完整提取
- 数据类型是否正确
- 选择器是否精确

**如果失败**: 返回步骤3调整 schema

---

### 步骤6: 验证与确认

**关键要求：必须实际看到提取的数据才能判定成功**

**流程说明**：

- 步骤6a自检通过后才能进入步骤6b
- 步骤6b用户不满意时，需要返回步骤3重新设计

#### 6a. AI自检（必须通过才能进入6b）

**数据质量检查**:

1. **空对象检查**: 不能有任何空对象 `{}`，数组中不能包含空对象 `[..., {}, ...]`
2. **字段语义一致性检查**:
   - 字段名应与提取的数据内容语义相符
   - 如果字段名暗示某种数据类型，但实际内容不匹配，说明选择器错误
   - 例如：
     - 名为 `title/name` 的字段提取出了URL
     - 名为 `url/link/href` 的字段提取出了文本或数字
     - 名为 `image/avatar/cover` 的字段提取出了文本
     - 名为 `count/price/id` 的字段提取出了非数字内容

**检查结果处理**（以本次任务内累计失败次数为准）:

- **如果检查不通过**:
  - 第1-5次失败：返回步骤3重新设计 schema 并重跑步骤4-5
  - 第6次及以上失败：停止重试，向用户报告：
    - 已尝试次数
    - 遇到的具体问题（空对象在哪、哪些字段语义不一致）
    - 尝试过的方案
    - 无法解决的原因
- **如果检查通过**: 进入步骤6b

---

#### 6b. 用户确认（仅在6a通过后执行）

**AI必须提供以下信息**:

1. **数据统计**:
   - 提取总数：X条
   - 所有字段完整的记录数：Y条（所有字段均非空的记录）

2. **示例数据展示**:
   - 展示前3-5条完整数据（JSON格式）
   - 展示字段需与 schema 定义顺序一致
   - 如有字段缺失，需明确标注

**🛑 等待用户确认**:

- 数据完整性满意
- 数据质量符合预期
- 无需进一步调整

**严禁**: 在未看到实际提取数据的情况下声称成功

**如果不满足**: 重复步骤3-5直到完美

---

## 参考资料

### X-Ray Schema 语法

> **用途**: 快速查阅选择器和提取语法规则

#### 文本提取（默认行为）

```javascript
{
  "title": "h1",                    // 提取 h1 的文本内容
  "content": ".article-content",    // 提取 .article-content 的文本
  "price": ".price"                 // 提取 .price 的文本
}
```

#### 属性提取

```javascript
{
  "image": "img@src",               // 提取 img 的 src 属性
  "link": "a@href",                 // 提取 a 的 href 属性
  "html": ".content@html",          // 提取 .content 的 HTML 内容
  "data": "div@data-id"             // 提取自定义 data 属性
}
```

#### 简单数组

```javascript
{
  "links": ["a@href"],              // 提取所有 a 标签的 href
  "images": ["img@src"],            // 提取所有图片的 src
  "texts": ["p"]                    // 提取所有 p 标签的文本
}
```

#### 对象数组（列表提取）

```javascript
[
  "article",
  {
    title: "h2",
    author: ".author",
    date: ".date",
    link: "a@href",
  },
];
```

#### 嵌套数组（列表提取）

```javascript
[
  ".category",
  {
    name: ".category-name",
    posts: [
      ".post",
      {
        title: ".post-title",
        content: ".post-content",
      },
    ],
  },
];
```

#### 嵌套对象（单对象提取）

```javascript
{
  "profile": {
    "username": ".username",
    "displayName": ".display-name",
    "avatar": ".profile-avatar@src",
    "bio": ".user-bio",
    "location": ".location"
  },
  "stats": {
    "followers": ".followers-count",
    "following": ".following-count",
    "posts": ".posts-count"
  },
  "social": {
    "twitter": "a.twitter@href",
    "github": "a.github@href",
    "website": "a.website@href"
  }
}
```

#### CSS 选择器支持

```javascript
{
  "firstParagraph": "p:first-child",
  "lastLink": "a:last-child",
  "evenRows": "tr:nth-child(even)",
  "hasClass": ".item.active",
  "descendant": ".container .item",
  "child": ".parent > .child"
}
```

#### 实际示例

**电商产品列表（列表提取）**:

```javascript
[
  ".product",
  {
    name: ".product-title",
    price: ".price-current",
    originalPrice: ".price-original",
    rating: ".rating@data-rating",
    image: ".product-image@src",
    url: "a@href",
    reviews: ".review-count",
  },
];
```

**新闻文章列表（列表提取）**:

```javascript
[
  "article",
  {
    title: "h2",
    author: ".author",
    date: ".date",
    content: ".content",
    link: "a@href",
    tags: [".tag"],
  },
];
```

---

### Loop Strategy 详解

> **用途**: 理解 merge 和 unique 策略的详细行为

详细说明参见: `docs/20251003-221244-loop-extraction-strategies.md`

#### merge 策略

| 策略    | 行为                     | 场景         |
| ------- | ------------------------ | ------------ |
| concat  | 数组展开，非数组转单元素 | 列表滚动加载 |
| collect | 数组展开，对象作为元素   | 混合数据类型 |
| merge   | 浅合并对象，忽略数组     | 分步提取对象 |

#### unique 策略

| 配置   | 示例                                     | 行为               |
| ------ | ---------------------------------------- | ------------------ |
| null   | `"unique": null`                         | 按值去重           |
| 字符串 | `"unique": "url"`                        | 按单字段去重       |
| 数组   | `"unique": ["title", "url"]`             | 按多字段组合去重   |
| 对象   | `"unique": {"by": "id", "keep": "last"}` | 指定字段和保留策略 |

**特殊行为**:

- 字段缺失时该记录会被保留
- 支持嵌套字段如 `"user.id"`
- 多字段用 `|` 连接作为唯一键
- `keep` 默认为 `"first"`

---

### CLI 命令参考

> **用途**: 查询常用的 pageflow CLI 命令

| 操作                | 命令                                                 |
| ------------------- | ---------------------------------------------------- |
| 保存 HTML           | `./pageflow extract --save-html <url> <file>`        |
| 在线提取（用ID）     | `./pageflow extract <url> <extraction-id>`          |
| 在线提取（用schema） | `./pageflow extract --schema <schema-file> <url>`   |
| **离线提取（用ID）** | `./pageflow extract-html <html> ~/.pageflow/extractions/<id>.json` |
| **离线提取（用schema）** | `./pageflow extract-html <html> <schema-file>`   |
| 列出 extractions    | `./pageflow extraction list`                         |
| 查看 extraction     | `./pageflow extraction show <id>`                    |
| 删除 extraction     | `./pageflow extraction delete <id1,id2>`             |

**文件路径**:
- Extraction 配置: `~/.pageflow/extractions/<id>.json`
- 临时 HTML: `/tmp/pageflow-extract.html`

**重要规则**:
- `extract` 命令：用于**在线提取**（从URL获取并提取，或只保存HTML）
- `extract-html` 命令：用于**离线提取**（从本地HTML文件提取数据）

---

### 核心原则

> **用途**: 执行任务时的关键原则和约束

- **成功标准**: 必须实际看到完整提取数据并完全符合用户需求
- **失败判定**: 在没有看到数据或数据不完整的情况下汇报成功即为失败
- **增量修改**: 保持已验证的字段不变，仅调整需要优化的部分
- **最小变更**: 避免一次性大幅重构，降低出错风险
- **逐步验证**: 每次修改后立即测试，确保数据质量
- **列表提取规则**: 提取列表数据时必须使用数组schema `["selector", {...}]` 作为根，不能使用对象包裹
- **用户确认**: 方案和结果都需要用户明确确认
- **禁止猜测**: 未看到数据不能声称成功
- **迭代优化**: 直到完美，不接受"差不多"
- **创建可重用的提取模板**: 设计通用性强的 extraction 配置以便后续重用
- 遵循X-Ray提取语法规则
- CSS选择器精确定位
- 支持数组语法 `[selector, {...}]`
- 属性提取语法 `selector@attribute`
