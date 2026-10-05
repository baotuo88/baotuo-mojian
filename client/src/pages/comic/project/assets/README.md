# 漫画图片展示状态

本模块负责读取服务端图片结果，不执行模型调用或判定服务端租约。外部页面通过 `index.ts` 使用投影。

- `panelImageProjection` 处理分格图片，用于画面列表、首话引导和导出完整性判断。
- `referenceImageProjection` 处理角色设计稿、表情稿、角色资产和场景设定图。`status=done` 或直接 `previousImage.status=done` 才是可用图片；重试状态及错误单独呈现。
- 已保存的 `generating` 可能来自关闭页面或服务重启，不能作为浏览器按钮的永久互斥锁。按钮仅依据当前页确认流程的 `loading/submitting` 和上传操作禁用，恢复入口继续进入既有生图确认弹窗。
- 图片 URL 绑定已确认版本的 `revision`，避免新请求完成后旧画面区域指向另一版图片。不能拿正在生成的 revision 覆盖已确认版本。

代码行为回归：`referenceImageRecovery.test.mjs`。涉及漫画图片恢复、导出错误和来源准备入口；不运行浏览器验收。
