/*
 * @Author: chenguihui
 * @Date: 2023-07-04 01:20:37
 * @LastEditors: chenguihui
 * @LastEditTime: 2023-07-08 00:54:10
 * @Description: 头部注释
 * @filePath: Do not edit
 */
import {
  Controller,
  Get,
  Query,
  Post,
  UseInterceptors,
  UploadedFiles,
  Put,
  Body,
  UseGuards,
} from '@nestjs/common';
import { SystemService } from './system.service.js';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiBody,
  ApiConsumes,
  ApiResponse,
  ApiTags,
  ApiParam,
} from '@nestjs/swagger';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  Parameter,
  SystemResource,
  FilesUploadDto,
} from './dto/system.dto.js';
import { AuthGuard } from '../../guards/auth.guard.js';

@ApiBearerAuth()
@ApiTags('cats')
@Controller()
export class SystemController {
  constructor(private readonly systemService: SystemService) {}

  @Get()
  getHello(): string {
    return this.systemService.getHello();
  }

  @Get('health')
  health(): { status: string } {
    return { status: 'ok' };
  }

  @Get('system')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: '获取系统信息' })
  @ApiResponse({ status: 200, description: '响应体' })
  @ApiParam({
    type: Parameter,
    name: '参数',
  })
  getSystemResource(@Query() option: Parameter): SystemResource<any> {
    return this.systemService.getSystemResource(option);
  }

  @Post('upload')
  @UseGuards(AuthGuard)
  @UseInterceptors(
    FilesInterceptor('files', undefined, {
      limits: { fileSize: 500 * 1024 },
    }),
  )
  @ApiOperation({ summary: '文件上传' })
  @ApiResponse({ status: 200, description: '响应体' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: '请选择文件',
    type: FilesUploadDto,
  })
  uploadFile(@UploadedFiles() files: Array<Express.Multer.File>): Promise<{
    success: boolean;
    message: string;
    results?: Array<
      | { name: string; url: string; size: number; success: true }
      | { name: string; success: false; error: string }
    >;
  }> {
    return this.systemService.uploadFile(files);
  }

  @Get('/audio')
  @UseGuards(AuthGuard)
  getUserAudio(@Query('value') value: string): string {
    return this.systemService.getUserAudio(value);
  }

  @Put('/audio')
  @UseGuards(AuthGuard)
  updateUserAudio(@Body('value') value: string): string {
    return this.systemService.updateUserAudio(value);
  }
}
