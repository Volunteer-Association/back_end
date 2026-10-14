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
import { IdempotencyService } from '../common/idempotency.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PaymentsService } from './payments.service.js';
import { CreateRechargeDto, TransferDto } from './dto/payments.dto.js';

@ApiTags('支付-用户端')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly logging: LoggingService,
    private readonly idempotency: IdempotencyService,
    private readonly notifications: NotificationsService,
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
    description: '提交后等待管理员核对到账并审核。带幂等键，重复提交不会产生重复充值单。',
  })
  async requestRecharge(
    @Req() req: Request & { user?: { sub: string } },
    @Body() dto: CreateRechargeDto,
  ) {
    const userId = req.user!.sub;
    const { result, reused } = await this.idempotency.execute({
      key: dto.requestId,
      userId,
      action: 'recharge',
      handler: () =>
        this.payments.requestRecharge(userId, {
          amountCents: dto.amountCents,
          channel: dto.channel,
          userNote: dto.userNote,
        }),
    });
    if (!reused) {
      await this.logging.audit({
        level: 'info',
        category: 'event',
        message: `充值申请：¥${(dto.amountCents / 100).toFixed(2)} 通过 ${dto.channel}`,
        userId,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
    }
    return result;
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

  @Post('transfer')
  @ApiOperation({
    summary: '转账给其他用户',
    description: '输入对方邮箱账号，实时扣减/入账，写双向流水。带幂等键防重复扣款。',
  })
  async transfer(
    @Req() req: Request & { user?: { sub: string } },
    @Body() dto: TransferDto,
  ) {
    const userId = req.user!.sub;
    const { result, reused } = await this.idempotency.execute({
      key: dto.requestId,
      userId,
      action: 'transfer',
      handler: () =>
        this.payments.transfer(
          userId,
          dto.toAccount.trim(),
          dto.amountCents,
          dto.note,
        ),
    });
    if (!reused) {
      await this.logging.audit({
        level: 'warn',
        category: 'event',
        message: `转账：¥${(dto.amountCents / 100).toFixed(2)} → ${result.toNickname || result.toUserId}`,
        userId,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
      const amountText = `¥${(dto.amountCents / 100).toFixed(2)}`;
      const noteText = dto.note?.trim() ? ` 备注：${dto.note.trim()}` : '';
      // 收款方到账通知
      await this.notifications.createSafe({
        userId: result.toUserId,
        type: 'transfer_received',
        title: '转账到账通知',
        content: `您收到来自 ${result.fromNickname || '其他用户'} 的转账 ${amountText}，已到账。${noteText}`,
        bizType: 'transfer',
        bizId: result.transferId,
      });
      // 付款方转出通知
      await this.notifications.createSafe({
        userId: result.fromUserId,
        type: 'transfer_sent',
        title: '转账转出通知',
        content: `您已向 ${result.toNickname || result.toAccount} 转账 ${amountText}。${noteText}`,
        bizType: 'transfer',
        bizId: result.transferId,
      });
    }
    return result;
  }
}
