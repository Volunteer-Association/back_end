import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { DemoService } from './demo.service.js';
import { CreateDemoDto } from './dto/create-demo.dto.js';
import { UpdateDemoDto } from './dto/update-demo.dto.js';
import { AuthGuard } from '../guards/auth.guard.js';
import {
  ApiBody,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

@Controller('demo')
@UseGuards(AuthGuard)
@ApiBearerAuth()
@ApiTags('演示接口')
export class DemoController {
  constructor(private readonly demoService: DemoService) {}

  @Post()
  @ApiOperation({
    summary: '创建演示资源',
    description: '接受名称与说明并返回模拟结果；当前服务未持久化数据。',
  })
  @ApiResponse({ status: 201, description: '模拟创建结果。' })
  @ApiResponse({ status: 400, description: '字段校验失败。' })
  @ApiResponse({ status: 401, description: '缺少或提供了无效的 Access Token。' })
  @ApiBody({ type: CreateDemoDto })
  create(@Body() createDemoDto: CreateDemoDto) {
    return this.demoService.create(createDemoDto);
  }

  @Get()
  @ApiOperation({
    summary: '查询全部演示资源',
    description: '当前为示例实现，返回模拟文本，不访问数据库。',
  })
  @ApiResponse({ status: 200, description: '模拟查询结果。' })
  @ApiResponse({ status: 401, description: '缺少或提供了无效的 Access Token。' })
  findAll() {
    return this.demoService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: '查询单条演示资源' })
  @ApiParam({ name: 'id', description: '演示资源数字 ID。', example: 1 })
  @ApiResponse({ status: 200, description: '模拟查询结果。' })
  @ApiResponse({ status: 401, description: '缺少或提供了无效的 Access Token。' })
  findOne(@Param('id') id: string) {
    return this.demoService.findOne(+id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: '修改演示资源',
    description: '当前为示例实现，返回模拟文本，不会保存更改。',
  })
  @ApiParam({ name: 'id', description: '演示资源数字 ID。', example: 1 })
  @ApiResponse({ status: 200, description: '模拟更新结果。' })
  @ApiResponse({ status: 400, description: '字段校验失败。' })
  @ApiResponse({ status: 401, description: '缺少或提供了无效的 Access Token。' })
  @ApiBody({ type: UpdateDemoDto })
  update(@Param('id') id: string, @Body() updateDemoDto: UpdateDemoDto) {
    return this.demoService.update(+id, updateDemoDto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: '删除演示资源',
    description: '当前为示例实现，仅返回模拟文本，不删除数据库记录。',
  })
  @ApiParam({ name: 'id', description: '演示资源数字 ID。', example: 1 })
  @ApiResponse({ status: 200, description: '模拟删除结果。' })
  @ApiResponse({ status: 401, description: '缺少或提供了无效的 Access Token。' })
  remove(@Param('id') id: string) {
    return this.demoService.remove(+id);
  }
}
