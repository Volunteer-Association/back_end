import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../guards/auth.guard.js';
import { authenticatedUserId } from '../../common/http.util.js';
import { WithdrawService } from './withdraw.service.js';

@ApiTags('钱包')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('wallet')
export class WithdrawController {
  constructor(private readonly svc: WithdrawService) {}

  @Get('cards')
  @ApiOperation({ summary: '我的银行卡列表' })
  listCards(@Req() req: Request & { user?: unknown }) {
    return this.svc.listCards(authenticatedUserId(req.user));
  }

  @Post('cards')
  @ApiOperation({ summary: '添加银行卡（需已实名）' })
  addCard(@Req() req: Request & { user?: unknown }, @Body() body: any) {
    return this.svc.addCard(authenticatedUserId(req.user), body);
  }

  @Delete('cards/:id')
  @ApiOperation({ summary: '删除银行卡' })
  removeCard(@Req() req: Request & { user?: unknown }, @Param('id') id: string) {
    return this.svc.removeCard(authenticatedUserId(req.user), Number(id));
  }

  @Post('withdraw')
  @ApiOperation({ summary: '发起提现（扣余额，写流水，待管理员审核打款）' })
  requestWithdraw(@Req() req: Request & { user?: unknown }, @Body() body: any) {
    return this.svc.requestWithdraw(authenticatedUserId(req.user), body);
  }

  @Get('withdrawals')
  @ApiOperation({ summary: '我的提现记录' })
  listMine(@Req() req: Request & { user?: unknown }) {
    return this.svc.listMyWithdrawals(authenticatedUserId(req.user));
  }
}
