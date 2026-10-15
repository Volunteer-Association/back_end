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
  ApiTags,
} from '@nestjs/swagger';import { AuthGuard } from '../../guards/auth.guard.js';
import { LoggingService } from '../logging/logging.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PaymentsService } from './payments.service.js';
import { ApproveRechargeDto, RejectRechargeDto } from './dto/payments.dto.js';

@ApiTags('支付-管理员')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('admin/recharges')
export class AdminPaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly logging: LoggingService,
    private readonly notifications: NotificationsService,
  ) {}

  @Get()
  @ApiOperation({ summary: '分页查询充值申请（可按状态、用户ID筛选）' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  @ApiQuery({ name: 'status', required: false, enum: ['pending', 'approved', 'rejected'] })
  @ApiQuery({ name: 'userId', required: false })
  list(
    @Req() req: Request & { user?: Record<string, unknown> },
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: 'pending' | 'approved' | 'rejected',
    @Query('userId') userId?: string,
  ) {
    this.assertAdmin(req);
    return this.payments.adminListRecharges({
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      status,
      userId,
    });
  }

  @Post(':id/approve')
  @ApiOperation({ summary: '批准充值（加余额、写流水）' })
  async approve(
    @Req() req: Request & { user?: Record<string, unknown> },
    @Param('id') id: string,
    @Body() dto: ApproveRechargeDto,
  ) {
    this.assertAdmin(req);
    const adminId = String(req.user!.sub);
    const result = await this.payments.approveRecharge(
      adminId,
      id,
      dto.reviewNote,
      dto.adminNote,
    );
    await this.logging.audit({
      level: 'warn',
      category: 'event',
      message:
        `充值批准：单号 ${id}，¥${(Number(result.amountCents) / 100).toFixed(2)} 给用户 ${result.userId}` +
        (dto.reviewNote ? `；审核说明：${dto.reviewNote}` : '') +
        (dto.adminNote ? `；内部备注：${dto.adminNote}` : ''),
      userId: adminId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    // 站内信通知用户（只含用户可见的审核说明，不含内部备注）；通知失败不影响已提交的审核
    await this.notifications.createSafe({
      userId: result.userId,
      type: 'recharge_approved',
      title: '充值到账通知',
      content:
        `您的充值申请 ¥${(Number(result.amountCents) / 100).toFixed(2)} 已审核通过并到账。` +
        (dto.reviewNote ? ` 备注：${dto.reviewNote}` : ''),
      bizType: 'recharge',
      bizId: id,
    });
    return result;
  }

  @Post(':id/reject')
  @ApiOperation({ summary: '驳回充值申请（驳回原因必填）' })
  async reject(
    @Req() req: Request & { user?: Record<string, unknown> },
    @Param('id') id: string,
    @Body() dto: RejectRechargeDto,
  ) {
    this.assertAdmin(req);
    const adminId = String(req.user!.sub);
    const result = await this.payments.rejectRecharge(
      adminId,
      id,
      dto.reviewNote,
      dto.adminNote,
    );
    await this.logging.audit({
      level: 'warn',
      category: 'event',
      message:
        `充值驳回：单号 ${id}，用户 ${result.userId}；驳回原因：${dto.reviewNote}` +
        (dto.adminNote ? `；内部备注：${dto.adminNote}` : ''),
      userId: adminId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    // 站内信通知用户驳回原因（不包含内部备注）；通知失败不影响已提交的审核
    await this.notifications.createSafe({
      userId: result.userId,
      type: 'recharge_rejected',
      title: '充值申请驳回通知',
      content:
        `您的充值申请 ¥${(Number(result.amountCents) / 100).toFixed(2)} 被驳回。` +
        `原因：${dto.reviewNote}`,
      bizType: 'recharge',
      bizId: id,
    });
    return result;
  }

  private assertAdmin(req: Request & { user?: { roles?: string[] } }) {
    if (!req.user || !req.user.roles?.includes('admin')) {
      throw new ForbiddenException('需要管理员权限');
    }
  }
}
