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
import { PaymentsService } from './payments.service.js';

@ApiTags('钱包-管理员')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('admin/wallet')
export class AdminWalletController {
  constructor(private readonly payments: PaymentsService) {}

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
  adjust(
    @Req() req: Request & { user?: Record<string, unknown> },
    @Body() body: { targetUserId: string; amountCents: number; note?: string },
  ) {
    this.assertAdmin(req);
    return this.payments.adminAdjust({
      adminId: String(req.user!.sub),
      targetUserId: body.targetUserId,
      amountCents: Number(body.amountCents),
      note: body.note,
    });
  }

  private assertAdmin(req: Request & { user?: Record<string, unknown> }) {
    if (!req.user || req.user.role !== 'admin') {
      throw new ForbiddenException('需要管理员权限');
    }
  }
}
