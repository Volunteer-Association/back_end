# 前后端分离管理系统

本项目由 Vue 3 前端和 NestJS 后端组成，后端使用 MySQL 持久化用户数据并通过 JWT 保护接口。前后端分别维护依赖、环境变量和构建流程；本地开发通过 Vite 代理 API，容器部署通过 Nginx/Compose 转发请求。

## API 文档

启动后端后打开 `http://localhost:3000/api/` 查看 Swagger UI。认证、账号资料、OAuth、系统资源、文件上传和演示接口均按业务分组并标注请求字段、允许值、示例及常见状态码。需要登录的接口在 Swagger 中点击 **Authorize**，填入登录接口返回的 Access Token（只填令牌本身，不加 `Bearer ` 前缀）；Refresh Token 由 HttpOnly Cookie 管理，不应手动填写或暴露给前端代码。

说明：`/demo` 是尚未连接持久化存储的占位演示接口，文档已明确标注其仅返回模拟结果。真实业务数据请接入对应实体和仓储后再开放使用。

## 赞助

如果这个项目对你有帮助，欢迎自愿赞助，感谢支持与鼓励！

| 支付宝 | 微信 |
|:---:|:---:|
| <img src="./back-end-backend/public/zfb.jpg" alt="支付宝收款码" width="220"> | <img src="./back-end-backend/public/wx.jpg" alt="微信收款码" width="220"> |

> **图片链接提示：** 当前收款码链接带有有效期，可能已经过期而无法显示。建议将收款码图片放入仓库的 `docs/images/` 并改用相对路径，或替换为长期有效的公开图片链接。

## npm 镜像设置

如需使用国内 npm 镜像，可运行：

```bash
npm config set registry https://registry.npmmirror.com/
```

恢复 npm 官方镜像：

```bash
npm config set registry https://registry.npmjs.org/
```

## 技术栈

- 前端：Vue 3、TypeScript、Vite、Vue Router、Pinia、Element Plus。
- 后端：NestJS、TypeScript、TypeORM、MySQL、JWT、Swagger。
- 部署：Docker、Docker Compose、Nginx。

## 项目结构

```text
back-end/
├── back-end-frontend/
│   ├── src/
│   │   ├── api/                 # Axios 客户端及按业务拆分的 API
│   │   ├── assets/              # 样式、图片和页面资源
│   │   ├── components/          # 可复用 UI 组件
│   │   ├── composables/         # 可复用组合式逻辑
│   │   ├── layouts/             # 登录后的应用布局
│   │   ├── router/              # 页面路由与登录访问控制
│   │   ├── stores/              # Pinia 状态（当前包含认证状态）
│   │   ├── types/               # Vite 和应用类型声明
│   │   ├── utils/               # 通用工具
│   │   └── views/               # 页面视图
│   ├── public/                  # 构建时原样复制的静态文件
│   ├── nginx.conf               # SPA 回退和 API 反向代理
│   └── package.json
├── back-end-backend/
│   ├── config/
│   │   └── config.ts            # 环境变量映射、优先级和启动校验
│   ├── mysql/
│   │   ├── entities/            # 集中维护认证账号、用户资料、角色及业务实体
│   │   ├── repositories/        # 集中封装 TypeORM 数据访问
│   │   ├── migrations/          # 已有数据库的显式 SQL 变更
│   │   ├── connect.ts           # MySQL 连接配置，关闭自动同步
│   │   ├── mysql.module.ts      # 注册并导出数据库仓储
│   │   └── init.sql             # 本地数据库初始化 SQL
│   ├── src/
│   │   ├── demo/                # 受保护的示例 CRUD 接口
│   │   ├── guards/              # JWT 鉴权守卫
│   │   ├── modules/
│   │   │   ├── auth/            # 登录、JWT 签发和认证
│   │   │   ├── system/          # 系统信息、上传和音频接口
│   │   │   └── users/           # 用户业务服务
│   │   ├── app.module.ts        # 应用模块装配
│   │   └── main.ts              # Nest 启动和全局 HTTP 配置
│   ├── test/                    # 端到端测试
│   ├── .env.example             # 后端环境变量模板
│   ├── healthcheck.js           # 容器健康检查
│   └── package.json
├── docker-compose.yml           # 多容器开发/部署编排
├── Dockerfile                   # 后端容器构建
└── README.md
```

### 后端依赖方向

