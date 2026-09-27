# 媒体通道（配音 / 视频 / 配乐）边界

## Background

短剧与漫画产线需要配音、视频、配乐三类音视频能力。此前只有两类实现：

- 代码内置的 `mock` 通道，用于联调；
- 由环境变量 `DRAMA_TTS_HTTP_*` / `DRAMA_VIDEO_HTTP_*` 预置的单一 HTTP 通道。

这种方式在真实生产里有两个问题。第一，用户无法在设置里配置多家供应商，想同时保留「便宜的中转站」和「质量更好的直连」只能改环境变量并重启。第二，供应商差异（OpenAI 兼容语音合成返回二进制、视频任务返回异步 taskId、部分中转站返回嵌套 JSON）会渗进短剧业务代码，换一家供应商就要改核心产线。

## Decision

引入媒体通道数据模型与 `server/src/modules/media` 平台模块：

- 一家供应商一条 `MediaProvider` 记录，持久化在数据库，可在设置页增删改停用；
- 运行期通过注册表把记录装配成端口，业务侧只传 `provider` 标识；
- 协议差异只在 `modules/media` 内部收口，业务模块不写供应商分支。

这样做的理由是：供应商是易变的外部依赖，应当是可配置数据而不是代码分支；短剧、漫画、漫剧三条产线共享同一套通道，避免每个模块各自实现一遍「哪家供应商」。

## Current Rule

- `kind` 取值为 `tts | video | music`；协议白名单按 kind 校验：配音支持 `openai_speech` 与 `http_json`，视频支持 `openai_video` 与 `http_json`，配乐支持 `http_json`。
- `providerKey` 在同一 kind 内唯一，用于业务侧引用；它不得与环境变量预置通道同名。同名时保留环境变量通道并打印告警，避免运行环境的固定配置被设置页静默改写。
- 注册表区分 `env` 与 `database` 两种来源。同步数据库通道时只替换 `database` 来源的条目，环境变量通道始终保留。
- `apiKey` 只允许服务端读取。接口返回一律脱敏（`maskApiKey`），只暴露 `hasApiKey` 布尔值与首尾掩码，不得返回明文。
- 异构报文通过 `options` 适配，而不是靠新增代码分支：
  - `payload`：请求体模板，字符串里的 `${字段}` 会用本次请求字段替换，单独成段的 `${refImages}` 替换成数组本身；
  - `taskIdPath` / `statusValuePath` / `resultUrlPath`：从上游响应取值，支持 `a.b.0.c`；
  - `statusMap`：把上游状态词映射到 `queued/running/succeeded/failed`；
  - `synthesizePath` / `createPath` / `statusPath` / `speechPath`：拼接在 `baseURL` 之后的路径，`statusPath` 支持 `{taskId}`。
  这些是对已确定配置的确定性渲染，属于平台配置能力，不是关键词路由。
- 二进制音频（如 OpenAI 兼容 `/audio/speech` 返回的 mp3）由后端写入 `server/storage/generated-media/<kind>/`，对外通过 `GET /api/media/assets/:kind/:fileName` 读取；文件名由后端生成，读取时做白名单校验，禁止路径穿越。
- 短剧侧的既有出口 `services/drama/audio/TTSProviderPort.ts`、`services/drama/video/VideoProviderPort.ts` 保留为兼容出口，继续导出同一份注册表实例，因此短剧编排、配音服务、视频提示词服务不需要改调用方式。

## Examples

- 接入 OpenAI 兼容中转站（NewAPI / One-API）：`kind=tts`、`protocol=openai_speech`、`baseURL=https://newapi.example.com/v1`、`model=tts-1`，密钥填在通道里；业务侧选该通道即可配音。
- 接入 Seedance 风格视频接口：`kind=video`、`protocol=http_json`、`createPath=/tasks`、`statusPath=/tasks/{taskId}`，并用 `payload` 描述 `content/images/ratio` 报文，用 `taskIdPath`、`statusValuePath`、`resultUrlPath` 描述响应。
- 临时停用某个通道：把 `isActive` 置为 false，记录保留但不再注册；系统内置通道只能停用不能删除。

## Failure Modes

- 业务代码绕过注册表直接读数据库通道配置：供应商替换会重新污染核心产线。
- 在短剧或漫画服务里写供应商判断分支：新增供应商需要改多处，违背本边界。
- 接口返回未脱敏的 `apiKey`：密钥泄漏。返回体必须只包含掩码。
- 数据库通道覆盖同名环境变量通道：运维固定配置被静默改写。当前行为是忽略数据库通道并告警。
- 用上游返回值拼接落盘文件名：路径穿越风险。文件名必须由后端生成。

## Related Modules

- `server/src/modules/media/README.md`
- `server/src/modules/media/domain/mediaProviderContracts.ts`
- `server/src/modules/media/application/MediaProviderService.ts`
- `server/src/modules/media/infrastructure/*`
- `server/src/modules/media/http/mediaProviderRoutes.ts`
- `server/src/services/drama/audio/TTSProviderPort.ts`
- `server/src/services/drama/video/VideoProviderPort.ts`
- `client/src/pages/settings/views/MediaChannelsSettingsPage.tsx`

## Source Documents

- `docs/plans/drama-production-pipeline-v3.md`
- `docs/wiki/architecture/drama-forge-module-boundary.md`
- `docs/wiki/architecture/image-generation-providers.md`
