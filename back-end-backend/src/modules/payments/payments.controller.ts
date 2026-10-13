import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard } from '../../guards/auth.guard.js';
import { LoggingService } from '../logging/logging.service.js';
import { PaymentsService } from './payments.service.js';
import { CreateRechargeDto } from './dto/payments.dto.js';

@ApiTags('支付-用户端')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly logging: LoggingService,
  ) {}

  @Get('balance')
  @ApiOperation({ summary: '查询我的账户余额' })
  @ApiResponse({ status: 200, description: 'balanceCents + balanceYuan。' })
  balance(@Req() req: Request & { user?: { sub: string } }) {
    return this.payments.getBalance(req.user!.sub);
  }

  @Post('recharge')
  @ApiOperation({
    summary: '申请线下充值',
    description: '提交后等待管理员核对到账并审核。',
  })
  async requestRecharge(
    @Req() req: Request & { user?: { sub: string } },
    @Body() dto: CreateRechargeDto,
  ) {
    const userId = req.user!.sub;
    const order = await this.payments.requestRecharge(userId, dto);
    await this.logging.audit({
      level: 'info',
      category: 'event',
      message: `充值申请：¥${(dto.amountCents / 100).toFixed(2)} 通过 ${dto.channel}`,
      userId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return order;
  }

  @Get('recharges')
  @ApiOperation({ summary: '我的充值申请记录' })
  myRecharges(@Req() req: Request & { user?: { sub: string } }) {
    return this.payments.listMyRecharges(req.user!.sub);
  }

  @Get('transactions')
  @ApiOperation({ summary: '我的余额流水' })
  myTxns(@Req() req: Request & { user?: { sub: string } }) {
    return this.payments.listMyTransactions(req.user!.sub);
  }
}
