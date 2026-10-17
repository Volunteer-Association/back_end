import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../guards/auth.guard.js';
import { authenticatedUserId } from '../../common/http.util.js';
import { RedPacketService } from './red-packet.service.js';

@ApiTags('红包')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('red-packet')
export class RedPacketController {
  constructor(private readonly svc: RedPacketService) {}

  @Post('send')
  @ApiOperation({ summary: '发红包给指定用户（按邮箱）' })
  send(@Req() req: Request & { user?: unknown }, @Body() body: any) {
    return this.svc.send(authenticatedUserId(req.user), body);
  }

  @Post('receive/:id')
  @ApiOperation({ summary: '领取红包' })
  receive(@Req() req: Request & { user?: unknown }, @Param('id') id: string) {
    return this.svc.receive(authenticatedUserId(req.user), id);
  }

  @Get('my-received')
  @ApiOperation({ summary: '我收到的红包' })
  myReceived(@Req() req: Request & { user?: unknown }) {
    return this.svc.myReceived(authenticatedUserId(req.user));
  }

  @Get('my-pending')
  @ApiOperation({ summary: '待我领取的红包' })
  myPending(@Req() req: Request & { user?: unknown }) {
    return this.svc.myPending(authenticatedUserId(req.user));
  }

  @Get('my-sent')
  @ApiOperation({ summary: '我发的红包' })
  mySent(@Req() req: Request & { user?: unknown }) {
    return this.svc.mySent(authenticatedUserId(req.user));
  }
}
