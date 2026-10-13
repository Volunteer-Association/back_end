import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { IsIn, IsString } from 'class-validator';
import { AuthGuard } from '../../guards/auth.guard.js';
import { PaymentsService } from './payments.service.js';
import type { PaymentChannel } from '../../../mysql/entities/index.js';

class CreatePaymentDto {
  @IsString()
  @IsIn(['alipay', 'wechat'])
  channel: PaymentChannel;
}

@ApiTags('账单支付')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('bills/:billId/payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post()
  @ApiOperation({
    summary: '为支出账单创建支付单',
    description: '返回支付单与模拟支付参数；沙箱环境用 /simulate 完成支付。',
  })
  @ApiParam({ name: 'billId', description: '账单ID' })
  @ApiResponse({ status: 201, description: '支付单已创建。' })
  @ApiResponse({ status: 400, description: '账单已支付或为收入类型。' })
  @ApiResponse({ status: 404, description: '账单不存在。' })
  async create(
    @Req() request: Request & { user?: { sub: string } },
    @Param('billId') billId: string,
    @Body() dto: CreatePaymentDto,
  ) {
    const userId = request.user!.sub;
    return this.payments.create(userId, billId, dto.channel);
  }

  @Get(':paymentId')
  @ApiOperation({ summary: '查询支付单状态' })
  @ApiParam({ name: 'billId', description: '账单ID' })
  @ApiParam({ name: 'paymentId', description: '支付单ID' })
  @ApiResponse({ status: 200, description: '支付单详情。' })
  @ApiResponse({ status: 404, description: '支付单不存在。' })
  async findOne(
    @Req() request: Request & { user?: { sub: string } },
    @Param('billId') billId: string,
    @Param('paymentId') paymentId: string,
  ) {
    const userId = request.user!.sub;
    await this.payments.findOne(userId, billId); // 校验账单归属
    return this.payments.findOne(userId, paymentId);
  }

  @Post(':paymentId/simulate')
  @ApiOperation({
    summary: '沙箱模拟支付成功',
    description: '仅用于演示环境；真实环境由第三方异步回调触发。',
  })
  @ApiParam({ name: 'billId', description: '账单ID' })
  @ApiParam({ name: 'paymentId', description: '支付单ID' })
  @ApiResponse({ status: 200, description: '支付单已标记为已支付。' })
  async simulate(
    @Req() request: Request & { user?: { sub: string } },
    @Param('billId') _billId: string,
    @Param('paymentId') paymentId: string,
  ) {
    const userId = request.user!.sub;
    return this.payments.simulatePaid(userId, paymentId);
  }
}
