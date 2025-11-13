# HTML 数据提取语法

使用 X-Ray 语法进行声明式的 HTML 数据提取。

## API 使用

通过 HTTP API 进行数据提取：

```bash
curl -X POST "http://localhost:3100/api/pages/{pageId}/extract-data" \
  -H "Content-Type: application/json" \
  -d '{"schema": {"title": "h1", "content": "p"}}'
```

响应格式：

```json
{
  "success": true,
  "result": { "title": "页面标题", "content": "段落内容" },
  "extractionFile": "timestamp-extraction.json",
  "dataPath": "/path/to/extraction/file"
}
```

### 重新运行已有提取记录

```bash
curl -X POST "http://localhost:3100/api/recordings/{pageId}/actions/{actionIndex}/rerun-extraction" \
  -H "Content-Type: application/json" \
  -d '{
    "schema": {"title": "h1", "description": "p"}
  }'
```

用于使用新的schema重新执行数据提取，会直接覆盖原有的action记录和extraction文件。

## 基本语法

### 文本提取（默认行为）

```javascript
{
  "title": "h1",                    // 提取 h1 的文本内容
  "content": ".article-content",    // 提取 .article-content 的文本
  "price": ".price"                 // 提取 .price 的文本
}
```

### 属性提取

```javascript
{
  "image": "img@src",               // 提取 img 的 src 属性
  "link": "a@href",                 // 提取 a 的 href 属性
  "html": ".content@html",          // 提取 .content 的 HTML 内容
  "data": "div@data-id"             // 提取自定义 data 属性
}
```

## 数组/列表提取

### 简单数组

```javascript
{
  "links": ["a@href"],              // 提取所有 a 标签的 href
  "images": ["img@src"],            // 提取所有图片的 src
  "texts": ["p"]                    // 提取所有 p 标签的文本
}
```

### 对象数组

```javascript
{
  "articles": ["article", {
    "title": "h2",
    "author": ".author",
    "date": ".date",
    "link": "a@href"
  }]
}
```

### 嵌套数组

```javascript
{
  "categories": [".category", {
    "name": ".category-name",
    "posts": [".post", {
      "title": ".post-title",
      "content": ".post-content"
    }]
  }]
}
```

## 嵌套对象

```javascript
{
  "user": {
    "name": ".user-name",
    "profile": {
      "avatar": ".avatar@src",
      "bio": ".bio",
      "social": {
        "twitter": ".twitter@href",
        "github": ".github@href"
      }
    }
  }
}
```

## 过滤器

```javascript
{
  "title": "h1 | trim",             // 去除首尾空白
  "price": ".price | number",       // 转换为数字
  "content": ".content | slice:0,100" // 截取前100个字符
}
```

## 高级选择器

### CSS 选择器支持

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

## 实际示例

### 单页面提取

```javascript
{
  "name": "h1",
  "avatar": "div.profile img@src",
  "editor-content": "#editor .contenteditable@html",
  "views": ".views",
  "address": {
    "country": "div.profile .country",
    "city": "div.profile .address .city"
  }
}
```

**输出：**

```javascript
{
  "name": "DJH",
  "avatar": "https://t.co/img/abd.jpg",
  "editor-content": "<p>xxxxxxxxx</p>",
  "views": "193",
  "address": {
    "country": "China",
    "city": "Guangzhou"
  }
}
```

### 列表提取

```javascript
{
  "posts": ["article", {
    "title": ".title",
    "author": ".author",
    "content": ".content",
    "views": ".views"
  }]
}
```

**输出：**

```javascript
{
  "posts": [
    {"title": "...", "author": "...", "content": "...", "views": "..."},
    {"title": "...", "author": "...", "content": "...", "views": "..."},
    {"title": "...", "author": "...", "content": "...", "views": "..."}
  ]
}
```

### 复杂示例：电商产品页面

```javascript
{
  "product": {
    "name": "h1.product-title",
    "price": ".price-current",
    "originalPrice": ".price-original",
    "rating": ".rating@data-rating",
    "images": ["img.product-image@src"],
    "description": ".product-description@html",
    "specifications": [".spec-row", {
      "label": ".spec-label",
      "value": ".spec-value"
    }],
    "reviews": [".review", {
      "author": ".review-author",
      "rating": ".review-rating@data-rating",
      "content": ".review-content",
      "date": ".review-date"
    }]
  }
}
```
