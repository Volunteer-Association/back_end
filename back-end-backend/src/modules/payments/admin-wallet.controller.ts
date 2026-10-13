import {
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

  private assertAdmin(req: Request & { user?: Record<string, unknown> }) {
    if (!req.user || req.user.role !== 'admin') {
      throw new ForbiddenException('需要管理员权限');
    }
  }
}