```text
HTTP 请求 -> Controller -> Service -> Repository -> Entity -> MySQL
```

- `Controller` 负责路由、参数和 HTTP 响应；`DTO` 负责输入类型及校验。
- `Service` 编排业务逻辑，不直接承担数据库结构定义。
- `Repository` 放在 `mysql/repositories/`，封装 TypeORM 查询。
- `Entity` 放在 `mysql/entities/`，统一由 `entities/index.ts` 的 `DATABASE_ENTITIES` 清单注册。
- 需要数据库的业务 Nest module 显式导入 `MysqlModule`。新增实体不需要在业务 module 或 `AppModule` 中重复维护 TypeORM 实体列表。

## 环境准备和本地启动

需要 Node.js `>=22.14.0`、npm `>=10.9.2` 和可访问的 MySQL。

### 1. 配置后端

在 `back-end-backend` 目录复制 `.env.example` 为 `.env`，再填写本地数据库和 JWT 配置：

```dotenv
NODE_ENV=development
PORT=3000
SERVER_IP=0.0.0.0
PREFIX=/static/file
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173

SQL_HOST=localhost
SQL_PORT=3306
SQL_DATABASE=back_end
SQL_USERNAME=app_user
SQL_PASSWORD=replace_with_local_database_password
SQL_TIMEZONE=+08:00

JWT_SECRET=replace_with_a_random_secret_of_at_least_32_characters

GITEE_CLIENT_ID=your_gitee_client_id
GITEE_CLIENT_SECRET=your_gitee_client_secret
GITEE_CALLBACK_URL=http://localhost:3000/auth/oauth/gitee/callback
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
GITHUB_CALLBACK_URL=http://localhost:3000/auth/oauth/github/callback
OAUTH_FRONTEND_URL=http://localhost:5173
```

`JWT_SECRET` 必须至少 32 个字符。Access Token 有效期固定为 15 分钟，Refresh Token 有效期固定为 7 天；旧的 `JWT_EXPIRES_IN` 不再读取。不要提交 `.env`、真实数据库密码、JWT 密钥或 OSS 密钥。需要上传功能时，再配置 `.env.example` 中列出的 `OSS_*` 变量。Gitee/GitHub 的客户端 ID 和密钥只由后端读取；提供方应用中登记的回调地址必须与对应 `*_CALLBACK_URL` 完全一致。HTTPS 生产环境必须把两个回调 URL 和 `OAUTH_FRONTEND_URL` 配置为 HTTPS 公网地址。若公网通过 Nginx `/api/` 代理后端，回调地址应包含 `/api/auth/oauth/<provider>/callback`。

OSS 文件上传需同时配置 `OSS_REGION`（如 `oss-cn-guangzhou`，填写地域标识而不是完整 Endpoint）、`OSS_ACCESS_KEY_ID`、`OSS_ACCESS_KEY_SECRET` 和 `OSS_BUCKET`。这些变量已列在 `back-end-backend/.env.example`；请替换示例值，且不要提交真实密钥。

从 `back-end-backend` 运行：

```bash
npm install
npm run start:dev
```

后端使用 `config/config.ts` 读取配置。环境文件按 `.env.<NODE_ENV>`、兼容的 `.env.dev`/`.env.prod`、`.env` 的顺序加载；进程环境变量优先于文件。修改环境文件后重启后端。`SQL_UESRNAME` 仅作为旧拼写兼容项，新配置应使用 `SQL_USERNAME`。

首次创建本地数据库时，先手动创建并选择 `.env` 中 `SQL_DATABASE` 指定的数据库，再执行 `back-end-backend/mysql/init.sql`。该脚本是唯一的新库结构定义；不再维护重复的 `pms_user.sql`。`pms_user` 只保存登录账号、密码哈希、状态和登录元数据；`users` 保存邮箱、昵称、头像、手机号、性别等用户详情；`roles` 保存角色定义，`user_roles` 用 `role_id` 与雪花 `user_id` 关联用户和角色。OAuth、Refresh Token、文件和日志也关联 `pms_user.user_id`。各表字段均有中文注释。

角色不存放在 `pms_user` 或 `users` 中。初始化时会创建 `user` 和 `admin` 两个基础角色；新注册/第三方登录用户默认获得 `user` 角色。首次管理员授权由数据库管理员按实际账号执行：`INSERT INTO user_roles (user_id, role_id) SELECT user_id, id FROM pms_user WHERE login_name = '实际账号' AND NOT EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = pms_user.user_id AND r.role_key = 'admin');`。不要直接修改用户表中的角色字段。

