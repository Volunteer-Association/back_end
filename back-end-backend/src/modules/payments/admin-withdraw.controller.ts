import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../guards/auth.guard.js';
import { WithdrawService } from './withdraw.service.js';

@ApiTags('管理员-钱包')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('admin/withdraw')
export class AdminWithdrawController {
  constructor(private readonly svc: WithdrawService) {}

  @Get('pending')
  @ApiOperation({ summary: '待打款提现列表' })
  pending() {
    return this.svc.adminPending();
  }

  @Get('fee-stats')
  @ApiOperation({ summary: '平台提现手续费收入统计（累计/今日/本月/按日）' })
  feeStats(@Query('days') days?: string) {
    return this.svc.adminFeeStats(days ? Number(days) : 30);
  }

  @Post(':id/approve')
  @ApiOperation({ summary: '确认打款（标记已打款，不真的调用银行）' })
  approve(
    @Req() req: Request & { user?: { sub: string; username?: string } },
    @Param('id') id: string,
  ) {
    return this.svc.adminApprove(id, req.user?.username ?? 'admin');
  }

  @Post(':id/reject')
  @ApiOperation({ summary: '拒绝提现（退回余额）' })
  reject(
    @Req() req: Request & { user?: { sub: string; username?: string } },
    @Param('id') id: string,
    @Body() body: { reason?: string },
  ) {
    return this.svc.adminReject(id, req.user?.username ?? 'admin', body?.reason);
  }
}
