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
  constructor(private readonly billsService: BillsService) {}

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
  create(
    @Req() request: AuthenticatedRequest,
    @Body() input: CreateBillDto,
  ) {
    return this.billsService.create(this.userId(request), input);
  }

  @Patch(':id')
  @ApiOperation({ summary: '更新当前用户账单' })
  @ApiResponse({ status: 200, description: '账单已更新。' })
  @ApiResponse({ status: 404, description: '账单不存在或不属于当前用户。' })
  update(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() input: UpdateBillDto,
  ) {
    return this.billsService.update(this.userId(request), id, input);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除当前用户账单' })
  @ApiResponse({ status: 200, description: '账单已删除。' })
  @ApiResponse({ status: 404, description: '账单不存在或不属于当前用户。' })
  remove(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.billsService.remove(this.userId(request), id);
  }

  private userId(request: AuthenticatedRequest): string {
    const userId = request.user?.sub;
    if (!userId) throw new UnauthorizedException('未登录');
    return userId;
  }
}