本地注册使用邮箱验证码：前端先调用 `POST /auth/register/email-code`，再调用 `POST /auth/register` 提交用户名、邮箱、密码和验证码。注册时会将用户名同步为用户详情表中的默认昵称；成功注册时 `pms_user.last_login_ip`、`last_login_time` 记录来源 IP 与登录时间，后续成功登录会更新这两个字段。审计日志也会记录登录/注册请求 IP。验证码有效期由 `EMAIL_EXPIRES`（毫秒）控制，默认 5 分钟；邮箱重发间隔由 `EMAIL_VERIFICATION_COOLDOWN`（秒）控制，默认 60 秒；最多允许错误尝试 5 次。数据库只保存验证码的 HMAC 摘要，注册成功后验证码在事务中消费，并自动创建 `pms_user`、`users` 和 `user_roles` 记录，随后直接登录。发码接口对已注册邮箱返回相同的通用提示以减少邮箱枚举。SMTP 配置使用 `EMAIL_HOST`、`EMAIL_PORT`、`EMAIL_SECURE`、`EMAIL_USER`、`EMAIL_PASS` 和可选 `EMAIL_FROM`；SMTP 凭据要么全部配置，要么全部留空。未配置时邮件验证码接口会明确报错，不影响已有登录功能。

雪花 ID 使用 `SNOWFLAKE_WORKER_ID`（0–1023）区分节点；开发环境默认值为 `0`，生产环境必须显式配置。连接同一数据库的每个并行后端实例必须使用唯一节点号，否则无法保证跨进程 ID 唯一。生成的 ID 不会过期，作为账户标识可长期使用；雪花时间戳位有固定算法范围，当前纪元设置支持至约 2093 年。

### 第三方登录与本地用户关联

登录页只向后端发起 Gitee/GitHub 登录。后端负责生成授权地址、校验 OAuth `state`、使用服务端密钥交换授权码并获取第三方用户资料。浏览器只会收到短时、一次性的登录交换码；前端再向后端兑换本地登录凭证，JWT 不放在回调 URL 中。第三方访问令牌不会保存到本地数据库。

首次直接使用某个第三方账号登录时，后端在 `pms_user` 建立待完善的认证账号，在 `users` 创建用户详情，并默认关联 `user` 角色；`oauth_identities` 保存唯一的“提供方 + 提供方用户 ID -> 本地用户”关系。OAuth 回调后若账号仍使用系统生成的内部名，或尚未设置本地密码，前端会进入“账号安全与绑定”完善页，而不是跳到首页。用户在此设置自己选择的本地登录账号和密码，后续登录不依赖生成的系统名；第三方快捷登录仍保留。已有完整本地账号的绑定身份登录后正常进入原页面。已登录用户也可以从导航栏的“账号绑定”进入，主动将 Gitee 或 GitHub 关联到当前本地账号。不会仅凭邮箱自动合并，避免不安全的账号接管；若第三方身份已属于其他本地账号，绑定会被拒绝，用户应先登录原账号处理。OAuth 登录不授予管理员权限。导航栏会显示第三方资料头像，头像不可用时显示用户名首字母。

第三方登录用户初始没有本地密码。登录后打开“账号绑定”页面可设置本地密码；已有密码的账号需提供当前密码才能修改。密码以 bcrypt 哈希保存，不会回传或记录明文；设置后可继续用本地登录账号（`pms_user.login_name`）及密码登录。相应接口为已登录用户专用的 `GET /auth/password`（查询是否已设置）和 `POST /auth/password`（设置/修改）。

“账号安全与绑定”页面的个人资料区支持修改昵称、手机号和性别；邮箱目前只读，避免绕过邮箱验证流程。资料通过 `GET /auth/profile` 与 `PATCH /auth/profile` 读写 `users` 表，修改时将当前本地账号写入 `operator`，雪花用户 ID 写入 `operator_id`，并由 `updated_at` 自动记录时间。注册和首次 OAuth 建号时，创建人字段标记为系统，最后操作人字段记录新用户及其雪花 ID；设置/修改本地登录账号或密码也会同步更新 `pms_user.operator` 与 `operator_id`。

