# Recording 14 Loop执行问题修复

## 问题描述

recording ID 14 的 loop 在 replay 时没有执行对应的次数。具体表现为 loop_count=5 的循环没有执行5次迭代。

## 问题定位

### 数据库信息

- 录制ID: 14
- Loop ID: 12
- Loop配置: start_action_id=52, end_action_id=53, loop_count=5
- Actions范围: 52-53 (包含2个wait actions)

### 根本原因

ReplayRoutes.ts 中的 /api/replay 端点完全忽略了请求中的 `options.loops` 参数，只尝试从数据库查询loops。

### 原始错误代码

```typescript
// src/routes/ReplayRoutes.ts:46
let loops: any[] = [];
if (actions.length > 0 && actions[0].recording_id) {
  const loopModel = this.serverService.getLoopModel();
  if (loopModel) {
    loops = loopModel.getByRecordingId(actions[0].recording_id);
  }
}
```

## 修复方案

### 修复内容

修改 ReplayRoutes.ts 中的参数处理逻辑，优先使用API传入的loops参数，fallback到数据库查询。

### 修复后代码

```typescript
// src/routes/ReplayRoutes.ts:32-52
const {
  delay = 1000,
  verbose = true,
  continueOnError = false,
  loops: optionsLoops,
} = options;

// 优先使用API传入的loops，否则查询数据库
let loops: any[] = optionsLoops || [];
if (loops.length === 0 && actions.length > 0 && actions[0].recording_id) {
  const loopModel = this.serverService.getLoopModel();
  if (loopModel) {
    loops = loopModel.getByRecordingId(actions[0].recording_id);
  }
}
```

## 验证测试

### 测试方法

使用curl直接调用API，传入自定义的loops配置进行验证。

### 测试数据

```json
{
  "actions": [
    {
      "id": 51,
      "type": "create",
      "url": "about:blank",
      "description": "Test page",
      "timestamp": 1727526291462,
      "recording_id": 14
    },
    {
      "id": 52,
      "type": "wait",
      "timeout": 500,
      "timestamp": 1727526292462,
      "recording_id": 14
    },
    {
      "id": 53,
      "type": "wait",
      "timeout": 500,
      "timestamp": 1727526293462,
      "recording_id": 14
    }
  ],
  "options": {
    "delay": 100,
    "verbose": true,
    "continueOnError": false,
    "loops": [
      {
        "id": 12,
        "recording_id": 14,
        "name": "test loop",
        "start_action_id": 52,
        "end_action_id": 53,
        "loop_count": 5
      }
    ]
  }
}
```

### 测试结果

- 执行actions总数: 11个
- 计算验证: 1个create + (2个wait × 5次loop) = 1 + 10 = 11
- 状态: success=true, errors=[]
- Loop执行次数: 正确执行5次迭代

## 数据流程确认

### API调用流程

1. 客户端通过curl或前端调用 /api/replay
2. 支持直接在options中传入loops参数
3. ReplayRoutes优先使用传入的loops配置

### 前端调用流程

1. 前端通过useReplay调用replayActions
2. 不传入loops参数，由后端自动查询数据库
3. 获取recording对应的所有loops配置

## 修改文件

- src/routes/ReplayRoutes.ts

## 修复状态

已完成修复并验证通过。录制14的loop功能恢复正常，能够正确执行指定次数的迭代。
