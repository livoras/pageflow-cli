# 数据提取 SOP

数据提取标准操作流程，确保从录制action中精确提取结构化数据。

## 流程步骤

### 1. 获取Action HTML数据路径并直接读取

```
GET /api/selected-action （获取选中action的完整信息）
使用 Read 工具直接读取HTML文件
```

- 调用 GET /api/selected-action 获取选中action的完整信息
- 从返回结果中获取 html_file_path 字段（完整文件路径）
- **重要**：使用 Read 工具直接读取HTML文件内容
- **禁止**：使用curl或其他方式通过API获取HTML内容

### 2. HTML结构分析

- 使用DOM解析器分析HTML结构
- 识别包含目标数据的关键元素
- 分析CSS选择器路径
- 理解数据层次关系和重复模式

### 3. 设计JSON数据结构

- 字段命名符合业务语义
- 数据类型准确（字符串/数组/对象）
- 层次结构清晰合理
- **等待用户明确确认后才继续**

### 4. 获取/创建Extraction Schema

```
GET /api/selected-extraction
POST /api/extractions (如果无选中)
PUT /api/extraction-selection (选中新模板)
```

- 确保有可用的extraction模板

### 5. 修改Schema并测试提取

```
PUT /api/extractions/{id}
POST /api/recordings/{recordingId}/actions/{actionIndex}/extract
```

- 遵循X-Ray提取语法规则
- CSS选择器精确定位
- 支持数组语法 `[selector, {...}]`
- 属性提取语法 `selector@attribute`

### 6. 迭代优化

重复步骤2-5直到满足：

- ✅ 100%字段覆盖率
- ✅ 数据质量无误
- ✅ JSON格式完全匹配
- ✅ 用户明确确认满意

## 核心原则

- 100%满足用户需求，不接受"差不多"
- 用户确认是关键环节
- 迭代优化直到完美
- 创建可重用的提取模板
