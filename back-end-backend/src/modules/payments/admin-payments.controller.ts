import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
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
import { AuthGuard } from '../../guards/auth.guard.js';
import { LoggingService } from '../logging/logging.service.js';
import { PaymentsService } from './payments.service.js';
import { ReviewRechargeDto } from './dto/payments.dto.js';

@ApiTags('支付-管理员')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('admin/recharges')
export class AdminPaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly logging: LoggingService,
  ) {}

  @Get()
  @ApiOperation({ summary: '查询充值申请列表' })
  @ApiQuery({ name: 'status', required: false, enum: ['pending', 'approved', 'rejected'] })
  list(
    @Req() req: Request & { user?: Record<string, unknown> },
    @Query('status') status?: 'pending' | 'approved' | 'rejected',
  ) {
    this.assertAdmin(req);
    return this.payments.adminListRecharges(status);
  }

  @Post(':id/approve')
  @ApiOperation({ summary: '批准充值（加余额、写流水）' })
  async approve(
    @Req() req: Request & { user?: Record<string, unknown> },
    @Param('id') id: string,
    @Body() dto: ReviewRechargeDto,
  ) {
    this.assertAdmin(req);
    const result = await this.payments.approveRecharge(
      String(req.user!.sub),
      id,
      dto.reviewNote,
    );
    await this.logging.audit({
      level: 'warn',
      category: 'event',
      message: `充值批准：${id} ¥${(Number(result.amountCents) / 100).toFixed(2)} 给用户 ${result.userId}`,
      userId: String(req.user!.sub),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return result;
  }

  @Post(':id/reject')
  @ApiOperation({ summary: '驳回充值申请' })
  async reject(
    @Req() req: Request & { user?: Record<string, unknown> },
    @Param('id') id: string,
    @Body() dto: ReviewRechargeDto,
  ) {
    this.assertAdmin(req);
    const result = await this.payments.rejectRecharge(
      String(req.user!.sub),
      id,
      dto.reviewNote,
    );
    await this.logging.audit({
      level: 'warn',
      category: 'event',
      message: `充值驳回：${id}`,
      userId: String(req.user!.sub),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return result;
  }

  private assertAdmin(req: Request & { user?: Record<string, unknown> }) {
    if (!req.user || req.user.role !== 'admin') {
      throw new ForbiddenException('需要管理员权限');
    }
  }
}
