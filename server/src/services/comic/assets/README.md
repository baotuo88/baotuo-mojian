# 漫画图片版本与发布

本模块拥有漫画格子的图片来源身份、原图/植字文件解析和生图发布事务边界。业务服务经 `index.ts` 使用能力；不要自行扫描图片目录或按固定 `lettered.png` 读取成品。

- `PanelArtifactSource`：根据 panel 的结构化输入与 `imageData`/`letteredData` 判断可使用版本，并解析到只读文件。
- `PanelImagePublication`：适配通用 image runtime，为每次生成分配唯一 revision；原始分镜字段和 `imageData` 必须通过数据库条件更新，才能发布该文件。
- 通用 image runtime 负责模型调用与文件下载，本模块负责漫画领域的发布条件，不修改其他图像业务的状态合同。

失败或取消可能留下未被数据库引用的候选文件。这些文件不是已发布图片，不可被 HTTP 或导出目录扫描发现。不要在生成收尾删除旧 revision：规划备份、既有导出或并发读者可能仍引用它们，清理应由具备引用检查和备份策略的独立流程负责。

详细规则见 [漫画图片版本与整话导出](../../../../../docs/wiki/workflows/comic-image-export-consistency.md)。

## 参考素材的发布边界

`ReferenceImagePublication` 管理三视图、表情、角色资产和场景图的 immutable revision 文件、解码验证、历史来源与上传发布；`ReferenceImageTargets` 持有对应业务表的 CAS。外部服务只从本目录 `index.ts` 使用这些能力。

- 模型结果和上传文件都必须先写独立 revision，再校验解码，最后 CAS 提交 metadata。禁止覆盖固定文件名或清理旧扩展名。
- CAS 同时校验生成前的设计字段、项目画风和状态 JSON；表情更新必须比较整个 `sheetData`，不能读最新 JSON 后无条件合并。
- 生成和上传失败保留前一张确认图片。素材设计字段变更后，普通图片读取会拒绝来源不一致的图片。
- 三视图成功换版清除旧表情；裁剪文件以源图路径摘要隔离，并以临时文件原子发布，避免旧裁剪或半成品被参考生成读取。
- 图片 URL 的 `revision` 必须从当前 metadata 或最近 5 个历史版本中解析，未登记 revision 不可下载。显式历史版本按其原始输入显示；省略 revision 才执行当前设计来源校验。
- 旧固定文件仅在 `done` metadata 或登记历史授权时兼容。删除角色资产或场景记录保留文件，防止破坏历史格子的素材引用；清理文件须另行引用检查与备份。
- `comicReferencePublication.test.js` 使用临时 SQLite、图片与 fake provider 验证并发、上传、旧版兼容、裁剪和历史读取。

## 单格参考图装配

`ComicPanelImageService` 直接使用每份确认素材的原图，每个本地路径与一个带 revision 的预览条目成对记录。按成对条目去重和排除，禁止把多份 metadata 对应到一张雪碧图后按数组索引过滤。默认服装使用三视图；只有分镜指定服装资产名称时才加入变体参考。

预览返回完整候选，便于用户移除素材；生成在排除后校验最多 16 张，超量明确报错，不能静默截断角色、素材或提供给模型的路径。多角色表情参考使用完整表情原图，使预览和实际发送内容一致，具体表情仍由文字描述指定。

`ComicSpriteSheetService` 为其他需要合成图的调用方保留。合成画布使用编码后 `info.width`，因为 sharp 的 `metadata()` 返回输入尺寸，不代表 resize 后尺寸。`comicReferenceAssembly.test.js` 通过真实小图/竖图像素和 fake provider 请求验证缩放、排除配对与数量边界。
