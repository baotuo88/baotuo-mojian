# 媒体通道模块（modules/media）

## 职责

把短剧/漫画/漫剧需要的配音（tts）、视频（video）、配乐（music）能力统一抽象成「可配置通道」：
一家供应商一条 `MediaProvider` 记录，业务侧只传 `provider` 标识，不感知供应商协议细节。

## 边界

- 本模块负责：通道配置的读取与校验、协议到端口的装配、运行期注册表、媒体资产落盘与读取。
- 本模块不负责：短剧/漫画的业务编排与状态机。业务侧只通过注册表解析端口。
- 依赖方向：`services/drama`、`modules/comic` 等业务模块可以依赖本模块；本模块不得反向依赖业务模块。

## 文件结构

```
domain/
  mediaProviderContracts.ts   # kind/protocol 白名单、options 归一化、密钥脱敏、HTTP 校验 schema
  providerPorts.ts            # TTS/Video/Music 端口定义（含请求/响应类型）
application/
  MediaProviderService.ts     # CRUD + 注册表同步 + 数据库记录到端口的装配
infrastructure/
  mediaProviderRegistry.ts    # 三个注册表，区分 env/database 来源
  envMediaProviders.ts        # 环境变量预置通道（mock / DRAMA_*_HTTP_*）
  httpJsonProviders.ts        # 自定义 JSON 端点适配（含 payload 模板与响应字段路径）
  openAiProviders.ts          # OpenAI 兼容语音合成 / 视频任务适配
  mediaHttp.ts                # 请求头、超时、路径读取、状态归一化、模板渲染
  mediaAssetStore.ts          # 二进制音频落盘与路径校验
http/
  mediaProviderRoutes.ts      # /api/media/providers CRUD
  mediaAssetRoutes.ts         # /api/media/assets/:kind/:fileName
```

## 关键规则

1. `kind` 取值 `tts | video | music`，协议白名单按 kind 校验（见 `domain/mediaProviderContracts.ts`）。
2. `providerKey` 在同一 `kind` 内唯一，且不得与环境变量预置通道同名；同名时环境变量优先并告警。
3. `apiKey` 只允许服务端读取，接口返回一律脱敏（`maskApiKey`），只暴露 `hasApiKey` 与掩码。
4. 注册表区分 `env` 与 `database` 两种来源，同步数据库通道时只替换 `database` 来源，环境变量通道始终保留。
5. `options.payload` 模板与 `taskIdPath/statusValuePath/resultUrlPath/statusMap` 用于适配异构供应商报文，
   属于对已确定配置的确定性渲染，不是关键词路由。
6. 二进制音频写入 `server/storage/generated-media/<kind>/`，文件名由后端生成，读取时做严格白名单校验。

## 扩展新协议

1. 在 `mediaProviderContracts.ts` 增加协议常量并登记到 `MEDIA_PROTOCOLS_BY_KIND`。
2. 在 `infrastructure/` 新增适配器实现对应端口。
3. 在 `MediaProviderService.buildMediaProviderPorts` 中按 `kind + protocol` 装配。
4. 补服务级测试：模板渲染、响应解析、注册表同步、密钥脱敏。

## 已知边界

- 配乐通道目前只提供配置与解析能力，短剧/漫画的 BGM 消费链路尚未接入。
- 图像生成仍走既有的模型厂商图像配置，不在本模块重复建设。
