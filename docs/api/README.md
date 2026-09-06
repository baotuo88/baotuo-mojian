# API 文档

宝拓墨间 API 文档 - 提供完整的 REST API 接口说明。

## 基础信息

- **Base URL**: `http://localhost:3000/api`
- **API Version**: v1
- **认证方式**: 暂未实现（计划中）
- **Content-Type**: `application/json`

## 通用响应格式

### 成功响应

```json
{
  "success": true,
  "data": {
    // 响应数据
  }
}
```

### 错误响应

```json
{
  "success": false,
  "error": "错误信息",
  "message": "详细错误描述（可选）"
}
```

## 健康检查

### GET /api/health/live

检查服务器是否运行。

**响应示例**

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "timestamp": "2026-09-05T10:30:00Z"
  }
}
```

## 小说管理

### POST /api/novels

创建新小说。

**请求体**

```json
{
  "title": "我的小说",
  "storyInput": "一个关于...",
  "storyMode": "urban_fantasy",
  "model": {
    "provider": "openai",
    "model": "gpt-4-turbo-preview",
    "temperature": 0.7
  }
}
```

**响应示例**

```json
{
  "success": true,
  "data": {
    "id": "cm123abc456",
    "title": "我的小说",
    "state": "draft",
    "createdAt": "2026-09-05T10:30:00Z"
  }
}
```

### GET /api/novels

获取小说列表。

**查询参数**

- `state` (可选): 过滤状态 - `draft`, `planning`, `writing`, `completed`
- `limit` (可选): 返回数量，默认 20
- `offset` (可选): 偏移量，默认 0

**响应示例**

```json
{
  "success": true,
  "data": {
    "novels": [
      {
        "id": "cm123abc456",
        "title": "我的小说",
        "state": "planning",
        "createdAt": "2026-09-05T10:30:00Z"
      }
    ],
    "total": 1
  }
}
```

### GET /api/novels/:id

获取单个小说详情。

**路径参数**

- `id`: 小说 ID

**响应示例**

```json
{
  "success": true,
  "data": {
    "id": "cm123abc456",
    "title": "我的小说",
    "state": "writing",
    "expansion": {
      "expanded_premise": "扩展的故事前提...",
      "protagonist_core": "主角核心...",
      "conflict_engine": "冲突引擎..."
    },
    "volumes": [
      {
        "id": "vol1",
        "title": "第一卷",
        "chapters": []
      }
    ],
    "createdAt": "2026-09-05T10:30:00Z",
    "updatedAt": "2026-09-05T11:00:00Z"
  }
}
```

### PATCH /api/novels/:id

更新小说信息。

**路径参数**

- `id`: 小说 ID

**请求体**

```json
{
  "title": "更新后的标题",
  "lockedFields": ["protagonist_core"]
}
```

**响应示例**

```json
{
  "success": true,
  "data": {
    "id": "cm123abc456",
    "title": "更新后的标题",
    "updatedAt": "2026-09-05T11:30:00Z"
  }
}
```

### DELETE /api/novels/:id

删除小说。

**路径参数**

- `id`: 小说 ID

**响应示例**

```json
{
  "success": true,
  "data": null
}
```

## 自动导演

### POST /api/novels/director/auto-run

启动自动导演。

**请求体**

```json
{
  "novelId": "cm123abc456",
  "targetPhase": "volumes",
  "approvalPolicy": "auto"
}
```

**响应示例**

```json
{
  "success": true,
  "data": {
    "runId": "run_abc123",
    "status": "running",
    "currentPhase": "planning"
  }
}
```

### GET /api/novels/director/status/:novelId

查询自动导演状态。

**路径参数**

- `novelId`: 小说 ID

**响应示例**

```json
{
  "success": true,
  "data": {
    "status": "running",
    "currentPhase": "volumes",
    "progress": 0.6,
    "events": [
      {
        "type": "phase_started",
        "phase": "volumes",
        "timestamp": "2026-09-05T11:00:00Z"
      }
    ]
  }
}
```

## 角色管理

### GET /api/base-characters

获取角色库列表。

**响应示例**

```json
{
  "success": true,
  "data": {
    "characters": [
      {
        "id": "char_123",
        "name": "张三",
        "archetype": "hero",
        "personality": "勇敢、正直",
        "createdAt": "2026-09-05T10:00:00Z"
      }
    ]
  }
}
```

### POST /api/base-characters

创建新角色。

**请求体**

```json
{
  "name": "李四",
  "archetype": "mentor",
  "personality": "睿智、神秘",
  "backstory": "曾经的传奇人物..."
}
```

## 写法引擎

### POST /api/writing-formula/extract

提取写作风格。

**请求体**

```json
{
  "sampleText": "示例文本...",
  "name": "我的写作风格"
}
```

**响应示例**

```json
{
  "success": true,
  "data": {
    "id": "formula_123",
    "name": "我的写作风格",
    "patterns": {
      "sentence_structure": "...",
      "vocabulary": "...",
      "narrative_voice": "..."
    }
  }
}
```

### GET /api/writing-formula

获取写法列表。

### POST /api/novels/:novelId/bind-formula

绑定写法到小说。

**请求体**

```json
{
  "formulaId": "formula_123"
}
```

## RAG 知识库

### POST /api/knowledge/documents

上传知识文档。

**请求体** (multipart/form-data)

- `file`: 文档文件
- `name`: 文档名称
- `type`: 文档类型 - `world`, `character`, `reference`

**响应示例**

```json
{
  "success": true,
  "data": {
    "id": "doc_123",
    "name": "世界观设定",
    "status": "processing"
  }
}
```

### GET /api/knowledge/documents

获取知识文档列表。

### POST /api/knowledge/search

搜索知识库。

**请求体**

```json
{
  "query": "魔法系统",
  "topK": 5
}
```

**响应示例**

```json
{
  "success": true,
  "data": {
    "results": [
      {
        "content": "魔法系统设定...",
        "score": 0.92,
        "documentId": "doc_123"
      }
    ]
  }
}
```

## LLM 管理

### GET /api/llm/providers

获取可用的 LLM 提供商列表。

**响应示例**

```json
{
  "success": true,
  "data": {
    "providers": [
      {
        "id": "openai",
        "name": "OpenAI",
        "available": true,
        "models": [
          {
            "id": "gpt-4-turbo-preview",
            "name": "GPT-4 Turbo",
            "maxTokens": 128000
          }
        ]
      }
    ]
  }
}
```

### POST /api/llm/test

测试 LLM 连接。

**请求体**

```json
{
  "provider": "openai",
  "model": "gpt-4-turbo-preview",
  "apiKey": "sk-..."
}
```

**响应示例**

```json
{
  "success": true,
  "data": {
    "connected": true,
    "latency": 234
  }
}
```

## 图像生成

### POST /api/images/generate

生成图像。

**请求体**

```json
{
  "prompt": "一个古风少年，穿着白色长袍...",
  "provider": "dall-e-3",
  "size": "1024x1024"
}
```

**响应示例**

```json
{
  "success": true,
  "data": {
    "id": "img_123",
    "url": "/api/images/img_123.png",
    "status": "completed"
  }
}
```

## 导出功能

### POST /api/novels/:novelId/export

导出小说。

**请求体**

```json
{
  "format": "txt",
  "includeMetadata": true,
  "chapterIds": ["ch1", "ch2"]
}
```

**响应示例**

```json
{
  "success": true,
  "data": {
    "downloadUrl": "/exports/novel_123.txt",
    "expiresAt": "2026-09-06T10:00:00Z"
  }
}
```

## 错误码

| 状态码 | 说明 |
|--------|------|
| 200 | 成功 |
| 400 | 请求参数错误 |
| 401 | 未认证（计划中）|
| 403 | 无权限（计划中）|
| 404 | 资源不存在 |
| 413 | 请求体过大 |
| 500 | 服务器内部错误 |
| 502 | 上游服务连接失败（LLM 提供商）|

## 速率限制

当前版本暂未实施速率限制。未来版本将添加：

- 每分钟请求限制
- 每日 LLM 调用限制
- 基于用户的配额管理

## Webhooks（计划中）

未来版本将支持 Webhook 回调：

- 小说状态变更
- 章节生成完成
- 自动导演完成
- 错误通知

## SDK（计划中）

未来将提供官方 SDK：

- TypeScript/JavaScript
- Python
- Go

## 示例代码

### JavaScript/TypeScript

```typescript
const API_BASE = 'http://localhost:3000/api';

async function createNovel(data: CreateNovelInput) {
  const response = await fetch(`${API_BASE}/novels`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  
  const result = await response.json();
  return result.data;
}
```

### Python

```python
import requests

API_BASE = 'http://localhost:3000/api'

def create_novel(data):
    response = requests.post(
        f'{API_BASE}/novels',
        json=data
    )
    response.raise_for_status()
    return response.json()['data']
```

## 更新日志

- **2026-09-05**: 初始 API 文档
- 更多历史记录请参考 [CHANGELOG.md](../CHANGELOG.md)

## 反馈

如发现 API 文档错误或有改进建议，请[提交 Issue](https://github.com/your-org/baotuo-mojian/issues)。
