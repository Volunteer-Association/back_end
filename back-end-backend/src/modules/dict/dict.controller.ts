import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
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
import { DictService } from './dict.service.js';
import { CreateDictItemDto, UpdateDictItemDto } from './dto/dict.dto.js';

@ApiTags('数据字典')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller()
export class DictController {
  constructor(private readonly dict: DictService) {}

  @Get('dict/items')
  @ApiOperation({ summary: '按类型查询启用的字典项（业务侧使用）' })
  @ApiQuery({ name: 'dictType', required: true, example: 'bill_category_expense' })
  @ApiResponse({ status: 200, description: '字典项列表。' })
  listEnabled(@Query('dictType') dictType?: string) {
    if (!dictType) throw new BadRequestException('dictType 不能为空');
    return this.dict.listEnabled(dictType);
  }

  @Get('admin/dict/items')
  @ApiOperation({ summary: '管理员查询全部字典项' })
  @ApiQuery({ name: 'dictType', required: false })
  @ApiResponse({ status: 200, description: '全部字典项。' })
  listAll(
    @Req() request: Request & { user?: Record<string, unknown> },
    @Query('dictType') dictType?: string,
  ) {
    this.assertAdmin(request);
    return this.dict.listAll(dictType);
  }

  @Post('admin/dict/items')
  @ApiOperation({ summary: '管理员新建字典项' })
  @ApiResponse({ status: 201, description: '已创建。' })
  create(
    @Req() request: Request & { user?: Record<string, unknown> },
    @Body() dto: CreateDictItemDto,
  ) {
    this.assertAdmin(request);
    return this.dict.create(dto);
  }

  @Patch('admin/dict/items/:id')
  @ApiOperation({ summary: '管理员更新字典项' })
  @ApiResponse({ status: 200, description: '已更新。' })
  update(
    @Req() request: Request & { user?: Record<string, unknown> },
    @Param('id') id: string,
    @Body() dto: UpdateDictItemDto,
  ) {
    this.assertAdmin(request);
    return this.dict.update(id, dto);
  }

  @Delete('admin/dict/items/:id')
  @ApiOperation({ summary: '管理员删除字典项' })
  @ApiResponse({ status: 200, description: '已删除。' })
  remove(
    @Req() request: Request & { user?: Record<string, unknown> },
    @Param('id') id: string,
  ) {
    this.assertAdmin(request);
    return this.dict.remove(id);
  }

  private assertAdmin(request: Request & { user?: Record<string, unknown> }) {
    const user = request.user;
    if (!user || user.role !== 'admin') {
      throw new ForbiddenException('需要管理员权限');
    }
  }
}
