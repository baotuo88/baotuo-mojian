# Prompt 流生命周期

`PromptStreamLifecycle`
拥有请求取消、分片收集和完成结果的一致性；业务 Prompt 仍由 Registry 声明。

- 请求信号合并 HTTP 或后台执行作用域信号。租约失效、用户取消与连接关闭都应终止读取，且不得触发 JSON 修复或语义重试。
- `stream` 消费结束才允许 `complete` 返回成功。部分文本只是预览，不能在
  `complete` 失败后用预览正文代替成功结果。
- 消费者提前退出时取消底层请求；未消费的 `complete`
  拒绝有观察器，显式 await 仍得到原始错误。
- 停滞计时只覆盖等待下一分片，不覆盖消费者处理时间。异步生成器的 `return()`
  可能排在挂起的 `next()` 后面，清理不能成为错误返回的前提。

维护规则见
[流式取消与正文提交](../../../../../docs/wiki/workflows/stream-cancellation-and-manuscript-commit.md)。
