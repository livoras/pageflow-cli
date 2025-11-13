# Action 参数表达式设计

## 概述

Action 字段支持参数表达式语法，允许在 replay 时动态替换字段值，无需额外的映射配置。

## 表达式语法

### 基本格式

```
$变量名.类型|默认值
```

或省略类型（默认为 string）：

```
$变量名|默认值
```

### 支持的类型

- `.str` 或 `.string` - 字符串类型（默认）
- `.number` 或 `.num` - 数字类型
- `.bool` 或 `.boolean` - 布尔类型

### 示例

```json
{
  "type": "navigate",
  "url": "@pageUrl|https://www.baidu.com",
  "description": "导航到 @siteName.str|百度"
}
```

```json
{
  "type": "act",
  "method": "input",
  "args": ["@keyword|狗粮"],
  "description": "输入搜索关键词"
}
```

```json
{
  "type": "act",
  "method": "scrollY",
  "args": ["@scrollPixels.number|800"],
  "description": "滚动页面"
}
```

```json
{
  "type": "wait",
  "timeout": "@waitTime.number|3000",
  "description": "等待 @waitTime.number|3000 毫秒"
}
```

## API 使用

### Replay 接口

```http
POST /api/recordings/:recordingId/replay
Content-Type: application/json

{
  "parameters": {
    "pageUrl": "https://example.com/page2",
    "keyword": "猫粮",
    "scrollPixels": 1200,
    "waitTime": 5000
  },
  "options": {
    "delay": 1000,
    "verbose": true
  }
}
```

### 参数解析规则

1. 如果 `parameters` 中存在对应变量，使用参数值
2. 否则使用表达式中的默认值
3. 根据类型标注自动转换类型：
   - `.number` / `.num` → `parseFloat()`
   - `.bool` / `.boolean` → 转换为布尔值
   - `.str` / `.string` 或无类型 → 字符串（默认）

## 支持的字段

以下 Action 字段支持参数表达式：

- `url`
- `description`
- `xpath`
- `encoded_id`
- `selector`
- `method`
- `pattern`
- `args` (数组中每个元素)
- `timeout`

## 使用场景

### 场景 1: 批量爬取不同页面

```bash
for page in 1 2 3 4 5; do
  curl -X POST http://localhost:3100/api/recordings/1/replay \
    -H "Content-Type: application/json" \
    -d "{
      \"parameters\": {
        \"page\": @page
      }
    }"
done
```

Action 配置：

```json
{
  "type": "navigate",
  "url": "@baseUrl|https://example.com/list?page=@page.number|1"
}
```

### 场景 2: 搜索不同关键词

```bash
keywords=("狗粮" "猫粮" "鸟粮")
for keyword in "${keywords[@]}"; do
  curl -X POST http://localhost:3100/api/recordings/1/replay \
    -H "Content-Type: application/json" \
    -d "{
      \"parameters\": {
        \"searchKeyword\": \"@keyword\"
      }
    }"
done
```

Action 配置：

```json
{
  "type": "act",
  "method": "input",
  "xpath": "//input[@name='q']",
  "args": ["@searchKeyword|默认关键词"]
}
```

### 场景 3: 测试环境切换

开发环境：

```json
{
  "parameters": {
    "apiHost": "http://localhost:3000"
  }
}
```

生产环境：

```json
{
  "parameters": {
    "apiHost": "https://api.example.com"
  }
}
```

Action 配置：

```json
{
  "type": "navigate",
  "url": "@apiHost|http://localhost:3000/api/data"
}
```

## 实现细节

### 参数解析函数

位置：`src/utils/ParameterResolver.ts`

核心函数：

- `resolveExpression(value, parameters)` - 解析单个表达式
- `resolveActionParameters(action, parameters)` - 解析 action 中的所有表达式
- `resolveActionsParameters(actions, parameters)` - 批量解析 actions

### Replay 流程

1. 接收 replay 请求（包含 `parameters`）
2. 在执行前调用 `resolveActionsParameters()` 解析所有表达式
3. 使用解析后的 actions 执行 replay

### 类型转换

```typescript
// 数字类型
"@age.number|18" + parameters: { age: "25" } → 25 (number)

// 布尔类型
"@enabled.bool|true" + parameters: { enabled: "false" } → false (boolean)

// 字符串类型（默认）
"@name|张三" + parameters: { name: "李四" } → "李四" (string)
```

## 向后兼容

- 不包含 `$` 的普通字段值不受影响
- 不传 `parameters` 参数时，所有表达式使用默认值
- 现有 actions 无需修改即可继续使用

## 优势

1. **简洁** - 无需额外的映射配置表
2. **直观** - 一眼就能看出哪些地方可参数化
3. **灵活** - 支持任意字段和嵌套（数组元素）
4. **安全** - 有默认值，不传参数也能正常运行
5. **类型安全** - 支持类型标注和自动转换
