import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
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
import { NotificationsService } from '../notifications/notifications.service.js';
import {
  BillQueryDto,
  CreateBillDto,
  UpdateBillDto,
} from './dto/bill.dto.js';
import { BillsService } from './bills.service.js';

interface AuthenticatedRequest extends Request {
  user?: { sub: string };
}

@ApiTags('账单管理')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('bills')
export class BillsController {
  constructor(
    private readonly billsService: BillsService,
    private readonly logging: LoggingService,
    private readonly notifications: NotificationsService,
  ) {}

  @Get()
  @ApiOperation({ summary: '分页查询当前用户账单' })
  @ApiResponse({ status: 200, description: '账单分页列表。' })
  findPage(
    @Req() request: AuthenticatedRequest,
    @Query() query: BillQueryDto,
  ) {
    return this.billsService.findPage(this.userId(request), query);
  }

  @Get('summary')
  @ApiOperation({ summary: '汇总当前筛选条件的收支金额' })
  @ApiResponse({
    status: 200,
    description: '返回收入、支出和结余的两位小数字符串。',
  })
  getSummary(
    @Req() request: AuthenticatedRequest,
    @Query() query: BillQueryDto,
  ) {
    return this.billsService.getSummary(this.userId(request), query);
  }

  @Post()
  @ApiOperation({ summary: '新增账单' })
  @ApiResponse({ status: 201, description: '账单已创建。' })
  async create(
    @Req() request: AuthenticatedRequest,
    @Body() input: CreateBillDto,
  ) {
    const userId = this.userId(request);
    const bill = await this.billsService.create(userId, input);
    await this.logging.audit({
      level: 'info',
      category: 'event',
      message: `账单创建：${input.type === 'income' ? '收入' : '支出'} ${input.category} ¥${input.amount}`,
      userId,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });
    return bill;
  }

  @Patch(':id')
  @ApiOperation({ summary: '更新当前用户账单' })
  @ApiResponse({ status: 200, description: '账单已更新。' })
  @ApiResponse({ status: 404, description: '账单不存在或不属于当前用户。' })
  async update(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() input: UpdateBillDto,
  ) {
    const userId = this.userId(request);
    const bill = await this.billsService.update(userId, id, input);
    await this.logging.audit({
      level: 'info',
      category: 'event',
      message: `账单更新：${id}`,
      userId,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });
    return bill;
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除当前用户账单' })
  @ApiResponse({ status: 200, description: '账单已删除。' })
  @ApiResponse({ status: 404, description: '账单不存在或不属于当前用户。' })
  async remove(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    const userId = this.userId(request);
    const result = await this.billsService.remove(userId, id);
    await this.logging.audit({
      level: 'warn',
      category: 'event',
      message: `账单删除：${id}`,
      userId,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });
    return result;
  }

  @Post(':id/pay')
  @ApiOperation({
    summary: '用账户余额支付支出账单',
    description: '扣款失败（余额不足）会返回 400。',
  })
  @ApiResponse({ status: 200, description: '支付成功，返回更新后的账单。' })
  async pay(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    const userId = this.userId(request);
    const bill = await this.billsService.payWithBalance(userId, id);
    await this.logging.audit({
      level: 'info',
      category: 'event',
      message: `账单支付：${id} ¥${bill.amount}`,
      userId,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });
    await this.notifications.createSafe({
      userId,
      type: 'bill_paid',
      title: '账单支付成功',
      content: `您的账单「${bill.category}」已通过余额支付 ¥${bill.amount}。`,
      bizType: 'bill',
      bizId: id,
    });
    return bill;
  }

  @Post(':id/refund')
  @ApiOperation({
    summary: '退款（把已支付账单的金额退回余额）',
    description: '按实际扣款流水金额退款，退款后账单进入「已退款」终态。',
  })
  async refund(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    const userId = this.userId(request);
    const bill = await this.billsService.refundBill(userId, id);
    await this.logging.audit({
      level: 'warn',
      category: 'event',
      message: `账单退款：${id} ¥${bill.amount}`,
      userId,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });
    await this.notifications.createSafe({
      userId,
      type: 'bill_refunded',
      title: '退款到账通知',
      content: `您的账单「${bill.category}」退款 ¥${bill.amount} 已退回账户余额。`,
      bizType: 'bill',
      bizId: id,
    });
    return bill;
  }

  private userId(request: AuthenticatedRequest): string {
    const userId = request.user?.sub;
    if (!userId) throw new UnauthorizedException('未登录');
    return userId;
  }
}
