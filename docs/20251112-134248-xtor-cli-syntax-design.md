# xtor 命令行语法设计

## 设计原则

1. **保持 xtor 原语法风格** - `@` 提取属性，`{}` 构造对象
2. **简洁易记** - 常用操作用最短语法
3. **兼容管道** - 可以和其他命令组合使用
4. **支持渐进复杂度** - 简单查询简单写，复杂查询也支持

## 基础语法

### 1. 提取文本和属性

```bash
# 提取单个元素文本
echo $html | xtor 'h1'
echo $html | xtor '.title'

# 提取属性
echo $html | xtor 'img@src'
echo $html | xtor 'a@href'
echo $html | xtor 'div@data-id'

# 提取多个（数组）
echo $html | xtor 'a@href[]'           # 所有链接
echo $html | xtor '.product[]'         # 所有产品文本
```

### 2. 对象提取

```bash
# 单个对象
echo $html | xtor '.product{name:h3,price:.price}'

# 对象数组（核心功能）
echo $html | xtor '.product[]{name:h3,price:.price,img:img@src}'

# 多选择器备选（用逗号）
echo $html | xtor '.new-price,.old-price,.price'
```

### 3. 嵌套选择（管道）

```bash
# 先选容器，再提取内容
echo $html | xtor '.container | .item[]{title:h3,link:a@href}'

# 多级嵌套
echo $html | xtor '.page | .list | .item[]{name:""}'
```

### 4. 输出格式控制

```bash
# 默认 JSON 输出
echo $html | xtor '.product{name:h3}'

# 纯文本（去引号）
echo $html | xtor 'h1' --text
echo $html | xtor 'h1' -t

# 压缩 JSON
echo $html | xtor '.product[]{}' --compact
echo $html | xtor '.product[]{}' -c

# 只输出第一个
echo $html | xtor '.product[]' --first
```

## 完整示例

### 例1：提取百度搜索结果

```bash
# 当前 JSON 配置
{
  "schema": [".result", {"title": "h3 a", "url": "h3 a@href"}],
  "strategy": {"merge": "concat", "unique": "url"}
}

# 转为命令行语法
curl "baidu.com/s?wd=test" | xtor '.result[]{title:h3 a,url:h3 a@href}' --unique url
```

### 例2：组合 jq 使用

```bash
# 提取后用 jq 处理
curl example.com | xtor '.product[]{name:h3,price:.price}' | jq '.[].name'

# 只要价格
curl example.com | xtor '.price' --text
```

### 例3：多选择器备选

```bash
# 尝试多个选择器（从左到右）
curl example.com | xtor '.summary-text,.c-abstract,[data-module=abstract]'
```

## 高级功能

### Loop 策略参数

```bash
# 合并策略
xtor '.item[]{}' --merge concat    # 默认
xtor '.item[]{}' --merge collect
xtor '.item[]{}' --merge merge

# 去重
xtor '.item[]{}' --unique id
xtor '.item[]{}' --unique id,type  # 多字段
xtor '.item[]{}' --unique id --keep last

# 组合
xtor '.product[]{id:@data-id,name:h3}' --unique id --merge concat
```

### 文件输入

```bash
# 从文件读取
xtor '.product[]{}' < page.html

# 从 URL（需要 curl）
curl example.com | xtor 'h1'

# 保存为模板
xtor '.product[]{name:h3,price:.price}' --save my-template.json
```

## 语法快速参考

### 选择器

```
h1, .class, #id              # CSS 选择器
@attr                        # 提取属性
[]                           # 数组（所有匹配）
{}                           # 对象（字段映射）
,                            # 多选择器（备选）
|                            # 管道（嵌套选择）
```

### 对象语法

```
{key:selector}               # 单字段
{k1:s1,k2:s2}               # 多字段
{text:""}                    # 当前元素文本
```

### 数组对象

```
.item[]{key:selector}        # 提取数组，每个元素是对象
```

### 命令行参数

```
--text, -t                   # 纯文本输出
--compact, -c                # 压缩 JSON
--first, -f                  # 只要第一个
--unique <field>             # 去重
--merge <strategy>           # 合并策略
--save <file>                # 保存为模板
```

## 与现有工具对比

```bash
# pup
curl example.com | pup 'a attr{href}'

# xtor（更强大的对象提取）
curl example.com | xtor 'a[]{text:"",href:@href,title:@title}'

# jq（JSON 处理）
echo '{"title":"test"}' | jq '.title'

# xtor（HTML 处理）
echo '<h1>test</h1>' | xtor 'h1'

# 组合使用
curl example.com | xtor '.product[]{name:h3,price:.price}' | jq '.[].name'
```

## 实现方案

在 `bin/` 目录创建 `xtor-cli.ts`：

```typescript
#!/usr/bin/env node
import { Extractor } from 'xtor';
import { parseCliSyntax } from './xtor-parser';

// 解析命令行语法为 xtor schema
function parseCliSyntax(syntax: string) {
  // '.product[]{name:h3,price:.price}'
  // => ['.product', {name: 'h3', price: '.price'}]
}

// 读取 stdin
let html = '';
process.stdin.on('data', chunk => html += chunk);
process.stdin.on('end', () => {
  const schema = parseCliSyntax(process.argv[2]);
  const extractor = new Extractor(schema);
  const result = extractor.extract(html);
  console.log(JSON.stringify(result, null, 2));
});
```

## 核心优势

1. 保持了 xtor 的核心语法（`@`、`{}`）
2. 比 JSON 配置更简洁
3. 可以和 curl、jq 等工具无缝组合
4. 支持渐进学习（简单到复杂）
