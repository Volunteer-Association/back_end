import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { LoggingService } from '../logging/logging.service.js';
import { AuthGuard } from '../../guards/auth.guard.js';
import type { LogLevel } from '../../../mysql/entities/log.entity.js';
import type { AuditLogCategory } from '../../../mysql/repositories/logs.repository.js';
import { parsePageValue } from '../../common/http.util.js';

@ApiTags('认证与用户')
@Controller()
/** 管理员分页查询 HTTP/事件审计日志。 */
export class AdminLogsController {
  constructor(private readonly loggingService: LoggingService) {}

  @Get('admin/logs')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '分页查询审计日志',
    description: '管理员专用；默认第 1 页、每页 50 条，limit 最大 100。',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    description: '页码，从 1 开始。',
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: '每页记录数，1-100。',
    example: 50,
  })
  @ApiQuery({
    name: 'level',
    required: false,
    description: '按日志级别过滤。',
    enum: ['info', 'warn', 'error'],
  })
  @ApiQuery({
    name: 'category',
    required: false,
    description: '按日志类型过滤：HTTP 请求日志或事件日志。',
    enum: ['http', 'event'],
  })
  @ApiResponse({
    status: 200,
    description: '日志分页数据。',
    schema: {
      example: {
        items: [
          {
            level: 'info',
            category: 'event',
            message: 'password_login_succeeded',
            id: 1,
            user: { id: '1234567890123456789', username: 'sample' },
            ipAddress: '127.0.0.1',
            userAgent: 'Mozilla/5.0',
            createdAt: '2026-10-13T00:00:00.000Z',
          },
        ],
        page: 1,
        limit: 50,
        total: 1,
      },
    },
  })
  @ApiResponse({ status: 401, description: '未登录或 Access Token 无效。' })
  @ApiResponse({ status: 400, description: '分页参数或日志级别无效。' })
  @ApiResponse({ status: 403, description: '当前账号不是管理员。' })
  getAuditLogs(
    @Req() request: Request & { user?: unknown },
    @Query('page') pageValue?: string,
    @Query('limit') limitValue?: string,
    @Query('level') levelValue?: string,
    @Query('category') categoryValue?: string,
  ) {
    const user = request.user;
    if (
      !user ||
      typeof user !== 'object' ||
      !('role' in user) ||
      user.role !== 'admin'
    ) {
      throw new ForbiddenException('需要管理员权限');
    }
    const page = parsePageValue(pageValue, 1, 1_000_000);
    const limit = parsePageValue(limitValue, 50, 100);
    let level: LogLevel | undefined;
    if (levelValue !== undefined) {
      if (!['info', 'warn', 'error'].includes(levelValue)) {
        throw new BadRequestException('日志级别无效');
      }
      level = levelValue as LogLevel;
    }
    let category: AuditLogCategory | undefined;
    if (categoryValue !== undefined) {
      if (!['http', 'event'].includes(categoryValue)) {
        throw new BadRequestException('日志类型无效');
      }
      category = categoryValue as AuditLogCategory;
    }
    return this.loggingService.findPage(page, limit, level, category);
  }
}
