import {
  Controller,
  Delete,
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

  @Get('options')
  @ApiOperation({ summary: '通知类型枚举（后端下发，前端不写死）' })
  options() {
    return {
      types: [
        { value: 'recharge_approved', label: '充值到账' },
        { value: 'recharge_rejected', label: '充值驳回' },
        { value: 'transfer_received', label: '转账到账' },
        { value: 'transfer_sent', label: '转账转出' },
        { value: 'balance_adjusted', label: '余额调整' },
        { value: 'bill_paid', label: '账单支付' },
        { value: 'bill_refunded', label: '账单退款' },
        { value: 'system', label: '系统通知' },
      ],
    };
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

  // 注意：静态路由 'read' 必须放在参数路由 ':id' 之前声明，
  // 否则 DELETE /notifications/read 会被匹配成 :id='read'。
  @Delete('read')
  @ApiOperation({ summary: '清空所有已读通知（未读保留）' })
  clearRead(@Req() req: Request & { user?: { sub: string } }) {
    return this.notifications.clearRead(req.user!.sub);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除单条通知' })
  remove(
    @Req() req: Request & { user?: { sub: string } },
    @Param('id') id: string,
  ) {
    return this.notifications.deleteOne(req.user!.sub, id);
  }
}