本地账号登录与第三方登录都会签发 **15 分钟 Access Token**，专用于业务 API；**7 天 Refresh Token** 仅通过 HttpOnly Cookie 传递，数据库只保存哈希。Access Token 到期后，前端自动请求刷新接口，服务端原子消费旧 Refresh Token 并签发新的一对凭证；Refresh Token 过期、撤销或无效时才需要重新登录。退出登录会撤销当前 Refresh Token。登录、刷新与注销请求启用浏览器凭据传递；生产环境 Cookie 设置为 `Secure; SameSite=None`，因此需要 HTTPS。跨源请求还要求后端 CORS 开启 credentials、`CORS_ORIGINS` 精确列出前端 Origin（协议、域名和端口必须一致，不能使用 `*`），刷新/注销接口也会拒绝缺少 Origin 或不在白名单内的请求。即使 CORS 和 Cookie 设置正确，浏览器隐私策略仍可能阻止完全跨站点的第三方 Cookie；生产部署建议使用同站点子域名或由反向代理统一入口。执行用户表拆分迁移后旧 Refresh Token 和数字型 JWT 不再有效，用户需要重新登录。请保护好 `JWT_SECRET`，更换该值会使所有未过期 Access Token 失效。

当前实际 `back_end` 数据库曾只读核对为旧版 `users`、`logs`、`files`，没有新认证/角色表。用户已明确要求不保留旧数据，因此 `back-end-backend/mysql/migrations/20261014_reset_auth_schema.sql` 是**破坏性重置脚本**：它会删除旧 `users`、`logs`、`files` 及已有的认证、OAuth、Token、角色和邮箱验证码表中的所有数据。先完整备份；确认可丢弃这些数据后执行该脚本，再执行 `back-end-backend/mysql/init.sql` 创建空的新结构和基础角色。脚本不会迁移或保留旧用户、管理员、日志或文件记录；所有用户需重新注册。真实数据库未由本次开发操作，迁移和初始化需要由数据库管理员手动执行。

账号绑定启动接口使用已登录 JWT，并通过限定回调路径的 HttpOnly state Cookie 绑定浏览器流程；跨域部署需将前端来源加入 `CORS_ORIGINS`，并保持浏览器可接收该 Cookie。建议前后端使用同站点部署或由反向代理统一入口。第三方应用登记的 Callback URL 必须与对应 `OAUTH_GITEE_CALLBACK_URL` / `OAUTH_GITHUB_CALLBACK_URL` 完全一致。

数据库结构不会因 Entity 改动自动同步；TypeORM `synchronize` 在所有环境关闭。请通过显式 SQL 管理结构变更。`mysql/init.sql` 用于本地初始化，不会自动迁移已创建数据库。

### 2. 配置并启动前端

在 `back-end-frontend` 目录复制 `.env.example` 为 `.env`。默认值适合后端监听 `3000` 的本地开发：

```dotenv
VITE_API_BASE_URL=/api
VITE_API_PROXY_TARGET=http://localhost:3000
VITE_API_TIMEOUT=10000
VITE_APP_TITLE=后台管理系统
```

`GET /system` 需要有效的 Access Token。前端 API 客户端会自动附带登录令牌，并在令牌过期时尝试刷新；若返回 401，先确认登录状态仍有效，且 `VITE_API_PROXY_TARGET` 指向运行此版本后端的端口。后端和前端代理的默认端口现统一为 `3000`。系统信息响应仅返回 CPU 摘要、内存、架构、平台、版本和运行时间，不再返回用户目录、网络接口等主机敏感信息。

启动前端：

```bash
npm install
npm run dev
```

Vite 默认在 `http://localhost:5173` 提供页面，并将 `/api` 代理到 `VITE_API_PROXY_TARGET`。登录页访问后端 `/auth/login`；认证后的请求由前端 API client 自动附加 15 分钟 Access Token。Access Token 过期时前端会用 HttpOnly Cookie 自动刷新并重试失败请求；7 天 Refresh Token 到期或刷新凭证失效后才跳转重新登录。

## 后续业务开发流程

### 新增带数据库的业务

