import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../guards/auth.guard.js';
import { NotificationsService } from './notifications.service.js';

@ApiTags('通知')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: '我的通知列表（分页，可只看未读）' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  @ApiQuery({ name: 'unread', required: false, description: '传 true 只看未读' })
  list(
    @Req() req: Request & { user?: { sub: string } },
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('unread') unread?: string,
  ) {
    return this.notifications.list(req.user!.sub, {
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      unreadOnly: unread === 'true' || unread === '1',
    });
  }

  @Get('unread-count')
  @ApiOperation({ summary: '我的未读通知数' })
  async unreadCount(@Req() req: Request & { user?: { sub: string } }) {
    const count = await this.notifications.unreadCount(req.user!.sub);
    return { count };
  }

  @Post('read-all')
  @ApiOperation({ summary: '全部标记已读' })
  readAll(@Req() req: Request & { user?: { sub: string } }) {
    return this.notifications.markAllRead(req.user!.sub);
  }

  @Post(':id/read')
  @ApiOperation({ summary: '标记单条通知已读' })
  read(
    @Req() req: Request & { user?: { sub: string } },
    @Param('id') id: string,
  ) {
    return this.notifications.markRead(req.user!.sub, id);
  }
}
