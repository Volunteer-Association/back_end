/*
 * @Author: chenguihui
 * @Date: 2023-07-04 01:20:37
 * @LastEditors: chenguihui
 * @LastEditTime: 2023-07-08 05:48:43
 * @Description: 头部注释
 * @filePath: Do not edit
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { join } from 'path';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import { HttpLoggingMiddleware } from './middleware/http-logging.middleware.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['error', 'debug', 'log', 'warn'],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  const config = app.get(ConfigService);
  const httpLogging = new HttpLoggingMiddleware(
    config.getOrThrow<string>('app.logging.directory'),
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
  const _swagger = new DocumentBuilder()
    .setTitle('Cats example')
    .setDescription('The cats API description')
    .setVersion('1.0.0')
    .addTag('cats')
    .build();
  const _document = SwaggerModule.createDocument(app, _swagger);
  SwaggerModule.setup('/api/', app, _document);
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
