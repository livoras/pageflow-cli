---
description: 智能 HTML 提取命令，根据上下文自动选择 getListHtml、getElementHtml 或 getListHtmlByParent
---

# 智能 HTML 提取命令

## 上下文分析

首先分析用户请求，确定最合适的提取方法：

**用户请求**: "$ARGUMENTS"

## 决策逻辑

根据请求内容，确定使用哪个 API：

1. **getListHtml** - 当请求包含以下关键词时使用：
   - "列表"、"所有"、"全部"、"多个"、"每个"、"list"、"all"、"multiple"
   - 需要提取多个相似元素
   - 选择器目标是多个元素（如 "所有 div.item"）

2. **getListHtmlByParent** - 当请求包含以下关键词时使用：
   - "父元素"、"子元素"、"直接子元素"、"容器下的"、"parent"、"children"
   - 需要提取特定容器下的元素
   - 要获取父元素的所有直接子元素

3. **getElementHtml** - 当请求包含以下关键词时使用：
   - "单个"、"第一个"、"一个"、"特定的"、"single"、"first"、"one"
   - 只需要一个元素
   - 选择器目标是唯一元素

## 执行步骤

1. **确定合适的 API** - 基于上述分析
2. **提取选择器** - 从请求中解析选择器
3. **调用 SimplePage API** - 使用确定的方法
4. **报告结果** - 显示文件路径和元素数量

## API 调用和参数

### 1. getListHtml - 提取多个元素

**接口地址**: `POST /api/pages/{pageId}/get-list-html`

**参数说明**:

- `selector` (必需): CSS 选择器或 XPath
- `description` (可选): 操作描述

**调用示例**:

```bash
# 提取所有商品项目
curl -X POST http://localhost:3100/api/pages/{pageId}/get-list-html \
  -H "Content-Type: application/json" \
  -d '{"selector": ".product-item", "description": "提取所有商品项目"}'

# 使用 XPath 提取
curl -X POST http://localhost:3100/api/pages/{pageId}/get-list-html \
  -H "Content-Type: application/json" \
  -d '{"selector": "//div[@class=\"tweet\"]", "description": "提取所有推文"}'
```

**响应格式**:

```json
{
  "success": true,
  "listFile": "1757825123456-list.json",
  "count": 15,
  "dataPath": "/tmp/simplepage/{pageId}/data/1757825123456-list.json"
}
```

### 2. getListHtmlByParent - 提取子元素

**接口地址**: `POST /api/pages/{pageId}/get-list-html-by-parent`

**参数说明**:

- `selector` (必需): 父元素选择器 (CSS 或 XPath)
- `description` (可选): 操作描述

**调用示例**:

```bash
# 提取时间线的所有直接子元素
curl -X POST http://localhost:3100/api/pages/{pageId}/get-list-html-by-parent \
  -H "Content-Type: application/json" \
  -d '{"selector": ".timeline-container", "description": "提取时间线子元素"}'

# 使用 XPath 提取子元素
curl -X POST http://localhost:3100/api/pages/{pageId}/get-list-html-by-parent \
  -H "Content-Type: application/json" \
  -d '{"selector": "/html/body/div/main", "description": "提取主要内容子元素"}'
```

**响应格式**:

```json
{
  "success": true,
  "listFile": "1757825123457-list.json",
  "count": 8,
  "dataPath": "/tmp/simplepage/{pageId}/data/1757825123457-list.json"
}
```

### 3. getElementHtml - 提取单个元素

**接口地址**: `POST /api/pages/{pageId}/get-element-html`

**参数说明**:

- `selector` (必需): 元素选择器 (CSS 或 XPath)
- `description` (可选): 操作描述

**调用示例**:

```bash
# 提取第一个文章
curl -X POST http://localhost:3100/api/pages/{pageId}/get-element-html \
  -H "Content-Type: application/json" \
  -d '{"selector": "article:first-child", "description": "提取第一个文章"}'

# 通过 ID 提取特定元素
curl -X POST http://localhost:3100/api/pages/{pageId}/get-element-html \
  -H "Content-Type: application/json" \
  -d '{"selector": "#main-content", "description": "提取主要内容区域"}'
```

**响应格式**:

```json
{
  "success": true,
  "elementFile": "1757825123458-element.html",
  "dataPath": "/tmp/simplepage/{pageId}/data/1757825123458-element.html"
}
```

## 选择器格式

### CSS 选择器:

- `.class-name` - 按类名选择
- `#element-id` - 按 ID 选择
- `div.item` - 带类名的元素
- `article:first-child` - 第一个文章
- `.container > .item` - 直接子元素

### XPath 选择器:

- `//div[@class="item"]` - 所有带 "item" 类名的 div
- `/html/body/div[1]` - body 中的第一个 div
- `//article[1]` - 第一个 article 元素
- `//div[contains(@class, "timeline")]` - 包含 "timeline" 类名的 div

## 输出格式

成功提取后，提供以下信息：

1. **选择的 API 和理由**
2. **提取结果** （文件路径、元素数量）
3. **后续建议** （如需要，使用 clean-html.ts 清理）

输出示例：

```
🎯 选择: getListHtml
理由: 请求中提到“所有项目”，表明需要多个元素

✅ 已提取 15 个元素到: /tmp/simplepage/{pageId}/data/{timestamp}-list.json
📁 文件大小: 89KB

💡 后续步骤:
- 使用 clean-html.ts 清理提取的内容
- 使用 extract-by-selector.ts 进行特定元素提取
```

## 错误处理

如果提取失败：

1. 检查页面是否存在并激活
2. 验证选择器语法 (XPath vs CSS)
3. 建议替代选择器
4. 提供调试信息

## 完整使用示例

### 示例 1: 提取所有项目

```bash
/extract-html 提取所有商品卡片从 .product-list
```

**命令将执行**:

```bash
curl -X POST http://localhost:3100/api/pages/{pageId}/get-list-html \
  -H "Content-Type: application/json" \
  -d '{"selector": ".product-list", "description": "提取所有商品卡片"}'
```

### 示例 2: 提取单个元素

```bash
/extract-html 提取第一个文章元素
```

**命令将执行**:

```bash
curl -X POST http://localhost:3100/api/pages/{pageId}/get-element-html \
  -H "Content-Type: application/json" \
  -d '{"selector": "article:first-child", "description": "提取第一个文章"}'
```

### 示例 3: 提取容器的子元素

```bash
/extract-html 获取主时间线容器的子元素
```

**命令将执行**:

```bash
curl -X POST http://localhost:3100/api/pages/{pageId}/get-list-html-by-parent \
  -H "Content-Type: application/json" \
  -d '{"selector": ".timeline-container", "description": "获取时间线子元素"}'
```

### 示例 4: 中文示例

```bash
/extract-html 提取所有的评论列表项
```

**命令将执行**:

```bash
curl -X POST http://localhost:3100/api/pages/{pageId}/get-list-html \
  -H "Content-Type: application/json" \
  -d '{"selector": ".comment-item", "description": "提取所有的评论列表项"}'
```

## 前置条件

1. **SimplePage 服务器必须运行**:

   ```bash
   PORT=3100 SCREENSHOT=true pnpm run server
   ```

2. **需要激活的页面**: 先使用 `/act-page` 命令创建并导航到页面

3. **获取当前 pageId**:
   ```bash
   curl http://localhost:3100/api/pages
   ```
