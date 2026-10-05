# 图片传输适配器

`GeneratedImageDownload` 负责外部结果的受限下载、执行取消、临时文件和原子落盘；不负责业务状态或图片版本发布。调用方使用 `infrastructure/index.ts` 门面；旧 `runtime` 导出保持兼容。

默认下载最多 32 MiB、90 秒。调用方可以收紧大小限制并提供请求信号。失败只清理本次创建的临时文件，不覆盖既有目标；上传参考图的临时目录由 provider 创建和清理。

长期合同见 `docs/wiki/workflows/image-transfer-boundaries.md`。