1. **确定数据和接口契约。** 明确字段、约束、索引、请求/响应、鉴权规则和失败场景。
2. **管理数据库变更。** 在 `mysql/entities/` 新建 Entity，并在 `mysql/entities/index.ts` 导出并加入 `DATABASE_ENTITIES`。为数据库升级编写可审查、可回滚的 SQL；需要支持全新本地库时，同步更新 `mysql/init.sql`。先在开发数据库验证，再安排备份和部署顺序。不要启用 `synchronize` 代替迁移。
3. **新增仓储。** 在 `mysql/repositories/` 添加仓储，集中实现该 Entity 的查询和持久化操作。仓储由 `MysqlModule` 提供；需要使用仓储的业务 module 显式导入 `MysqlModule`。
4. **实现 Nest 业务模块。** 在 `src/modules/<业务名>/` 增加 `dto/`、Service、Controller 和 Module。DTO 校验输入，Service 编排业务，Controller 暴露 HTTP 接口。若新增业务 module，在 `src/app.module.ts` 注册一次。
5. **添加鉴权和配置。** 私有 API 使用现有 `AuthGuard`。新环境变量集中添加到 `config/config.ts` 并在 `back-end-backend/.env.example` 记录名称和安全的示例值；不得把敏感值放入代码。
6. **实现前端调用和页面。** 在 `src/api/modules/` 增加该业务 API，并在 `src/api/index.ts` 导出；页面放入 `src/views/` 并在 `src/router/index.ts` 配置。登录后页面沿用现有路由守卫和 `AppLayout`；跨组件共享状态放 Pinia store，可复用交互逻辑放 composable。
7. **联调并验证。** 检查正常请求、输入校验、未登录/越权、数据库失败和空数据等场景。数据库 SQL 与应用版本应一并发布，避免先发布依赖新字段的代码。

### 代码注释约定

以清晰的命名、类型和模块边界作为首选。对安全边界、兼容逻辑、配置优先级、数据库迁移等不易从代码本身看出的原因，添加简短中文注释；避免逐行翻译代码。跨模块架构和开发步骤维护在本 README。

## 检查和测试

后端编译与单元测试：

```bash
cd back-end-backend
npm run lint
npm run build
npm test -- --runInBand
```

前端类型检查与生产构建：

```bash
cd back-end-frontend
npm run lint
npm run build
```

`npm run lint` 只检查，不会自动改写文件；需要自动修复时可运行 `npm run lint:fix`，再检查改动并重新运行 lint。

数据库相关改动还应使用空白开发数据库验证初始化流程，并针对已有数据验证升级 SQL。生产部署前执行备份、迁移和回滚演练。

### 应用日志与审计

后端会将每个 HTTP 请求的时间、请求 ID、方法、路径、状态码、耗时和来源 IP 输出到 NestJS 控制台，并追加写入后端工作目录下的 `logs/http-YYYY-MM-DD.log` 日志文件（按 UTC 日期每日滚动）。目录不存在时自动创建，可通过后端 `.env` 中的 `LOG_DIR` 设置文件目录。请确保运行进程对该目录有写入权限；Docker 部署需将该目录挂载为持久化卷，否则容器重建后文件不会保留。日志不包含请求/响应正文，也不记录 URL 查询参数，避免泄漏密码、OAuth code 或 token；响应带有 `X-Request-Id` 便于关联排查。

登录成功/失败、OAuth 登录/绑定结果和注销事件会写入 MySQL `logs` 表。日志写入失败会在控制台明确报错，不会泄漏认证凭证，也不会阻断用户认证流程。管理员可通过 `GET /admin/logs?page=1&limit=50&level=warn` 查询，需携带管理员 Access Token；`level` 可选 `info`、`warn` 或 `error`，每页最多 100 条。日志可能包含 IP 和 User-Agent，须限制管理接口访问并按组织的数据保留策略管理。

全新数据库初始化会创建 `logs` 表；上述破坏性重置会删除旧日志，之后由 `mysql/init.sql` 创建空日志表。

## Docker Compose

从仓库根目录使用后端 `.env` 为 Compose 提供环境变量：

```bash
docker compose --env-file back-end-backend/.env up -d
docker compose --env-file back-end-backend/.env ps
docker compose --env-file back-end-backend/.env down
```

Compose 中后端连接 MySQL 使用服务名 `mysql`，不要把容器内的 `localhost` 当作宿主机数据库地址。Compose 默认账号仅供本地开发，部署前请替换数据库凭据、JWT 密钥及 OSS 凭据，并限制网络和数据库权限。健康检查成功只代表服务健康端点可用，不代表 OSS 已配置。

## 许可证

详见 [LICENSE](./LICENSE)。
