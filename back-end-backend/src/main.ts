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

/** 创建 NestJS 应用并注册校验、跨域、日志、静态文件和 Swagger。 */
async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['error', 'debug', 'log', 'warn'],
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
  const httpLogging = new HttpLoggingMiddleware(
    config.getOrThrow<string>('app.logging.directory'),
    app.get(LoggingService),
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
  // 配置swagger
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
