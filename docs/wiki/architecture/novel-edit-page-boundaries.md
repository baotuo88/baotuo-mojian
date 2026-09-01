# NovelEdit 页面边界

## Background

`NovelEdit.tsx` 是小说编辑工作区的页面编排入口，负责连接多个查询、Mutation、工作流状态和编辑面板。页面长期承载多个生产阶段，容易同时积累状态管理、业务编排、纯数据解析和浏览器副作用。

## Decision

页面文件保留工作区编排职责：组合 hooks、维护页面级状态、连接 API 和向 `NovelEditView` 传递完整视图模型。

纯函数运行时逻辑集中在 `novelEditRuntime.utils.ts`，当前包括：

- 导演任务状态到接管模式的映射
- 流水线后台活动 payload 解析
- 导演一致性问题判断
- 结构化大纲活动章节定位
- 接管弹窗 sessionStorage key 生成
- 浏览器下载触发
- 工作区 tab 到接管入口 tab 的规范化

## Current Rule

- 纯函数模块不读取 React 状态，不调用 API，不直接操作 Query Client。
- 页面编排通过模块 facade 导入这些能力，调用方不复制解析规则。
- 新增页面运行时纯函数优先放入 `novelEditRuntime.utils.ts`；包含状态副作用或业务流程的逻辑继续放在对应 hook 或 service 中。
- 页面继续按业务阶段拆分组件和 hooks，避免仅为降低行数创建无职责的通用工具文件。
- 工作区 Query 缓存失效与导演恢复目标导航由 `hooks/workspace/` 拥有。页面只提供 novel、当前 tab、章节/分卷选择等必要输入；Query key 组合、批量失效范围和 resume target 对齐规则不得再次内联到页面或视图组件。
- `hooks/` 顶层文件较密集时，新增能力必须进入按职责命名的下级模块并从 `index.ts` 暴露，避免继续堆叠同级 `useNovel*` 文件。

## Failure Modes

- 把 API 调用或 React 状态放入纯函数模块会形成隐式依赖，降低单元测试和后续拆分的可靠性。
- 在页面中重新实现 payload 解析会导致状态投影出现分叉。
- 接管入口使用规范化 tab 映射，历史页和未知 tab 统一落到基础信息入口，避免新增页面类型时重复嵌套条件表达式。
- 抽取函数时改变返回结构会影响接管状态、后台活动提示和章节定位，应优先保持现有调用契约。

## Related Modules

- `client/src/pages/novels/NovelEdit.tsx`
- `client/src/pages/novels/novelEditRuntime.utils.ts`
- `client/src/pages/novels/components/NovelEditView.tsx`
- `client/src/pages/novels/hooks/`

章节修复动作的固定建议集中在 `client/src/pages/novels/chapterExecution.utils.ts`，hook 只负责校验章节、设置动作状态和提交修复任务。

## Verification

纯运行时模块通过 `client/src/pages/novels/novelEditRuntime.utils.test.mjs` 测试。客户端类型检查使用 `pnpm --filter @ai-novel/client typecheck`。

章节修复建议通过 `client/src/pages/novels/chapterExecution.utils.test.mjs` 测试。
