# 后端Dockerfile
FROM node:22-alpine

# 设置工作目录
WORKDIR /app

# 复制依赖清单
COPY back-end-backend/package*.json ./

# 安装依赖、构建应用并移除开发依赖
RUN npm ci

# 复制源代码
COPY back-end-backend/ .
RUN npm run build && npm prune --omit=dev

# 创建非root用户运行应用
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nestjs -u 1001
RUN chown -R nestjs:nodejs /app
USER nestjs

# 暴露端口
ENV SERVER_IP=0.0.0.0
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node healthcheck.js

# 启动应用
CMD ["node", "dist/src/main.js"]
