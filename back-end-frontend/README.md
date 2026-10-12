# 前端项目说明

前端采用 Vue 3、TypeScript、Vite、Vue Router、Pinia 和 Element Plus。源码位于 `src/`，按页面、组件、路由、状态及 API 请求职责拆分。

## 目录职责

- `src/api/`：Axios 客户端及认证、系统、上传、演示等 API 模块。公开请求方法使用中文注释说明用途；接口字段应与后端 DTO/Swagger 定义一致。
- `src/components/`：多个页面共用的展示组件。
- `src/composables/`：供组件复用的组合式逻辑。
- `src/layouts/`：登录后页面的通用布局。
- `src/router/`：页面路由、登录检查和管理员角色限制。
- `src/stores/`：Pinia 状态；认证 Store 维护 Access Token 和用户展示信息。
- `src/views/`：登录、账号设置、文件上传及其他页面。
- `src/assets/`：随页面打包的图片、字体和样式。

## 环境变量

在本目录复制 `.env.example` 为 `.env`：

- `VITE_API_BASE_URL`：前端请求使用的 API 基础路径，开发环境默认 `/api`。
- `VITE_API_PROXY_TARGET`：Vite 开发代理的后端地址，需与后端 `PORT` 一致。
- `VITE_API_TIMEOUT`：请求超时毫秒数。

受保护接口由 API 客户端自动附加 Access Token；Refresh Token 由后端设置为 HttpOnly Cookie，不应从前端读取。

## 开发与校验

```sh
npm install
npm run dev
npm run type-check
npm run lint
npm run build
```

启动后端后访问 `http://localhost:3000/api/` 查看 Swagger 请求字段及示例。
