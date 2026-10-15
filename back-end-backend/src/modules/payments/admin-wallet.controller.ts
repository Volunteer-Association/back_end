import {
  Controller,
  ForbiddenException,
  Body,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard } from '../../guards/auth.guard.js';
import { LoggingService } from '../logging/logging.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PaymentsService } from './payments.service.js';
import { AdminAdjustDto } from './dto/payments.dto.js';

@ApiTags('钱包-管理员')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('admin/wallet')
export class AdminWalletController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly logging: LoggingService,
    private readonly notifications: NotificationsService,
  ) {}

  @Get('transactions')
  @ApiOperation({ summary: '全局流水（分页 + 过滤）' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'type', required: false })
  adminTxns(
    @Req() req: Request & { user?: Record<string, unknown> },
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('userId') userId?: string,
    @Query('type') type?: string,
  ) {
    this.assertAdmin(req);
    return this.payments.adminListTransactions({
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      userId,
      type,
    });
  }

  @Get('balances')
  @ApiOperation({ summary: '所有用户余额列表' })
  adminBalances(@Req() req: Request & { user?: Record<string, unknown> }) {
    this.assertAdmin(req);
    return this.payments.adminListBalances();
  }

  @Get('reconcile')
  @ApiOperation({ summary: '对账：余额 vs 流水汇总，校验是否平衡' })
  @ApiQuery({ name: 'startDate', required: false, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'endDate', required: false, description: 'YYYY-MM-DD' })
  reconcile(
    @Req() req: Request & { user?: Record<string, unknown> },
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    this.assertAdmin(req);
    return this.payments.adminReconcile(startDate, endDate);
  }

  @Get('reconcile/by-user')
  @ApiOperation({ summary: '逐用户对账：找出哪个用户余额和流水对不上' })
  reconcileByUser(@Req() req: Request & { user?: Record<string, unknown> }) {
    this.assertAdmin(req);
    return this.payments.adminReconcileByUser();
  }

  @Get('reconcile/daily')
  @ApiOperation({ summary: '按天汇总流水，定位是哪天开始不平' })
  @ApiQuery({ name: 'days', required: false, description: '最近多少天，默认 30' })
  reconcileDaily(
    @Req() req: Request & { user?: Record<string, unknown> },
    @Query('days') days?: string,
  ) {
    this.assertAdmin(req);
    return this.payments.adminReconcileDaily(days ? Number(days) : 30);
  }

  @Post('adjust')
  @ApiOperation({ summary: '管理员手工调整用户余额（正=加钱，负=扣钱）' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['targetUserId', 'amountCents'],
      properties: {
        targetUserId: { type: 'string', example: 'u_xxx' },
        amountCents: { type: 'number', example: 5000, description: '分，正=加，负=扣' },
        note: { type: 'string', example: '客服补偿' },
      },
    },
  })
  async adjust(
    @Req() req: Request & { user?: Record<string, unknown> },
    @Body() dto: AdminAdjustDto,
  ) {
    this.assertAdmin(req);
    const adminId = String(req.user!.sub);
    const result = await this.payments.adminAdjust({
      adminId,
      targetUserId: dto.targetUserId,
      amountCents: dto.amountCents,
      note: dto.note,
    });
    await this.logging.audit({
      level: 'warn',
      category: 'event',
      message:
        `余额调整：用户 ${dto.targetUserId}，金额 ${dto.amountCents > 0 ? '+' : ''}${dto.amountCents} 分` +
        (dto.note ? `；原因：${dto.note}` : ''),
      userId: adminId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    // 通知被调整用户（金额以元展示，附调整后余额）；通知失败不影响已提交的调整
    const isAdd = dto.amountCents > 0;
    const amountText = `¥${(Math.abs(dto.amountCents) / 100).toFixed(2)}`;
    const afterText = `¥${(Number(result.balanceAfterCents) / 100).toFixed(2)}`;
    await this.notifications.createSafe({
      userId: dto.targetUserId,
      type: 'balance_adjusted',
      title: isAdd ? '余额增加通知' : '余额扣减通知',
      content:
        `管理员已${isAdd ? '为您增加' : '从您账户扣减'}余额 ${amountText}，` +
        `当前余额 ${afterText}。` +
        (dto.note?.trim() ? ` 原因：${dto.note.trim()}` : ''),
      bizType: 'admin_adjust',
      bizId: result.id,
    });
    return result;
  }

  private assertAdmin(req: Request & { user?: { roles?: string[] } }) {
    if (!req.user || !req.user.roles?.includes('admin')) {
      throw new ForbiddenException('需要管理员权限');
    }
  }
}
