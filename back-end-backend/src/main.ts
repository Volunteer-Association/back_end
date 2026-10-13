/** NestJS 服务启动入口：注册全局校验、日志、跨域、静态文件及 Swagger。 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { join } from 'path';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import { HttpLoggingMiddleware } from './middleware/http-logging.middleware.js';
import { LoggingService } from './modules/logging/logging.service.js';

/** 设置基础安全响应头，避免引入额外依赖。 */
function applySecurityHeaders(app: NestExpressApplication): void {
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader(
      'Strict-Transport-Security',
      'max-age=63072000; includeSubDomains',
    );
    next();
  });
}

/** 创建 NestJS 应用并注册校验、跨域、日志、静态文件和 Swagger。 */
async function bootstrap() {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // 生产环境关闭 debug 日志，避免噪音；开发保留完整级别。
    logger:
      nodeEnv === 'production'
        ? ['error', 'warn', 'log']
        : ['error', 'debug', 'log', 'warn'],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      // 转换查询参数类型，只接收 DTO 白名单字段，并拒绝多余字段。
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  const config = app.get(ConfigService);

  // 反代部署时正确获取真实客户端 IP，影响登录限流与日志归属。
  app.set('trust proxy', config.getOrThrow('app.server.trustProxy'));
  // 收到 SIGTERM 时完成现有请求后关闭数据库连接。
  app.enableShutdownHooks();

  applySecurityHeaders(app);

  const httpLogging = new HttpLoggingMiddleware(
    config.getOrThrow<string>('app.logging.directory'),
    app.get(LoggingService),
    config.getOrThrow<string>('app.server.staticPrefix'),
  );
  app.use(httpLogging.use.bind(httpLogging));
  app.enableCors({
    origin: config.getOrThrow<string[]>('app.corsOrigins'),
    credentials: true,
    maxAge: 86400,
  });
  // 配置静态资源
  app.useStaticAssets(join(process.cwd(), 'public'), {
    prefix: config.getOrThrow<string>('app.server.staticPrefix'),
  });
  // Swagger 默认仅在非生产环境开启；生产可用 SWAGGER_ENABLED=true 显式覆盖。
  if (config.getOrThrow<boolean>('app.server.swaggerEnabled')) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('企业精神管理平台 API')
      .setDescription(
        '用户认证、OAuth 账号绑定、个人资料、系统资源及文件上传接口。受保护的接口需要在 Authorization 中提供 Bearer Access Token。',
      )
      .setVersion('1.0.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('/api/', app, document);
  }
  // 监听服务器
  await app.listen(
    config.getOrThrow<number>('app.server.port'),
    config.getOrThrow<string>('app.server.host'),
    () => {
      console.log(
        `服务器开启成功：${config.getOrThrow<string>('app.server.host')}:${config.getOrThrow<number>('app.server.port')}`,
      );
    },
  );
}
bootstrap();
