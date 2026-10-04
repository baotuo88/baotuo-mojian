# 漫画图片版本与发布

本模块拥有漫画格子的图片来源身份、原图/植字文件解析和生图发布事务边界。业务服务经 `index.ts` 使用能力；不要自行扫描图片目录或按固定 `lettered.png` 读取成品。

- `PanelArtifactSource`：根据 panel 的结构化输入与 `imageData`/`letteredData` 判断可使用版本，并解析到只读文件。
- `PanelImagePublication`：适配通用 image runtime，为每次生成分配唯一 revision；原始分镜字段和 `imageData` 必须通过数据库条件更新，才能发布该文件。
- 通用 image runtime 负责模型调用与文件下载，本模块负责漫画领域的发布条件，不修改其他图像业务的状态合同。

失败或取消可能留下未被数据库引用的候选文件。这些文件不是已发布图片，不可被 HTTP 或导出目录扫描发现。不要在生成收尾删除旧 revision：规划备份、既有导出或并发读者可能仍引用它们，清理应由具备引用检查和备份策略的独立流程负责。

详细规则见 [漫画图片版本与整话导出](../../../../../docs/wiki/workflows/comic-image-export-consistency.md)。
