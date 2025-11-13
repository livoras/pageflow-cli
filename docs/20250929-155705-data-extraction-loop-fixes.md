# 数据提取和循环执行功能修复记录

## 问题概述

在测试数据提取功能时发现多个问题，包括API设计、提取模板语法、数据结构设计和UI组件兼容性问题。

## 修复详情

### 1. API设计问题

**问题：** `/api/extractions/extract-data` 端点只接受字符串格式的schema参数，不支持直接传递JSON对象。

**修复方案：** 修改API以支持两种格式的向后兼容性。

**文件：** `/src/routes/RecordingRoutes.ts` (lines 218-260)

**代码变更：**

```typescript
// 修改前：只接受字符串格式
const schema = JSON.parse(req.body.schema);

// 修改后：支持JSON对象和字符串格式
let schema: any;
if (typeof req.body.schema === "string") {
  try {
    schema = JSON.parse(req.body.schema);
  } catch (error) {
    return res.status(400).json({ error: "Invalid schema JSON format" });
  }
} else if (typeof req.body.schema === "object" && req.body.schema !== null) {
  schema = req.body.schema;
} else {
  return res
    .status(400)
    .json({ error: "schema is required and must be a JSON object or string" });
}
```

### 2. 提取模板语法问题

**问题：** 提取模板使用XPath语法而非X-Ray CSS选择器语法，导致提取失败。

**修复方案：** 完全重写提取模板使用正确的X-Ray语法。

**原始模板（错误）：**

```json
{
  "items": "//li[@class='job-tile']",
  "title": ".//h3/a/text()",
  "company": ".//span[@class='companyName']/text()",
  "location": ".//div[@data-testid='job-location']/text()"
}
```

**修复后模板：**

```json
{
  "items": "li.job-tile",
  "title": "h3 a | text",
  "company": "span.companyName | text",
  "location": "div[data-testid='job-location'] | text"
}
```

### 3. 数据结构设计问题

**问题：** 循环执行时提取结果会相互覆盖，无法保存所有迭代的数据。

**修复方案：** 实现TypeScript判别联合类型，区分单次执行和循环执行的结果。

**文件：**

- `/src/replay.ts`
- `/simple-page-viewer/src/hooks/useReplay.ts`
- `/simple-page-viewer/src/components/ActionCard/index.tsx`

**数据结构设计：**

```typescript
interface SingleExtraction {
  type: "single";
  results: Record<string, any>; // extractId -> extractionData
}

interface LoopExtraction {
  type: "loop";
  iterations: Array<{
    iteration: number;
    results: Record<string, any>; // extractId -> extractionData
  }>;
}

type ExtractionStore = Record<number, SingleExtraction | LoopExtraction>;
```

**执行逻辑变更：**

- 单次执行：立即广播 `replay-extractions-complete` 事件
- 循环执行：收集所有迭代结果，循环完成后统一广播 `replay-loop-extractions-complete` 事件

### 4. UI组件兼容性问题

**问题：** ActionCard组件无法识别新的数据结构，导致循环提取结果的查看按钮不显示。

**修复方案：** 更新组件类型定义和显示逻辑。

**文件：** `/simple-page-viewer/src/components/ActionCard/index.tsx`

**关键变更：**

```typescript
// 类型定义更新
interface SingleExtraction {
  type: "single";
  results: Record<string, any>;
}

interface LoopExtraction {
  type: "loop";
  iterations: Array<{
    iteration: number;
    results: Record<string, any>;
  }>;
}

// 显示逻辑更新
if (replayExtractionResult?.type === "loop") {
  const allResults = replayExtractionResult.iterations
    .map(function (iter) {
      return iter.results[extraction.id.toString()];
    })
    .filter(Boolean);
  onViewExtractionResult(allResults, extractionData.schema);
} else {
  onViewExtractionResult(extractionData.result, extractionData.schema);
}
```

### 5. 语法错误修复

**问题：** "Unterminated regexp literal" 编译错误。

**修复方案：** 在map函数调用末尾添加缺失的闭合括号。

**文件：** `/simple-page-viewer/src/components/ActionCard/index.tsx` (line 440)

**修复：**

```typescript
// 修复前
});

// 修复后
})}
```

## 功能验证

修复完成后，系统支持：

1. API接受JSON对象和字符串格式的schema参数
2. 使用正确X-Ray CSS选择器语法的提取模板
3. 单次执行显示即时结果，循环执行显示聚合结果
4. UI组件正确识别和显示两种类型的提取结果
5. 前端编译无语法错误

## 涉及文件

- `/src/routes/RecordingRoutes.ts` - API端点修复
- `/src/replay.ts` - 循环执行逻辑
- `/simple-page-viewer/src/hooks/useReplay.ts` - 前端状态管理
- `/simple-page-viewer/src/components/ActionCard/index.tsx` - UI组件显示
