# 宝拓墨间 / AI Novel Production Engine

一个面向长篇小说创作的 AI Native 开源项目。

当前开发主线：
`Creative Hub + 自动导演开书 + 本书世界上下文 + 整本生产主链 + 写法引擎`

![Monorepo](https://img.shields.io/badge/Monorepo-pnpm%20workspace-3C873A)
![Frontend](https://img.shields.io/badge/Frontend-React%20%2B%20Vite-61DAFB)
![Backend](https://img.shields.io/badge/Backend-Express%20%2B%20Prisma-111827)
![LangChain](https://img.shields.io/badge/AI-LangChain-0EA5E9)
![LangGraph](https://img.shields.io/badge/Agent-LangGraph-7C3AED)
![Editor](https://img.shields.io/badge/Editor-Plate-7C3AED)
![Database](https://img.shields.io/badge/Database-SQLite%20%2B%20Prisma-111827)
![Vector DB](https://img.shields.io/badge/RAG-Qdrant-E63946)

---

## 目录

- [项目简介](#项目简介)
- [快速开始](#快速开始)
- [用 Codex 持续创作长篇：Ani Book Skill](#用-codex-持续创作长篇ani-book-skill)
- [项目定位](#项目定位)
- [现在已经能做什么](#现在已经能做什么)
- [典型使用路径](#典型使用路径)
- [当前长篇生成能力支撑图](#当前长篇生成能力支撑图)
- [超长篇能力说明](#超长篇能力说明)
- [最新更新](#最新更新)
- [功能预览](#功能预览)
- [安装与本地开发](#安装与本地开发)
- [Docker Compose 部署](#docker-compose-部署)
- [知识库与 RAG](#知识库与-rag)
- [模型供应商与环境变量](#模型供应商与环境变量)
- [数据库与双 Schema](#数据库与双-schema)
- [常用命令](#常用命令)
- [技术栈与架构](#技术栈与架构)
- [工程与质量保障](#工程与质量保障)
- [文档地图](#文档地图)
- [常见问题排查](#常见问题排查)
- [当前路线图](#当前路线图)
- [交流反馈](#交流反馈)
- [支持项目](#支持项目)
- [贡献方式](#贡献方式)
- [致谢](#致谢)
- [说明](#说明)
- [License](#license)
- [友情链接](#友情链接)

---

## 项目简介

这是一个**面向长篇小说完成度的 AI 生产系统**，不是普通的"你写一句、AI 补一句"聊天壳子。

它的核心做法是：

- 👉 用一句灵感启动整本书的规划，AI 自动给出方向 / 世界 / 角色 / 卷战略 / 章节任务
- 👉 把章节生成、审核、修复、状态回灌串成可暂停可恢复的生产链
- 👉 把拆书、知识库、写法引擎、角色资源账本、世界手册都做成可召回的长期资产
- 👉 提供漫画、短剧等衍生工坊围绕已完成的小说内容做视觉与剧本延展
- 👉 配套公开介绍站、生产链深度文档和按阶段的恢复手册

适合**完全不懂写作的新手**走完一本长篇，也适合研究 AI Native 应用、Agent Workflow、LangGraph 编排和长链路任务的开发者参考。

---

## 快速开始

三条入口，按需选择：

| 场景 | 命令 | 访问地址 |
| --- | --- | --- |
| 只想尽快跑起来（推荐） | `cp .env.example .env` → 设置 `POSTGRES_PASSWORD` → `docker compose up -d --build` | `http://localhost:8080` |
| 参与开发 / 改代码 | `pnpm install` → `cp server/.env.example server/.env` → `pnpm dev` | 前端 `http://localhost:5173`，API `http://localhost:3000/api` |
| 先看功能和文档 | 无需安装 | [GitHub Pages 介绍站](https://batuo88.github.io/baotuo-mojian/) |

模型密钥不是启动前置条件：可以先把项目跑起来，再在页面 `设置 → 模型供应商` 里录入。

> 部署目录路径请使用纯英文。含中文的路径会让 Docker Buildx 在构建阶段中断，详见[常见问题排查](#常见问题排查)。

---

## 用 Codex 持续创作长篇：Ani Book Skill

如果你希望直接在 Codex 的本地工作区推进小说，可以使用 [Ani Book Skill](https://github.com/ExplosiveCoderflome/ani-book-skill)。它将方向判断、故事发动机、章节推进、审校修复和连续性管理组织为一条可恢复、可追溯的长篇创作流程。

这是一条与本项目互补的创作入口：

- 需要可视化创作工作台、模型配置、运行实况与小说资产管理：使用本仓库。
- 希望在 Codex 中通过本地文件、阶段工件和 Skill 直接持续创作：前往 [Ani Book Skill](https://github.com/ExplosiveCoderflome/ani-book-skill)。

---

## 项目定位

很多 AI 写作工具的使用方式其实差不多：你输入一句 Prompt，它回你一段正文，不满意就重试。写短篇还行，写长篇容易越写越散。

这个仓库是"AI 导演式长篇小说生产系统"，核心产品判断是：

- 目标用户优先是完全不懂写作的新手，而不是熟悉结构设计的资深作者
- 优先解决"如何把整本书写完"，再逐步优化"写得多精巧"
- AI 不只是补全文本的模型，而是参与规划、判断、调度、执行和追踪的系统角色

如果你在找下面这类项目，这个仓库会更值得关注：

- 想验证 AI 是否真的能参与整本小说生产，而不是只写单段文案
- 想研究 AI Native Product、Agent Workflow、LangGraph 编排怎样落到真实创作业务
- 想把世界观、角色、拆书、知识库、写法控制、章节生成、质量修复串成一套稳定工作流

---

## 现在已经能做什么

### 1. AI 自动导演开书与正文生产交接

- 从一句灵感直接进入自动导演，无需先手写世界观、主线、角色和卷纲；系统先整理项目设定、对齐书级 framing，再生成多套整本方向和对应标题组
- 方向不满意时可以继续生成、定向修订某一套方案、或只重做某套方案的标题组，避免"满意就确认 / 不满意就整批重来"
- 自动导演先把书级方向、角色和卷章规划推进到可开写，再由用户选择：**简易创作**持续自动完成整本书，**专业创作**进入完整工作台检查和调整
- 全自动驾驶模式下遇到模型不可用、配额耗尽、连续修复失败、要求重新规划等情况会主动停下，而不是无限重试；所有状态保存到导演跟进，可从原检查点恢复
- 全自动模式下每批章节完成后自动确认 pending 候选角色，角色进入正式名册并触发动态重建，消除后续章节角色一致性漂移
- 链路覆盖书级方向、故事宏观规划、本书世界、角色准备、卷战略 / 卷骨架、节奏板、章节清单、章节细化、章节执行、审核、修复，每一阶段都支持检查点恢复、接管和换模型重试

### 2. Creative Hub 与 Agent Runtime

- 统一创作中枢承载对话、追问、规划、工具调用、任务状态和回合总结，不再是分散的功能按钮
- 系统内有明确的 Planner、Tool Registry、Runtime、审批节点、状态卡片和中断恢复链路；自然语言意图会被路由到对应的自动导演阶段或章节任务
- 浏览器暂停通知：到达 checkpoint 时弹出系统通知，长链路任务挂机更安心

### 3. 整本生产主链与章节执行

- 单章运行时、章节执行和整本批量 pipeline 收敛到同一条主链
- 章节生成上下文按本章参与者精准筛选角色资源账本，避免把全部角色塞进 prompt；高风险已入账与待确认提案分别走不同审计代码，正文不会把待确认资源写成既成事实
- 章节执行链覆盖正文生成、AI 审核、可修复问题处理、质量债务记录、角色状态 / 事实 / 伏笔回灌、下一章入口
- LLM 限速器修复内存泄漏：provider 配置变更时淘汰旧限速器，长期运行内存稳定

### 4. 拆书工作台与角色形象演变

- 拆书角色档案分**简要 / 标准 / 深入 / 完整**四档，深入和完整档案会回溯原文片段补全维度
- **角色形象演变**：按 25% / 50% / 75% / 100% 覆盖率增量扫描出场章节，沉淀每章外貌、服装、状态和场景锚点，并基于章节快照生成同一角色阶段形象图；提取的短外貌词条放入待确认区，勾选后融合到角色档案
- 章节形象图可引用角色基础形象图，保持脸型 / 发型 / 标志细节一致
- 拆书还提供双栏阅读、章节证据回溯、范围定向分析、token 预算守卫、稿件诊断模式

### 5. 写法引擎与反 AI 规则

- 写法不再只是提示词里的一段说明，而是可保存、编辑、绑定、试写、复用的长期资产
- 可从现有文本提取写法特征 + 原文样本；特征沉淀为可见特征池，逐项启用 / 停用 / 组合，规则同步重编译
- 写法引擎参与生成、检测和修正链路；反 AI 规则减少正文模板感、解释感和空泛表达

### 6. 本书世界、角色、知识库联动 + RAG

- 世界观从大段设定文本升级为可生成 / 复用 / 同步的本书世界；地图、势力图谱会进入章节上下文
- 拆书结果和知识库文档通过 RAG 回灌到规划、续写和正文生成
- RAG 索引流式并行：Embedding 与 Qdrant 写入并发可调；拆书产物入 facets 索引让召回包含拆书结论；chunk hash 去重防止重建产生重复向量；retrieval trace 后端可追踪召回为什么命中

### 7. 漫画与短剧衍生工坊

- **漫画工作台**：场景一致性、角色视觉资产、视觉锚点控制；分镜与角色面板支持图像生成确认弹窗，避免误触消耗额度
- **短剧改编生产管线 v3**：从小说内容衍生短剧剧本和镜头
- 衍生工坊不在主链跑通前打开——它们消费的是小说已生成的章节、角色和场景

### 8. 公开介绍站与文档体系

- GitHub Pages **公开介绍站**（本地开发端口 4173）展示主链、产品截图、文档入口与下载链接
- 文档站提供本地全文搜索、面包屑、文内目录、上 / 下一篇导航、tip / warn / checkpoint 提示块、GFM 表格
- 33 篇公开文档：项目介绍、安装与准备、常见问题、故障排查、第一本小说实操路径、按阶段恢复手册、端到端生产链、自动导演阶段全景、章节执行链、知识与 RAG 召回链 + 模块说明
- 模块文档配套真实产品截图；自动导演阶段名用中文表达，技术别名对照表保留在自动导演阶段全景文末供开发者查阅

### 9. 模型路由与本地运行

- 内置 11 个模型供应商（OpenAI、DeepSeek、SiliconFlow、Anthropic、xAI、Kimi、MiniMax、GLM、Qwen、Gemini、Ollama）；规划、正文、审阅、拆书等链路可按任务拆开路由
- 默认 SQLite 即可跑通主链；需要 RAG 检索时再接入 Qdrant
- RAG 并发数、限速等运行时参数从 .env 迁到设置面板，改完即生效无需重启
- Monorepo 拆分（pnpm workspace），介绍站 / 服务端 / 客户端独立可构建

---

## 典型使用路径

1. 在小说创建页输入一句灵感，先让 AI 自动导演给出整本方向候选。
2. 进入 `项目设定`，先把题材、卖点、目标读者感受和前 30 章承诺定下来。
3. 用 `故事宏观规划`、`本书世界` 和 `角色准备`，把整本主线、舞台边界和角色网补到能写。
4. 进入 `卷战略 / 卷骨架` 决定怎么分卷，再到 `节奏 / 拆章` 把当前卷落到章节列表和单章细化。
5. 按需绑定拆书结果、知识库文档和写法资产，让后续正文不只是靠一次性提示词。
6. 进入 `章节执行` 逐章写作、审计、修复，必要时回到卷工作台做再平衡和重规划。
7. 想加速推进时，再启动整本生产任务，持续查看状态、失败原因和回灌结果。

---

## 当前长篇生成能力支撑图

![当前长篇生成能力支撑图](./images/流程图.svg?v=1)

- 开书定盘负责先把这本书“要写成什么样”说清楚，避免后面越写越散。
- 整本控制层和卷级规划层负责把长篇拆成可推进、可回看、可调整的结构，而不是一次性写死。
- 角色、世界观、写法、知识库和质量控制一起托住单章生成，让每一章都尽量还在同一本书里。
- 每写完一章，系统都会把新状态回灌回去，继续影响后续章节、卷级节奏和必要时的重规划。

---

## 超长篇能力说明

长篇的真正难点不是"能不能写出一章"，而是写到第 200 章时上下文会不会失控。这个项目用**结构化状态压缩**替代全文注入，相关参数都写在代码里，可以直接核对。

### 规模边界

| 项目 | 取值 | 出处 |
| --- | --- | --- |
| 最大卷数 | 24 卷（`MAX_VOLUME_COUNT`） | `shared/types/volumePlanning.ts` |
| 单卷章节区间 | 最少 40、理想 55、最多 70 | `DEFAULT_VOLUME_CHAPTER_TARGET_RANGE` |
| 最小总章节预算 | 12 章（`MIN_TOTAL_CHAPTER_BUDGET`） | 同上 |
| 固定样本验收 | 100 章、4 卷、GenerationJob 100/100 | `docs/wiki/workflows/long-form-production-acceptance.md` |

按章节预算自动推荐卷数（同一文件内的分级表）：`< 60` 章 1-2 卷、`60-120` 章 3-4 卷、`120-250` 章 4-6 卷、`250-500` 章 6-9 卷、`500-900` 章 9-14 卷、`900-1500` 章 14-20 卷、`1500+` 章 18-24 卷。

### 三层记忆机制

**分层上下文**：`CanonicalStateService`（书级事实、角色状态、冲突与伏笔账本）、`TimelineContextService`（时间锚点、前置事件、开放钩子、未来禁止揭示）、`ContextAssemblyService`（本章应推进 / 保留 / 触碰 / 禁止的叙事任务），最终收敛成写作、审校、修复共用的 `chapterLayeredContext` 章节合同。

**确定性记忆窗口**：时间线钩子扫描最近 200 条，开放钩子上限 8 条、已处理钩子上限 5 条，两者分窗互不挤占预算；事实账本只保留最近 30 章的 completed / revealed 事实与 15 章的状态变化。排序永远是"优先级优先 + 最新优先"，不会退化成"最旧优先"。这让 200 章的小说注入量稳定在几十条量级，而不是随章节线性膨胀。

**卷级滚动摘要**：跨卷续写时模型能看到的不只是"上一卷的计划"，还有"上一卷实际发生了什么"——本卷情节推进、角色状态变化、遗留钩子、不可逆事实和下一卷必须承接的要点，幂等生成后写入 `VolumePlan.completedSummaryJson`，由 `volume_window` 上下文块注入写章提示词。

### 长跑保护

- **高内存预留**：`AUTO_DIRECTOR_HIGH_MEMORY_BATCH_LIMIT = 1`，结构化大纲、节拍表、章节清单等重任务同一范围内只允许一个在跑；预留 TTL 10 分钟、每 2 分钟续约，冲突时返回 409 而不是一起 OOM。
- **执行栅栏**：正文落盘携带 `executionId` + `checkpointVersion`，保存前后都确认租约未过期、版本未变化，旧执行失去租约后不能覆盖新执行的正文。
- **质量债务**：局部章节问题记录为可见质量债务并继续推进整本；只有明确重规划、无可用正文、受保护内容风险或数据完整性风险才允许阻断。

完整评估（含字数估算、竞品对比和改进建议）见 [LONG_FORM_CAPABILITY_REPORT.md](./LONG_FORM_CAPABILITY_REPORT.md)。

---

## 最新更新

### 2026-09-04

- 自动创作在后台重启、重复继续或租约切换时，会从最近安全进度接续，避免同一章节被重复写入；任务只有真实执行完成后才会显示成功。
- 章节流水线在刷新或重新打开小说后仍会显示正在运行的任务、阶段和进度；启动失败会给出下一步提示，减少重复点击和无效等待。
- 长篇生产验收覆盖 100 章、4 卷、跨阶段摘要、状态快照、事实与伏笔回收，整本书的连续推进证据可追踪。
- 手动创建项目出错时会保留当前填写内容并显示恢复提示，减少重复填写；网络中断后再次提交会复用原项目和创作任务，避免重复创建。

完整历史更新见 [docs/releases/release-notes.md](./docs/releases/release-notes.md)。

---

## 功能预览

### 功能概览中的95%以上编写都是AI完成

下面这组截图优先展示当前版本正在使用的单书工作流：从自动导演开书，到项目设定、故事宏观规划、角色准备、卷战略、节奏拆章、章节执行，再到质量修复，已经开始收成一条连续推进链，而不是一组彼此割裂的演示页。

### 提示词编辑器

提示词编辑器用于调试和维护产品级 AI 任务的提示词资产。正文生成提示词支持本书范围的高级模板编辑，可以用可视化引用标签插入书级合约、章节任务、角色事实、时间线、运行变量和槽位规则，并通过预览检查最终 messages 与上下文注入结果；需要验证效果时，也可以选择模型直接测试当前草稿产出。

![提示词编辑器](./images/ScreenShot_2026-07-08_140153_328.png)

### Creative Hub

统一承载对话、规划、工具执行和创作推进的创作中枢。

![创作中枢](./images/创作中枢.png)

### 首页创作续写台

首页会围绕当前小说、真实进度和推荐下一步组织续写入口，让第一次使用也能快速找到现在该做什么。

![首页创作续写台](./images/v2/微信截图_20260813215131.png)

### 自动导演模式

自动导演创建页现在会把一句灵感、导演起始参数、书级 framing、模型设置和运行方式收进同一面板；进入方向选择后，不只是给你两套整本方案，还会配套书名组选项、推荐理由和定向重做入口，适合先把这本书“该怎么开”定下来。

![自动导演创建](./images/导演模式-创建.png)

![自动导演选择方向](./images/导演模式-选择方向.png)

![自动导演执行中](./images/导演模式-创建中.png)

![自动导演交接与继续执行](./images/导演模式-编辑.png)

### 项目设定

项目设定已经挂到单书工作台的连续流程里：左侧能直接看到当前步骤与整体进度，上方能看到 AI 接管状态，正文区则集中处理标题、简介、书级 framing、写法确认和本书真正会用到的世界边界。

![项目设定](./images/write/项目设定.png)

### 故事宏观规划

故事宏观规划不再只是大段摘要，而是先把故事引擎、推进与兑现摘要、长期对立和前 30 章承诺压成后续可继承的书级引导层，先保证整本主线能推，再把卷级和章节级规划建在这套底盘上。

![故事宏观规划](./images/write/故事宏观规划.png)

### 角色准备

角色准备页现在更像角色工作台而不是角色表单：会先盘点目标区段的核心角色，再给出 AI 阵容方案、结构关系网和动态角色系统，减少开书后角色断档、功能位缺失和关系推进失速。

![角色准备](./images/write/角色准备.png)

### 卷战略 / 卷骨架

卷战略阶段已经开始显式区分“卷战略、卷骨架、节奏板、拆章节”四个阶段完成度。系统会先判断当前是不是已经具备继续推进条件，再生成卷战略建议、审查卷骨架，并把版本控制与影响分析收进同一页。

![卷战略 / 卷骨架](./images/write/卷战略.png)

### 节奏 / 拆章

节奏 / 拆章现在把节奏段列表、批量细化、单章标题、摘要、章节目标和任务单放进同一工作区；可以按当前可见章节或指定范围连续细化，也可以对摘要和目标做局部 AI 修正，更适合连载网文式的持续推进。

![节奏 / 拆章](./images/write/节奏拆章.png)

### 章节执行

章节执行页现在更像主写作工作台：左侧是章节卡片与下一步状态，中间是已保存正文和版本区，右侧则把执行计划、正文写作、审核、修复、状态同步和伏笔回填收在同一套动作面板里，适合逐章推进。

![章节执行](./images/write/章节执行.png)

### 质量修复

质量修复已经从零散按钮收成独立工作台：可以围绕当前章节执行审核、执行修复、生成钩子，并结合当前批次、质量阈值和 AI 输出继续往后处理，适合把“写完之后怎么稳住质量”也纳入主流程。

![质量修复](./images/write/质量修复.png)

### 正文修改

当一章已经写出正文后，还可以进入独立正文编辑器继续局部改写。正文修改页会把任务单、审计结果和修复链路继续挂在这章身上，避免用户在“主写作区”和“精修区”之间断掉上下文。

![正文修改](./images/正文修改.jpeg)

### 小说列表

从这里进入开书、管理、编辑和整本生产。

![小说列表](./images/v2/微信截图_20260813220328.png)

### 拆书分析

拆书分析已经不只是生成一篇读后感：可选快速 / 标准 / 完整三档拆书，覆盖题材定位、剧情结构、人物系统、世界设定和写法技法；角色档案支持简要 / 标准 / 深入 / 完整四档深度，还能按 25% / 50% / 75% / 100% 覆盖率对角色做形象演变的增量扫描，生成跨章节一致的参考图。拆书结论可以直接发布到知识库、一键转成写法资产，或把角色升格进基础角色库，让“拆一本书”变成后续创作能反复调用的长期资产，而不是看完就忘的一次性笔记。

![拆书分析](./images/v2/微信截图_20260813220038.png)

拆书结果页会把作品结构、人物和创作经验整理成可复用的分析资产。

### 知识库

统一管理文档、索引、重建任务和检索能力。

![知识库](./images/知识库.png)

### 世界观

世界观不再只是描述文本，而是能生成世界骨架、维护世界手册，并绑定为每本小说自己的本书世界上下文。

![世界样本库](./images/v2/微信截图_20260813220219.png)
![世界手册与可视化](./images/v2/微信截图_20260813220255.png)

### 角色库

统一维护角色基础档案与小说内角色信息。

![角色库](./images/角色库.png)

### 类型管理

集中维护题材与类型资产，让故事规划、角色准备和正文生成共享同一套题材语言。

![题材基底库](./images/v2/微信截图_20260813220110.png)

### 流派管理

把推进模式、兑现方式和冲突边界收成可复用的流派模式资产，让整本书更容易保持读者预期。

![推进模式库](./images/v2/微信截图_20260813220114.png)

### 标题工坊

批量生成、筛选和微调书名与标题方向，降低新手在开书命名阶段的试错成本。

![标题工坊](./images/v2/微信截图_20260813220147.png)

### 写法引擎与反 AI 规则

统一管理写法资产、风格约束和反 AI 规则，让正文更像作品本身，而不是模板式补全文本。

![写法引擎](./images/v2/微信截图_20260813220303.png)
![反 AI 规则](./images/v2/微信截图_20260813220310.png)

### 任务中心

查看拆书、知识库重建和其他后台任务的排队、执行与失败状态。

![任务中心](./images/任务中心.png)

### 模型配置

为不同能力配置不同模型，减少一套模型硬吃所有任务的成本。

![模型配置](./images/模型配置.png)

---

## 安装与本地开发

### 环境要求

- Node.js `^20.19.0 || ^22.12.0 || >=24.0.0`
  推荐直接使用 `20.19.x LTS`
- pnpm `>= 10.6`
  推荐直接使用仓库声明的 `pnpm@10.6.0`
- 至少一组可用的 LLM API Key
  也可以先把项目跑起来，再在页面里配置
- 如果你要完整体验知识库 / RAG，再额外准备可用的 Qdrant

版本要求写在根 `package.json` 的 `engines` 与 `packageManager` 字段里，`pnpm dev` 启动前会先跑 `scripts/check-deps.cjs` 做依赖自检。

### 1. 安装依赖

```bash
pnpm install
```

默认的 `pnpm install` 只准备 Web / Server 开发所需依赖。如果你只是运行现有 Web / Server 开发流，到这里就够了。

如果你在 Windows 上执行 `pnpm install` 时卡在 `prisma preinstall`，通常先检查这两类问题：

1. Node 版本过低
   Prisma 7 目前要求 Node `^20.19.0 || ^22.12.0 || >=24.0.0`。如果你还在 `20.0 ~ 20.18`，建议先升级到 `20.19.x LTS` 再安装。
2. `script-shell` 被配置成了交互式 shell
   如果全局 `npm/pnpm script-shell` 被设成了 `cmd.exe /k` 之类会保留提示符的形式，Prisma 的 lifecycle script 可能不会自动退出，看起来就像安装“卡死”在：
   `node_modules/.../prisma>`

可以先运行下面几条命令自查：

```bash
node -v
pnpm config get script-shell
npm config get script-shell
```

如果 `script-shell` 返回的是带 `/k` 的 `cmd.exe`，建议删除这项配置后重新打开终端，然后重新执行 `pnpm install`：

```bash
npm config delete script-shell
pnpm config delete script-shell
```

### 2. 配置环境变量

这个仓库通过 pnpm workspace 分别启动前后端，所以环境变量也是按子包读取的：

| 文件 | 用途 | 谁读取 |
| --- | --- | --- |
| `server/.env` | 本地源码开发的主配置 | `pnpm dev` 启动的 API（工作目录在 `server/`） |
| `client/.env` / `client/.env.local` | 前端可选覆盖 | Vite（工作目录在 `client/`） |
| 根目录 `.env` | Docker Compose 部署配置 | `compose.yml` 的 `env_file` |

三个模板文件分别是 `server/.env.example`、`client/.env.example` 和根目录 `.env.example`；根目录 `.env.docker.example` 是更精简的 Docker 参考。注意根目录 `.env` **不是** `pnpm dev` 的默认入口。

#### 2.1 服务端环境变量

先复制服务端示例文件：

```bash
# macOS / Linux
cp server/.env.example server/.env

# Windows PowerShell
Copy-Item server/.env.example server/.env
```

最少建议先确认这些项目：

- `DATABASE_URL`
  留空即可，开发环境默认回落到本地 SQLite `file:./dev.db`；只有生产环境（`NODE_ENV=production`）才强制要求显式配置
- `RAG_ENABLED`
  如果你暂时不接知识库，建议先设为 `false`
- `QDRANT_URL`、`QDRANT_API_KEY`
  只有要启用 Qdrant / RAG 时才需要

`OPENAI_API_KEY`、`DEEPSEEK_API_KEY`、`SILICONFLOW_API_KEY` 这类变量可以先留空——启动时只会打印一条提示，不会阻断服务；项目启动后可以在页面中配置模型供应商和默认模型。

服务端启动时会先执行 `server/src/config/validateEnv.ts`：格式非法的 `DATABASE_URL`、生产环境缺失的 `DATABASE_URL` 和生产弱密码会直接阻断启动；未配置模型密钥、启用 RAG 但缺少 Qdrant 配置只会打印警告。启动日志中的连接串会做脱敏处理，随后打印一份配置摘要（运行环境、数据库类型、已读取的供应商、RAG 状态）。

#### 2.2 前端环境变量

大多数本地开发场景，其实不需要单独创建前端 env。

因为前端开发模式下默认会把 API 指到：

```text
http(s)://当前页面 hostname:3000/api
```

这也包括“同一台机器启动服务，然后用局域网 IP 在别的设备上访问”的场景。
例如页面开在 `http://192.168.0.37:5173`，前端默认会自动把 API 指到：

```text
http://192.168.0.37:3000/api
```

只有在这些场景下，才建议创建 `client/.env`：

- 前端和后端不在同一台机器
- 你想把前端显式指向别的 API 地址
- 你需要固定 `VITE_API_BASE_URL`

如果你已经复制了 `client/.env.example`，又发现浏览器请求都跑到了 `http://localhost:3000/api`，通常就是因为你把 API 显式固定死了。对同机 / 局域网访问，建议直接删除或注释掉 `VITE_API_BASE_URL`。

```bash
# macOS / Linux
cp client/.env.example client/.env

# Windows PowerShell
Copy-Item client/.env.example client/.env
```

内容通常只需要：

```env
# 同机 / 局域网访问时，通常不需要这一行
# VITE_API_BASE_URL=http://localhost:3000/api
```

#### 2.3 模型供应商并不一定要写死在 env

当前项目已经支持在页面里配置模型相关设置：

- `/settings`
  配置供应商 API Key、默认模型、连通性测试
- `/settings/model-routes`
  给不同任务分配不同 provider / model
- `/knowledge?tab=settings`
  配置 Embedding provider、Embedding model、集合命名和自动重建策略

所以环境变量里的 `OPENAI_MODEL`、`DEEPSEEK_MODEL`、`EMBEDDING_MODEL` 等，更适合当作启动默认值、以及数据库里还没保存设置时的回退值。页面录入的密钥会加密存库，启动时由 `loadProviderApiKeys()` 载入，失败才回退到环境变量。

### 3. 启动开发环境

```bash
pnpm dev
```

如果你已经复制好了 `server/.env`，默认就是直接运行这一条。
不需要在首次启动前手动再执行 `prisma generate`、`prisma db push` 或 `pnpm db:migrate`。

默认情况下：

- 前端：`http://localhost:5173`
- 后端：`http://localhost:3000`
- API：`http://localhost:3000/api`
- 公开介绍站（`pnpm dev:site`）：`http://localhost:4173`

`pnpm dev` 会用 `concurrently` 并行拉起 shared 的 watch 构建、服务端和前端，并把整轮日志落盘（`scripts/run-with-log.cjs`）。服务端启动脚本会先跑 `ensure-dev-prisma.cjs`（自动 Prisma generate 与 `db push`）和 `stop-stale-dev-server.cjs`（清理上次残留进程），再用 `tsx watch` 运行 `src/app.ts`。只有在你自己修改了 Prisma schema，或者要处理正式迁移流程时，才需要手动使用 Prisma / 数据库相关命令。

启动过程还会拉起若干后台服务：RAG 索引 Worker、检索追踪清理、事件副作用 Worker、导演 Worker、待恢复任务初始化、短篇生产恢复、内置创作资源初始化和日志清理。这些都是长链路生产恢复能力的一部分，不需要额外手动启动。

### 4. 首次启动后建议的三步

1. 打开 `http://localhost:5173/settings`，至少配置一组可用的模型供应商 API Key
2. 打开 `http://localhost:5173/settings/model-routes`，检查各任务实际使用的模型路由
3. 如果要启用知识库，打开 `http://localhost:5173/knowledge?tab=settings`，保存 Embedding / Collection 设置

### 5. 可选初始化

下面这些都不是首次启动 `pnpm dev` 的前置步骤：

```bash
pnpm db:seed
pnpm db:studio
```

---

## Docker Compose 部署

仓库根目录的 `compose.yml`（Compose v2 命名，不是 `docker-compose.yml`）提供 Web、API、PostgreSQL 和可选 Qdrant 的完整编排，项目名为 `baotuo-mojian-app`。

```bash
cp .env.example .env
# 至少修改 POSTGRES_PASSWORD，可选填入模型密钥
docker compose up -d --build
```

默认访问 `http://localhost:8080`，健康检查地址为：

```bash
curl -fsS http://localhost:8080/api/health/live
```

### 服务编排

| 服务 | 镜像 / 构建 | 说明 |
| --- | --- | --- |
| `web` | `Dockerfile.web`，构建参数 `VITE_API_BASE_URL=/api` | 宿主机端口由 `WEB_PORT` 决定，默认 `8080:8080` |
| `api` | `Dockerfile.api` | `NODE_ENV=production`、`PORT=3000`、`HOST=0.0.0.0`、`ALLOW_LAN=false`、`TRUSTED_REVERSE_PROXY=true`；健康检查 `/api/health/live` |
| `postgres` | `postgres:17-alpine` | `pg_isready` 健康检查，仅挂在内部网络 |
| `qdrant` | `qdrant/qdrant:v1.15.4` | 属于 `rag` profile，默认不启动 |

网络上只有 `web` 暴露到宿主机，`backend` 网络标记为 `internal`，数据库和向量库不会直接对外。数据卷分别是 `baotuo-mojian-app_postgres_data`、`_image_storage` 和 `_qdrant_storage`。

`DATABASE_URL` 由 `compose.yml` 依据 `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` 自动拼装并强制 `AI_NOVEL_DATABASE_MODE=postgresql`、`AI_NOVEL_COMPOSE_BASELINE=true`，不需要在 `.env` 里手写；只有把 API 指向外部数据库时才需要显式覆盖。密码含 `@ : / # ?` 等 URL 特殊字符时需要做百分号编码。

### 启用 RAG

```bash
# .env 中设置 RAG_ENABLED=true，然后带 profile 启动
docker compose --profile rag up -d --build
```

根目录 `.env.example` 里 `RAG_ENABLED` 显式写成 `false`，所以 Compose 默认不启用 RAG；`server/.env.example` 默认为 `true`，代码内的默认值也是启用，因此本地开发若不想接 Qdrant 需要主动关掉。

### 更新、备份与卸载

```bash
# 更新
git pull && docker compose up -d --build

# 备份数据库
docker compose exec postgres pg_dump -U baotuo -d baotuo_mojian -Fc > backup.dump

# 停止（保留数据）
docker compose down
```

`docker compose down -v` 会连同数据卷一起删除，属于破坏性操作，执行前请确认已备份。完整配置、升级和排障说明见 [Docker Compose 部署文档](./docs/deployment/docker-compose.md)。

### 部署注意事项

- **部署目录必须是纯英文路径**。含中文的路径会让 Docker Buildx 报 `x-docker-expose-session-sharedkey ... non-printable ASCII characters` 并中断构建。
- **项目没有完整的多用户认证体系**。不要把 `WEB_PORT` 直接暴露到公网；需要外网访问时请在前面放一层 HTTPS 反向代理并自行加访问控制，同时把 `APP_BASE_URL` 和 `CORS_ORIGIN` 改成最终域名。
- 旧版本 Docker Compose 可以先用 `./scripts/docker-compose-up.sh` 作为过渡启动方式。
- 只想单独跑一个 Qdrant 时可以用 `infra/docker-compose.qdrant.yml`。

---

## 知识库与 RAG

RAG 不是跑通主链的前置条件。只体验主流程时，在 `server/.env` 里设 `RAG_ENABLED=false` 即可。

启用后的检索链路是"向量召回 + 关键词召回 + 融合"：默认分块 800 token、重叠 120，向量与关键词各取 40 个候选，最终返回 8 条。集合默认名为 `ai_novel_chunks_v1`，本地 Qdrant 默认地址 `http://127.0.0.1:6333`。Embedding 并发、Qdrant 写入并发这类运行时参数不从环境变量读取，统一在 `知识库 → 向量设置` 面板里管理，改完即生效。

### 使用 Qdrant Cloud

1. 到 [Qdrant Cloud](https://cloud.qdrant.io/) 注册账号。
2. 在 `Clusters` 页面创建一个集群。测试阶段用 Free cluster 就够了。
3. 集群创建完成后，到集群详情页复制 Cluster URL。
4. 在集群详情页的 `API Keys` 中创建并复制一个 Database API Key。这个 key 创建后通常只展示一次，建议立即保存。
5. 把它们写入 `server/.env`：

```env
QDRANT_URL=https://your-cluster.region.cloud.qdrant.io:6333
QDRANT_API_KEY=your_database_api_key
```

6. 启动项目后，再去 `知识库 -> 向量设置` 页面选择 Embedding provider / model，并保存集合设置。

对这个项目来说，`QDRANT_URL` 建议直接填 REST 地址，也就是带 `:6333` 的地址。

如果你想手动验证连通性，可以用：

```bash
curl -X GET "https://your-cluster.region.cloud.qdrant.io:6333" \
  --header "api-key: your_database_api_key"
```

你也可以把集群地址后面拼上 `:6333/dashboard` 打开 Qdrant Web UI。

Qdrant 官方文档：

- [Create a Cluster](https://qdrant.tech/documentation/cloud/create-cluster/)
- [Database Authentication in Qdrant Managed Cloud](https://qdrant.tech/documentation/cloud/authentication/)
- [Cloud Quickstart](https://qdrant.tech/documentation/cloud/quickstart-cloud/)

---

## 模型供应商与环境变量

内置 11 个供应商，键名的唯一事实源是 `server/src/llm/providers.ts`。每个供应商都支持三个环境变量：`<前缀>_API_KEY`、`<前缀>_BASE_URL`、`<前缀>_MODEL`。

| 供应商 | API Key 变量 | 默认 Base URL | 代码内默认模型 |
| --- | --- | --- | --- |
| DeepSeek | `DEEPSEEK_API_KEY` | `https://api.deepseek.com/v1` | `deepseek-v4-flash` |
| SiliconFlow | `SILICONFLOW_API_KEY` | `https://api.siliconflow.cn/v1` | `Qwen/Qwen2.5-7B-Instruct` |
| OpenAI | `OPENAI_API_KEY` | `https://api.openai.com/v1` | `gpt-5` |
| Anthropic | `ANTHROPIC_API_KEY` | `https://api.anthropic.com/v1` | `claude-3-5-sonnet-20241022` |
| Grok | `XAI_API_KEY` | `https://api.x.ai/v1` | `grok-4` |
| Kimi | `KIMI_API_KEY` | `https://api.moonshot.cn/v1` | `moonshot-v1-32k` |
| MiniMax | `MINIMAX_API_KEY` | `https://api.minimax.io/v1` | `MiniMax-M2.7` |
| GLM | `GLM_API_KEY` | `https://open.bigmodel.cn/api/paas/v4` | `glm-4.5-air` |
| Qwen | `QWEN_API_KEY` | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` |
| Gemini | `GEMINI_API_KEY` | `https://generativelanguage.googleapis.com/v1beta/openai` | `gemini-2.5-flash` |
| Ollama | 不需要（`requiresApiKey: false`） | `http://127.0.0.1:11434/v1` | `llama3.2` |

Ollama 本地部署只需要配置 `OLLAMA_BASE_URL`。使用第三方兼容网关时，覆盖对应的 `<前缀>_BASE_URL` 即可。

### 其他常用变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` / `HOST` | `3000` / `localhost` | 开发环境 `ALLOW_LAN` 默认开启，此时监听 `0.0.0.0` |
| `ALLOW_LAN` | 开发 `true`，生产 `false` | 是否允许局域网 IP 来源的跨域访问 |
| `CORS_ORIGIN` | 空 | 逗号分隔的允许来源；localhost 开发来源始终允许 |
| `API_JSON_LIMIT` | `20mb` | 长篇正文请求体较大；公网暴露建议收窄 |
| `NOVEL_SNAPSHOT_RETENTION_COUNT` | `10` | 每本小说保留的自动版本快照数（手动快照不计入） |
| `WORLD_WIZARD_ENABLED` / `WORLD_VIS_ENABLED` / `WORLD_GRAPH_ENABLED` | `true` / `true` / `false` | 世界观向导、可视化、关系图谱开关 |
| `RAG_ENABLED` | 代码默认 `true` | 根 `.env.example` 显式设为 `false` |
| `LLM_REQUEST_TIMEOUT_MS` | `120000` | 单次模型请求超时 |
| `AI_NOVEL_LOG_RETENTION_DAYS` / `AI_NOVEL_LLM_LOG_RETENTION_DAYS` | `14` / `7` | 日志保留天数，启动时自动清理 |
| `BOOK_ANALYSIS_MAX_CONCURRENT_TASKS` | `2` | 拆书分析并发上限 |

完整清单见 `server/.env.example`（本地开发）与根目录 `.env.example`（Docker Compose）。

---

## 数据库与双 Schema

项目同时维护 SQLite 与 PostgreSQL 两套 Prisma schema，通过 Prisma 7 的 driver adapter（`@prisma/adapter-better-sqlite3` / `@prisma/adapter-pg`）切换。

### 运行时如何选择数据库

判定逻辑在 `server/src/config/database.ts`：

1. 若设置了 `DATABASE_URL`，按前缀判定：`file:` → SQLite，其余（`postgresql://` / `postgres://`）→ PostgreSQL；`postgresql+psycopg://` 会被自动规范化。
2. 未设置 `DATABASE_URL` 时读 `AI_NOVEL_DATABASE_MODE`，可取 `sqlite` / `file` / `postgres` / `postgresql` / `pg`。
3. 两者都没有时默认 SQLite，连接串为 `file:./dev.db`；显式选 PostgreSQL 而未给连接串时回落到 `postgresql://postgres:postgres@127.0.0.1:5432/ai_novel`。
4. `NODE_ENV=production` 且没有 `DATABASE_URL` 会直接抛错，不会静默落到本地 SQLite。

### Schema 与迁移目录对应关系

| 数据库 | Schema | 迁移目录 |
| --- | --- | --- |
| SQLite | `server/src/prisma/schema.sqlite.prisma` | `server/src/prisma/migrations.sqlite` |
| PostgreSQL（源码开发） | `server/src/prisma/schema.prisma` | `server/src/prisma/migrations` |
| PostgreSQL（Compose 基线） | `server/src/prisma/schema.prisma` | `server/src/prisma/migrations.compose` |

`AI_NOVEL_COMPOSE_BASELINE=true` 时使用 `migrations.compose` 这套压缩基线，且只允许配合 PostgreSQL，否则启动即报错。Compose 部署已默认打开该开关。

### 保持两套 Schema 对齐

改动数据模型时必须同步修改两个 schema 文件，然后运行：

```bash
pnpm check:prisma-parity
```

该脚本（`scripts/check-prisma-schema-parity.cjs`）比对模型、字段与枚举差异，避免只改一侧导致另一种数据库启动失败。迁移可用 `pnpm test:migrations` 做一次干净库的重放验证（需要 bash 环境，Windows 下用 Git Bash 或 WSL）。

---

## 常用命令

### 开发与构建（仓库根目录）

| 命令 | 说明 |
| --- | --- |
| `pnpm dev` | 依赖自检 + 带日志落盘地并行启动 shared / server / client |
| `pnpm dev:raw` | 同上但不写日志文件 |
| `pnpm dev:server` / `pnpm dev:client` / `pnpm dev:shared` | 只启动单个包 |
| `pnpm dev:client:wait` | 等待 API 3000 端口就绪后再启动前端 |
| `pnpm dev:site` | 启动官网站点（默认 4173） |
| `pnpm build` | 按 shared → server → client 顺序构建 |
| `pnpm build:site` | 单独构建官网站点 |
| `pnpm typecheck` | 构建 shared 后对 server 与 client 做类型检查 |

### 数据库

| 命令 | 说明 |
| --- | --- |
| `pnpm db:migrate` | 执行 Prisma 迁移（透传到 `@ai-novel/server`） |
| `pnpm db:seed` | 写入示例数据 |
| `pnpm db:studio` | 打开 Prisma Studio 浏览数据 |
| `pnpm db:restore` | 从备份恢复开发数据 |
| `pnpm db:prune-snapshots` | 清理过量版本快照 |
| `pnpm --filter @ai-novel/server db:inspect` | 打印数据库结构与统计 |
| `pnpm --filter @ai-novel/server db:archive-state-snapshots` | 归档状态快照 |
| `pnpm --filter @ai-novel/server prisma:generate` | 重新生成 Prisma Client |
| `pnpm --filter @ai-novel/server prisma:deploy` | 生产环境 `migrate deploy` |

所有 server 侧 Prisma 命令都会带上 `--config prisma.config.ts`，由该配置根据当前数据库模式挑选 schema 与迁移目录，不要绕过它直接调用裸 `prisma` 命令。

### 测试

| 命令 | 说明 |
| --- | --- |
| `pnpm test` | 服务端快速用例集（`server/scripts/run-tests.cjs fast`），会先构建 shared 与 server |
| `pnpm test:client` | 前端用例（`node --experimental-strip-types --test`） |
| `pnpm test:all` | 服务端 fast + integration，再加前端用例 |
| `pnpm --filter @ai-novel/server test:integration` | 只跑集成用例 |
| `pnpm --filter @ai-novel/server test:planner` | 规划器用例 |
| `pnpm --filter @ai-novel/server test:tools` | 工具层用例 |
| `pnpm --filter @ai-novel/server test:runtime` | 运行时用例 |
| `pnpm --filter @ai-novel/server test:routes` | 路由用例（`run-route-tests.cjs`） |
| `pnpm --filter @ai-novel/server test:book-analysis` | 拆书分析用例 |
| `pnpm test:migrations` | 干净库迁移重放校验，需要 bash |

### 质量与检查

| 命令 | 说明 |
| --- | --- |
| `pnpm lint` | 三个包依次做 TypeScript 严格检查 |
| `pnpm format` / `pnpm format:check` | Prettier 写入 / 只校验 |
| `pnpm audit` / `pnpm audit:fix` | 依赖漏洞审计（moderate 及以上） |
| `pnpm check:deps` | 校验 workspace 依赖与 Node/pnpm 版本 |
| `pnpm check:prisma-parity` | 校验双 Prisma schema 是否对齐 |
| `pnpm check:docs-manifest` | 校验文档清单与实际文件一致 |

### 运维与分析脚本

| 命令 | 说明 |
| --- | --- |
| `pnpm --filter @ai-novel/server rag:eval` | RAG 检索效果评测 |
| `pnpm --filter @ai-novel/server audit:director-recovery-samples` | 审计导演模式恢复样本 |
| `pnpm --filter @ai-novel/server backfill:director-draft-baselines` | 回填章节草稿基线（需 `DIRECTOR_BASELINE_WRITE=1`） |
| `node scripts/summarize-llm-repair-log.cjs` | 汇总 LLM 修复日志 |

---

## 技术栈与架构

### 前端（`client`）

| 领域 | 选型 |
| --- | --- |
| 框架 | React 19 + TypeScript 5.9 |
| 构建 | Vite 7 |
| 路由 | React Router 7 |
| 数据层 | TanStack Query 5 + axios |
| 状态 | Zustand 5 |
| 富文本 | Plate（platejs）+ Slate |
| 对话 UI | assistant-ui |
| 图与可视化 | @xyflow/react、d3 |
| UI 基建 | Radix UI + Tailwind CSS 3 + framer-motion + sonner |
| 本地缓存 | idb-keyval |

### 后端（`server`）

| 领域 | 选型 |
| --- | --- |
| 运行时 | Node.js 20/22/24 + Express 5 |
| 开发执行 | `tsx watch` |
| ORM | Prisma 7（driver adapter 双库） |
| 校验 | Zod 4 |
| AI 编排 | @langchain/core + @langchain/langgraph + @langchain/openai |
| 安全与日志 | helmet + morgan |
| 图像与存储 | sharp + @aws-sdk/client-s3（本地卷 / S3 兼容二选一） |
| 向量库 | Qdrant（HTTP API） |

### 共享层与站点

- `shared`：跨端类型与工具的唯一事实源，前后端都从这里导入类型（例如 `shared/types/volumePlanning.ts`、`shared/types/timeline.ts`）。修改后需要重新 `pnpm dev:shared` 或 `pnpm build`。
- `site`：对外介绍站，独立于产品前端，通过 `pnpm dev:site` / `pnpm build:site` 使用，并由 `.github/workflows/site-pages.yml` 发布到 GitHub Pages。

### 仓库结构

```text
宝拓墨间/
├── client/                  # 产品前端（React + Vite）
│   └── src/
│       ├── api/             # 按域拆分的 API 客户端（novel/character/knowledge...）
│       ├── components/      # 业务组件（autoDirector、assetLibrary、comic、common...）
│       ├── hooks/           # useSSE、useLlmLiveFeed、useLocalDB 等
│       ├── lib/             # 前端纯逻辑与工作流辅助
│       ├── pages/           # 路由页面（novels、creativeHub、settings...）
│       ├── router/          # 路由表
│       └── store/           # Zustand store（chat、llm、ui、directorRealtime）
├── server/                  # 后端 API 与生产链
│   ├── prisma.config.ts     # 按数据库模式挑选 schema 与迁移目录
│   ├── scripts/             # 测试运行器、迁移守护、数据检查与回填脚本
│   └── src/
│       ├── app.ts           # 入口：环境校验 → 中间件 → 路由 → 后台服务
│       ├── agents/          # Agent 编排、planner、工具注册表与各域工具
│       ├── chains/          # LangChain 链（chat、标题、写法引擎）
│       ├── config/          # validateEnv、database、rag、featureFlags、imageStorage
│       ├── creativeHub/     # Creative Hub 的 LangGraph 状态与工具策略
│       ├── db/              # Prisma 客户端、seed、SQLite pragma 与重试
│       ├── events/          # 事件总线与小说副作用任务队列
│       ├── graphs/          # LangGraph 图（大纲、世界、角色、写法）
│       ├── llm/             # 供应商目录、模型路由、结构化输出与用量统计
│       ├── middleware/      # 校验与访问控制
│       ├── modules/         # 领域模块（timeline、export、comic、drama...）
│       ├── prisma/          # 双 schema + 三套迁移目录
│       ├── routes/          # HTTP 路由（novel、knowledge、rag、settings、health...）
│       ├── services/        # 业务服务（novel、rag、knowledge、image、comic...）
│       └── workers/         # 导演任务队列与后台 worker
├── shared/                  # 跨端类型与工具
├── site/                    # 对外介绍站
├── docs/                    # 文档体系（wiki / api / deployment / releases）
├── images/                  # README 与站点引用的截图素材
├── infra/                   # 独立基础设施编排（Qdrant）
├── scripts/                 # 仓库级脚本（依赖自检、schema 对齐、日志汇总）
├── .github/workflows/       # CI 与站点发布流水线
├── compose.yml              # 一键部署编排（Compose v2）
├── Dockerfile.api           # 后端镜像
└── Dockerfile.web           # 前端静态站镜像
```

### 运行时分层

```text
浏览器（React）
   │  REST + SSE
   ▼
Express 路由层（routes/、modules/*/http/）
   │
   ├─ 服务层（services/）：业务规则、生产链编排、状态回灌
   ├─ Agent 层（agents/ + graphs/ + creativeHub/）：LangGraph 编排与工具调用
   ├─ LLM 层（llm/）：供应商目录、模型路由、结构化输出与修复、用量统计
   └─ 数据层（db/ + prisma/）：Prisma 双适配器
   │
   ├─ 事件总线（events/）→ 小说副作用任务队列
   └─ 后台 worker（workers/、services/rag/）：导演推进、RAG 索引、检索追踪清理
```

后端启动时会拉起一组后台服务，见 `server/src/app.ts` 的 `initializeBackgroundServices()`：RAG 索引 worker、检索追踪保留策略、小说副作用 worker、导演 worker、未完成恢复任务重建、短篇生产恢复、模型密钥装载、系统资源初始化、拆书与流水线看门狗，以及日志保留清理。

### 当前系统关注点

- **可恢复性优先**：长链路任务的每个阶段都有状态、租约与恢复入口，进程被杀不会丢失已完成产物。
- **结构化优先**：AI 输出走 schema 约束与结构化修复，确定性代码只做校验与落库，不反过来猜测语义。
- **上下文预算显式化**：每轮注入都记录保留 / 压缩 / 丢弃，避免长篇后期上下文线性膨胀。
- **本地优先**：默认 SQLite + 本地图片卷，不依赖任何托管服务即可跑通整本流程。

---

## 工程与质量保障

### 持续集成

`.github/workflows/ci.yml` 在推送与 PR 到 `main` / `develop` 时触发，四个并行 Job 统一使用 pnpm 10.6.0 + Node 22 + `pnpm install --frozen-lockfile`：

| Job | 内容 |
| --- | --- |
| `lint-and-typecheck` | `pnpm lint` → `pnpm format:check` → `pnpm typecheck` |
| `security-audit` | `pnpm audit --audit-level=moderate`（`continue-on-error`，只做提示不阻断） |
| `test` | 起 `postgres:16` 服务容器，`prisma migrate deploy` 后执行 `pnpm test` |
| `build` | `pnpm build` 并上传 `client/dist`、`server/dist` 制品（保留 7 天） |

另有 `.github/workflows/site-pages.yml` 负责介绍站的 GitHub Pages 发布。

### 本地质量闸门

- **启动前环境校验**：`server/src/config/validateEnv.ts` 在 `app.ts` 最前面运行。缺少数据库连接串在开发环境只是回落到 SQLite，生产环境直接报错退出；模型密钥缺失只警告，因为可以在设置页录入；打印配置摘要时会掩码连接串中的账号密码。
- **类型与格式**：`pnpm lint` 对三个包做 `tsc --noEmit`，`pnpm format:check` 用 Prettier 校验 `ts/tsx/js/jsx/json/css/md`。
- **依赖自检**：`pnpm dev` 前置 `scripts/check-deps.cjs`，校验 Node / pnpm 版本与 workspace 依赖是否完整安装。
- **双 Schema 对齐**：`pnpm check:prisma-parity` 防止只改一侧 schema。
- **迁移重放**：`pnpm test:migrations` 在干净库上重放全部迁移（依赖 bash）。
- **文档清单**：`pnpm check:docs-manifest` 校验 `docs/` 索引与实际文件一致。
- **前端错误边界**：`client/src/components/common/ErrorBoundary.tsx` 兜住渲染期异常，避免单个面板崩溃导致整页白屏。

### 长篇生产的运行时保护

- **执行栅栏**：章节正文落盘前后校验 `executionId` 与 `checkpointVersion`，失去租约的旧执行不能覆盖新执行的正文。
- **高内存预留**：结构化大纲、节拍表、章节列表等阶段同一范围内只允许一个任务，预留冲突返回 409 并提示等待。
- **幂等键**：`creationRequestId` 等幂等标识保证重复点击继续、重复消费命令不会产生重复产物。
- **质量债务**：局部质量问题记录为可见债务而不是直接阻断整本生产，只有重规划、无可用正文、受保护内容风险等情况才会停下来等人。

---

## 文档地图

`docs/` 的组织约定见 [Docs 管理约定](./docs/README.md)：根目录只保留对外入口与工具链配置，设计稿、阶段总结、模块计划统一进入子目录。

### 入门与协作

| 文档 | 用途 |
| --- | --- |
| [TASK.md](./TASK.md) | 当前主路线与优先级清单 |
| [AGENTS.md](./AGENTS.md) | 协作与工程约束（人类与 AI Agent 都适用） |
| [docs/DEVELOPER_GUIDE.md](./docs/DEVELOPER_GUIDE.md) | 开发者上手指引；包结构与端口以本 README 和 `compose.yml` 为准 |
| [docs/api/README.md](./docs/api/README.md) | API 说明 |
| [docs/architecture/testing.md](./docs/architecture/testing.md) | 后端 `node:test` 的运行方式与目录约定 |
| [docs/deployment/docker-compose.md](./docs/deployment/docker-compose.md) | Compose 部署细节 |
| [docs/releases/release-notes.md](./docs/releases/release-notes.md) | 完整版本更新历史 |

### 长篇生产核心 Wiki

| 文档 | 解释了什么 |
| --- | --- |
| [long-form-narrative-context.md](./docs/wiki/workflows/long-form-narrative-context.md) | 超长篇叙事上下文的边界与分层策略 |
| [longform-memory-windowing.md](./docs/wiki/workflows/longform-memory-windowing.md) | 记忆窗口与优先级截断规则 |
| [volume-rolling-summary.md](./docs/wiki/workflows/volume-rolling-summary.md) | 卷级滚动摘要的生成与注入 |
| [long-form-production-acceptance.md](./docs/wiki/workflows/long-form-production-acceptance.md) | 长篇生产成熟度的十维验收标准与固定样本记录 |
| [chapter-production-chain.md](./docs/wiki/workflows/chapter-production-chain.md) | 章节生产链的阶段与状态流转 |
| [auto-director-runtime.md](./docs/wiki/workflows/auto-director-runtime.md) | 自动导演的运行时与恢复语义 |
| [volume-planning.md](./docs/wiki/workflows/volume-planning.md) | 分卷规划规则 |
| [timeline-constraint-layer.md](./docs/wiki/workflows/timeline-constraint-layer.md) | 时间线约束层 |
| [novel-fact-ledger.md](./docs/wiki/workflows/novel-fact-ledger.md) | 事实账本 |
| [payoff-ledger-contract.md](./docs/wiki/workflows/payoff-ledger-contract.md) | 伏笔与兑现账本合同 |
| [quality-debt-attribution.md](./docs/wiki/workflows/quality-debt-attribution.md) | 质量债务归因 |
| [llm-call-guards-and-output-budget.md](./docs/wiki/workflows/llm-call-guards-and-output-budget.md) | 调用护栏与输出预算 |
| [database-protection.md](./docs/wiki/workflows/database-protection.md) | 数据保护与快照约束 |

完整索引见 [Wiki Index](./docs/wiki/README.md)。本仓库另有两份评估报告：[优化报告](./OPTIMIZATION_REPORT.md) 与 [超长篇能力评估](./LONG_FORM_CAPABILITY_REPORT.md)。

---

## 常见问题排查

### 启动阶段

**`pnpm dev` 刚启动就退出，控制台打印"环境变量校验失败"**
按提示看具体哪一项：本地开发只有 `DATABASE_URL` 格式非法（既不是 `postgresql://` / `postgres://` 也不是 `file:`）才会拦下来；完全不写反而合法，会回落到 `file:./dev.db`。模型密钥缺失只是警告，不影响启动。

**Windows 下 pnpm 脚本报"命令不存在"或参数解析异常**
把脚本 shell 指到 Git Bash：`pnpm config set script-shell "C:\\Program Files\\Git\\bin\\bash.exe"`。`pnpm test:migrations` 这类 `.sh` 脚本同样需要 bash（Git Bash 或 WSL）。

**3000 端口被占用**
`pnpm dev:server` 前置的 `scripts/stop-stale-dev-server.cjs` 会清理本项目残留的开发进程；如果是别的程序占用，改 `server/.env` 里的 `PORT`，Vite 的 `/api` 代理会跟着 `PORT` 走。

**前端能打开但所有接口 404 / CORS 报错**
开发环境不配 `VITE_API_BASE_URL` 时前端请求 `/api`，由 Vite 代理转发到 `http://127.0.0.1:${PORT}`，这是最省事的路径。用局域网 IP 访问时，若配置了指向 `localhost` 的 `VITE_API_BASE_URL`，前端会自动把主机名换成当前页面的 IP；如果仍被拦，检查 `ALLOW_LAN` 与 `CORS_ORIGIN`。

### 数据库

**切换 SQLite / PostgreSQL 后 Prisma 报表不存在**
两套库的迁移目录是分开的，切换后需要对新库执行一次迁移。不要绕过 `server/prisma.config.ts` 直接跑裸 `prisma` 命令，否则会挑错 schema。

**改了数据模型，另一种数据库启动失败**
说明只改了一侧 schema，跑 `pnpm check:prisma-parity` 定位差异。

**担心正文被覆盖或写坏**
章节落盘有执行栅栏保护，另有自动版本快照（数量由 `NOVEL_SNAPSHOT_RETENTION_COUNT` 控制，手动快照不计入）。误操作后可用 `pnpm db:restore` 恢复开发数据，`pnpm db:prune-snapshots` 清理过量快照。

### 模型调用

**模型返回 401 / 超时 / 连不上**
先在「设置 → 模型供应商」用连通性测试定位是密钥、Base URL 还是网络问题。第三方兼容网关需要覆盖对应的 `<前缀>_BASE_URL`。单次请求超时用 `LLM_REQUEST_TIMEOUT_MS` 调整，长输出阶段可以适当放大。

**结构化输出反复失败**
系统会走 schema 约束与结构化修复重试，修复日志可以用 `node scripts/summarize-llm-repair-log.cjs` 汇总，看是哪个阶段、哪个 schema 反复不合法，再决定换模型还是收窄提示词。

### RAG

**检索结果为空**
按顺序确认：`RAG_ENABLED` 是否开启（Compose 默认关闭，需要 `--profile rag`）、Qdrant 是否可访问、Embedding 供应商密钥是否配置、目标内容是否已完成索引。索引是异步 worker 推进的，刚导入的内容需要等一会儿。

**换了 Embedding 模型后检索质量异常**
不同模型的向量空间不兼容。改模型时同步调整 `EMBEDDING_VERSION` 或换一个 `QDRANT_COLLECTION`，让旧向量与新向量分开，然后重建索引。

### 长篇生产

**提示"高内存任务冲突"或返回 409**
同一小说的同一范围（整本 / 单卷 / 单章）只允许一个高内存阶段在跑。等前一个结构化大纲或章节列表任务结束再试，不要同时对多个卷点生成。

**任务卡在某个阶段不动**
看任务中心的阶段与暂停原因。进程被杀掉的任务会由启动时的恢复流程和看门狗重新接上，已完成章节不会重复生成；重复点击继续也不会产生重复产物。

**长篇后期开始出现重复剧情、已解决的冲突又冒出来**
优先检查卷级摘要是否生成、伏笔账本里是否有大量长期未回收的开放钩子。不要把所有钩子都设成 blocking，否则局部伏笔未回收会把整本生产停下来。

### Docker 部署

**Buildx 构建中途报路径相关错误**
部署目录路径改成纯英文，不要包含中文或空格。

**`web` 能打开但接口 502**
`api` 容器可能还没通过健康检查。用 `docker compose logs -f api` 看启动日志，健康检查探的是 `/api/health/live`。

**改了根 `.env` 但容器行为没变**
需要重建：`docker compose up -d --build`。只 `restart` 不会重新注入构建期变量。

## 当前路线图

路线图的唯一事实源是仓库根目录的 [TASK.md](./TASK.md)，下面是面向读者的摘要。需要精确到某一条待办的状态时请直接看该文件。

### P0：唯一主线

当前只有一条 P0 主线，其他能力一律按"是否服务这条主线"排序：

> 让一个完全不会写作的用户，输入一句模糊灵感后，系统能在低认知负担下持续推进整本小说，而不是只会局部生成单章。

对应的工程重心是把系统重心从"文本生产"转向"长篇叙事控制"，优先保证整本成书率，而不是局部功能密度。

### 默认主链的 12 个环节

新增能力如果无法自然接入下面这条链，就不应该挤进当前 P0：

1. 书级 framing
2. 故事宏观规划 / 约束引擎
3. 动态角色系统
4. 卷战略建议
5. 卷战略 critique
6. 卷骨架
7. 卷内节奏板
8. 当前卷章节列表
9. 章节细化 bundle
10. 章节执行 / runtime
11. state sync
12. narrative audit / replan

### 活跃子线

| 子线 | 关注点 |
| --- | --- |
| P0-A | 真实 Prisma 数据的端到端只读抽样审计，覆盖旧项目接管、服务重启后手动恢复、章节批量执行、命令诊断与缺正文账本基线 |
| P0-B | 已落地资产的更深消费：章节任务单门禁、质量闭环、`patch_first` 修复策略、阶段级模型路由与 fallback |
| P0-C / P0-D | 卷级工作台二期与结构化规划资产前移，让卷级账本视图成为主视图 |
| P0-E / P0-E0 / P0-E1 | 状态·审计·Replan 闭环、执行面隔离（独立 Director Worker + 命令队列 + 轻量 projection 轮询）、统一状态源与手动/导演共线 |
| P0-F | 新手首启与快速开书入口收敛，关键节点只保留一个推荐的下一步 |
| P0-G | 拆书工作台渐进式流程（前 N 片段试跑 → 扩范围继续）与 Chapter Editor V2 |
| P0-TechDebt | 技术债收口，继续瘦身 `NovelDirectorService` 与 `DirectorRuntimeStore` |

### 工程约束

- **AI-first**：意图识别、任务分类、规划、路由、结构判断等核心行为优先用 AI 结构化输出实现，不靠关键词表、硬编码规则或伪 AI fallback 兜底。
- **新手优先**：优先降低认知负担、减少前置决策、提供默认推荐。
- **Prompt 治理**：新增产品级 prompt 只能进入 `server/src/prompting/`，并纳入 PromptAsset 与 registry 治理，不在业务服务里继续内联扩写。

### 自评完成度

TASK.md 记录的阶段自评（非精确度量，仅用于判断优先级）：

- 自动导演 Runtime MVP 底座：约 85%
- 按完整统一运行时目标衡量：约 70%
- 按完整 P0"让新手稳定完成整本小说"产品目标衡量：约 55%–60%

另外两点值得知道：自动导演主执行链当前**不走 LangGraph**，LangGraph 只在 `DirectorLangGraphPilot` 做低风险试点，后续仅作为编排、interrupt、resume、trace 的外壳接入；服务重启后的策略是"标记待手动恢复 → 用户确认 → 从真实资产断点继续"，不做后台静默续跑。

### P1：从"能写完整本"到"能稳定写好"

角色弧光与关系演化引擎、节奏与篇幅控制系统、整本文风稳定性、结构化记忆升级、长篇质量趋势评分体系。写法引擎的细化优化、风格检测与重写联动、多层写法控制也归在这一阶段。

### P2：从"有引擎"到"成熟产品化"

面向小白的全流程作品工厂、多模式创作策略、题材与写法模板化、可视化长篇控制台、完结前全书巡检与修复计划。

> TASK.md 里仍保留 P2-A「Electron 桌面化」的历史计划，但 2026-09-02 的「聚焦 Web 端」变更已移除桌面安装包与 `desktop/` 工程，当前形态只提供 Web 端。阅读该章节时请以此为准。

### 当前不优先做的事

复杂专家编辑器、低价值界面重构、只优化单章而不优化整本稳定性的局部体感、高自由度但高认知负担的专家配置项、与长篇主链弱相关的多入口生成按钮、没有底层结构模型支撑的可视化，以及让新手在首屏就要理解大量内部字段与模式的设计。

统一判断标准只有一句：

> 这个能力，能不能显著提升一个完全不会写作的人把整本小说写到完结的成功率？

---

## 交流反馈

使用中遇到问题、发现 Bug 或者有功能建议，欢迎加群交流，也欢迎直接开 Issue。

<img src="./images/群2.png" alt="交流群二维码" width="280" />

反馈时如果能附上下面这些信息，定位会快很多：

- 部署方式（Docker Compose / 本地源码）
- 使用的模型供应商与模型名
- 出问题的阶段（创建项目 / 卷规划 / 章节生成 / 审校修复 / 导出）
- 服务端日志片段（注意去掉 API Key 等敏感信息）

---

## 支持项目

项目长期免费开源。如果它确实帮你写完了一本书，可以请作者喝杯咖啡。

<p align="center"><img src="./images/c838dd8eb412d6fde536b2a43f53e95.jpg" alt="支付宝捐赠二维码" width="320" /></p>

比捐赠更有价值的支持方式：点一个 Star、提一个有复现步骤的 Issue、或者把你的长篇实践经验写成反馈。

---

## 贡献方式

1. Fork 仓库并从 `main` 切出特性分支。
2. 本地跑通质量闸门：`pnpm lint`、`pnpm typecheck`、`pnpm format:check`、`pnpm test`。
3. 提交 PR，按 [`.github/pull_request_template.md`](./.github/pull_request_template.md) 填写变更说明与验证方式。

提交前请先读这两份文件：

- [CONTRIBUTING.md](./CONTRIBUTING.md) — 贡献流程与协作约定
- [CLA.md](./CLA.md) — 贡献者许可协议

向本仓库提交贡献即表示你已阅读并同意 CLA。几条容易踩的约定：

- 新增产品级 prompt 只能进入 `server/src/prompting/`，不要在业务服务里内联扩写。
- 改动 Prisma 模型时必须同步 PostgreSQL 与 SQLite 两份 schema，并通过 `pnpm check:prisma-parity`。
- 面向用户可见的变更请同时更新 [docs/releases/release-notes.md](./docs/releases/release-notes.md)。
- 新增文档需要能通过 `pnpm check:docs-manifest`，并遵守 [docs/README.md](./docs/README.md) 的目录约定。

---

## 致谢

感谢 [@ystyleb](https://github.com/ystyleb) 对项目的贡献与支持。

同时感谢所有提 Issue、反馈长篇写作实际问题和参与讨论的使用者——长篇稳定性方面的多数改动都来自真实创作过程中暴露的问题。

---

## 说明

- 本 README 描述的是当前仓库状态。路线图、待办与阶段自评以 [TASK.md](./TASK.md) 为准，用户可见的历史变更以 [docs/releases/release-notes.md](./docs/releases/release-notes.md) 为准。
- 项目当前只提供 Web 端形态，桌面安装包已于 2026-09-02 移除。部分历史文档中仍可能出现 `desktop/` 工程或旧端口的描述，遇到冲突时以本 README 和 `compose.yml` 为准。
- 生成内容由第三方大模型产生，作者需要自行对最终作品的合规性、原创性与发布风险负责。项目本身不对模型输出做版权担保。
- 模型调用会产生实际费用。开始长篇批量生产前建议先跑小样本确认成本，并关注任务中心里的 token 统计。

---

## License

本项目采用双许可模式：

- **默认社区许可**：[GNU Affero General Public License v3.0 only（AGPL-3.0-only）](./LICENSE)
- **商业授权**：以本项目或其修改版本作为后端 / 核心服务，向第三方提供 SaaS、托管、代运维或类似服务的服务型商业使用，需要单独取得项目维护者的商业授权

版权归属见 [NOTICE](./NOTICE)：AI Novel Writing Assistant 2，Copyright 2026 ExplosiveCoderflome and contributors。

使用与分发时请遵守开源许可条款，并在适用场景下取得相应授权。

---

## 友情链接

- [LINUX DO](https://linux.do/)

