# 开发者指南

欢迎参与宝拓墨间项目开发！本指南将帮助您快速上手项目的开发工作流程。

## 目录

- [开发环境设置](#开发环境设置)
- [项目结构](#项目结构)
- [开发工作流](#开发工作流)
- [代码规范](#代码规范)
- [测试指南](#测试指南)
- [数据库操作](#数据库操作)
- [调试技巧](#调试技巧)
- [常见问题](#常见问题)

## 开发环境设置

### 前置要求

- Node.js >= 20.19.0 或 >= 22.12.0 或 >= 24.0.0
- pnpm >= 10.6.0
- PostgreSQL >= 14（生产环境）或 SQLite（开发环境）

### 安装步骤

1. **克隆仓库**

```bash
git clone https://github.com/your-org/baotuo-mojian.git
cd baotuo-mojian
```

2. **安装依赖**

```bash
pnpm install
```

3. **配置环境变量**

```bash
cp .env.example .env
```

编辑 `.env` 文件，至少配置以下必需项：

- `DATABASE_URL`: 数据库连接 URL
- `OPENAI_API_KEY` 或其他 LLM 提供商密钥

4. **初始化数据库**

```bash
# 运行数据库迁移
pnpm db:migrate

# （可选）填充种子数据
pnpm db:seed
```

5. **启动开发服务器**

```bash
pnpm dev
```

访问 http://localhost:18080 查看应用。

## 项目结构

```
baotuo-mojian/
├── client/              # 前端应用 (React + Vite)
│   ├── src/
│   │   ├── components/  # UI 组件
│   │   ├── pages/       # 页面组件
│   │   ├── hooks/       # 自定义 Hooks
│   │   └── lib/         # 工具函数
│   └── package.json
│
├── server/              # 后端应用 (Express + TypeScript)
│   ├── src/
│   │   ├── routes/      # API 路由
│   │   ├── services/    # 业务逻辑层
│   │   ├── middleware/  # 中间件
│   │   ├── llm/         # LLM 集成
│   │   ├── db/          # 数据库配置
│   │   └── prisma/      # Prisma schema 和迁移
│   └── package.json
│
├── shared/              # 共享类型和工具
│   ├── src/
│   │   └── types/       # TypeScript 类型定义
│   └── package.json
│
├── desktop/             # 桌面应用 (Electron)
│   └── package.json
│
├── docs/                # 项目文档
├── scripts/             # 构建和工具脚本
└── package.json         # 根 package.json
```

## 开发工作流

### 常用命令

```bash
# 启动开发服务器（前端 + 后端）
pnpm dev

# 仅启动后端
pnpm dev:server

# 仅启动前端
pnpm dev:client

# 类型检查
pnpm typecheck

# 代码检查
pnpm lint

# 代码格式化
pnpm format

# 格式检查（不修改文件）
pnpm format:check

# 运行测试
pnpm test

# 运行所有测试（包括集成测试）
pnpm test:all

# 构建生产版本
pnpm build

# 安全审计
pnpm audit
```

### 数据库操作

```bash
# 创建新迁移
pnpm db:migrate

# 打开 Prisma Studio（数据库 GUI）
pnpm db:studio

# 重置数据库（危险操作！）
pnpm --filter @ai-novel/server prisma migrate reset

# 测试数据库迁移
pnpm test:migrations
```

## 代码规范

### TypeScript

- 启用 `strict` 模式
- 避免使用 `any`，优先使用具体类型或 `unknown`
- 使用 `interface` 定义对象类型，使用 `type` 定义联合类型
- 导出的函数和类型必须添加 JSDoc 注释

### React

- 使用函数组件和 Hooks
- 组件文件名使用 PascalCase：`MyComponent.tsx`
- 自定义 Hooks 以 `use` 开头：`useNovelData.ts`
- Props 类型定义在组件上方

```typescript
interface MyComponentProps {
  title: string;
  onSubmit: (data: FormData) => void;
}

export function MyComponent({ title, onSubmit }: MyComponentProps) {
  // ...
}
```

### 代码格式化

项目使用 Prettier 进行代码格式化。保存文件时会自动格式化，或手动运行：

```bash
pnpm format
```

### 提交规范

提交信息遵循 [Conventional Commits](https://www.conventionalcommits.org/)：

```
<type>(<scope>): <subject>

<body>

<footer>
```

类型（type）：
- `feat`: 新功能
- `fix`: 修复 Bug
- `docs`: 文档更新
- `style`: 代码格式调整
- `refactor`: 重构
- `test`: 测试相关
- `chore`: 构建/工具链相关

示例：

```
feat(novel): 添加章节自动审核功能

实现了基于 LLM 的章节质量自动审核，支持：
- 情节连贯性检查
- 人物性格一致性检查
- 文风匹配度检查

Closes #123
```

## 测试指南

### 单元测试

测试文件位于 `server/tests/` 目录，使用 Node.js 内置测试运行器。

```bash
# 运行所有测试
pnpm test

# 运行特定测试文件
pnpm --filter @ai-novel/server test:routes
```

### 编写测试

```javascript
import { test } from "node:test";
import assert from "node:assert";

test("should validate environment variables", () => {
  const result = validateEnvironment();
  assert.strictEqual(result.valid, true);
});
```

### 集成测试

```bash
# 运行集成测试（需要 PostgreSQL）
pnpm test:integration
```

## 数据库操作

### Prisma 工作流

1. **修改 schema**

编辑 `server/src/prisma/schema.prisma`：

```prisma
model Novel {
  id        String   @id @default(cuid())
  title     String
  content   String?
  createdAt DateTime @default(now())
}
```

2. **创建迁移**

```bash
pnpm db:migrate
```

3. **应用迁移**

迁移会自动应用到开发数据库。生产环境使用：

```bash
pnpm --filter @ai-novel/server prisma:deploy
```

### 查询示例

```typescript
import { prisma } from "./db/prisma";

// 创建
const novel = await prisma.novel.create({
  data: {
    title: "新小说",
    content: "正文内容...",
  },
});

// 查询
const novels = await prisma.novel.findMany({
  where: {
    userId: "user123",
  },
  orderBy: {
    createdAt: "desc",
  },
});

// 更新
await prisma.novel.update({
  where: { id: novel.id },
  data: { title: "更新后的标题" },
});

// 删除
await prisma.novel.delete({
  where: { id: novel.id },
});
```

## 调试技巧

### 后端调试

1. **日志输出**

```typescript
console.log("[debug]", data);
console.warn("[warning]", issue);
console.error("[error]", error);
```

2. **VS Code 调试配置**

创建 `.vscode/launch.json`：

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Server",
      "runtimeExecutable": "pnpm",
      "runtimeArgs": ["dev:server"],
      "skipFiles": ["<node_internals>/**"]
    }
  ]
}
```

### 前端调试

使用 React DevTools 和浏览器开发者工具。

### 数据库调试

```bash
# 打开 Prisma Studio
pnpm db:studio

# 或直接查看数据库
pnpm --filter @ai-novel/server db:inspect
```

## 常见问题

### Q: pnpm install 失败

**A**: 检查 Node.js 和 pnpm 版本是否符合要求：

```bash
node --version  # >= 20.19.0
pnpm --version  # >= 10.6.0
```

### Q: 数据库连接失败

**A**: 检查 `.env` 中的 `DATABASE_URL` 配置：

- PostgreSQL: `postgresql://user:password@localhost:5432/dbname`
- SQLite: `file:./dev.db`

密码中的特殊字符需要 URL 编码。

### Q: TypeScript 编译错误

**A**: 确保先生成 Prisma Client：

```bash
pnpm --filter @ai-novel/server prisma:generate
```

### Q: LLM 调用失败

**A**: 检查以下几点：

1. API Key 是否正确配置
2. 网络连接是否正常
3. 是否超出了 API 配额

### Q: 前端开发服务器无法访问后端

**A**: 检查 Vite 配置中的代理设置（`client/vite.config.ts`），确保代理到正确的后端地址。

## 获取帮助

- 查看 [API 文档](./api/README.md)
- 查看 [部署文档](./deployment/)
- 提交 [Issue](https://github.com/your-org/baotuo-mojian/issues)
- 加入开发者讨论群

## 下一步

- 阅读 [贡献指南](./CONTRIBUTING.md)
- 查看 [架构文档](./architecture/README.md)
- 了解 [发布流程](./deployment/release.md)
