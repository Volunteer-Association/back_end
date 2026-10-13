/** 系统信息和文件上传的 HTTP 控制器。 */
import {
  Controller,
  Get,
  Query,
  Post,
  UseInterceptors,
  UploadedFiles,
  UseGuards,
} from '@nestjs/common';
import { SystemService } from './system.service.js';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiBody,
  ApiResponse,
  ApiTags,
  ApiQuery,
} from '@nestjs/swagger';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  Parameter,
  FilesUploadDto,
} from './dto/system.dto.js';
import type { SystemResource } from './dto/system.dto.js';
import { AuthGuard } from '../../guards/auth.guard.js';

@ApiTags('系统')
@Controller()
export class SystemController {
  constructor(private readonly systemService: SystemService) {}

  @Get()
  @ApiOperation({ summary: '获取服务欢迎信息' })
  @ApiResponse({ status: 200, description: '返回固定的欢迎文本。' })
  getHello(): string {
    return this.systemService.getHello();
  }

  @Get('health')
  @ApiOperation({ summary: '检查服务健康状态' })
  @ApiResponse({
    status: 200,
    description: '服务进程正常运行。',
    schema: { example: { status: 'ok' } },
  })
  health(): { status: string } {
    return { status: 'ok' };
  }

  @Get('system')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取系统信息' })
  @ApiResponse({
    status: 200,
    description: 'CPU、内存和基础操作系统信息。需要有效 Access Token。',
    schema: {
      example: {
        cpu: { model: 'Example CPU', speedMhz: 2400, cores: 8 },
        memory: { free: 8192, used: 8192, total: 16384, unit: 'MB' },
        arch: 'x64',
        platform: 'win32',
        release: '10.0.22631',
        uptime: 3600,
      },
    },
  })
  @ApiResponse({ status: 401, description: '缺少或提供了无效的 Access Token。' })
  @ApiQuery({
    name: 'memory',
    enum: ['KB', 'MB', 'GB'],
    required: false,
    example: 'MB',
    description: '内存显示单位，支持 KB、MB、GB，默认 MB。',
  })
  getSystemResource(@Query() option: Parameter): SystemResource {
    return this.systemService.getSystemResource(option);
  }

  @Post('upload')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      limits: { fileSize: 500 * 1024, files: 10 },
    }),
  )
  @ApiOperation({
    summary: '上传文件到对象存储',
    description: '通过 multipart/form-data 上传一个或多个文件；单个文件上限为 500 KiB。',
  })
  @ApiResponse({
    status: 200,
    description: '上传结果；每个文件均返回成功 URL 或失败原因。',
    schema: {
      example: {
        success: true,
        message: '所有文件上传成功',
        results: [
          {
            name: 'avatar.png',
            url: 'https://bucket.example.com/avatar.png',
            size: 2048,
            success: true,
          },
        ],
      },
    },
  })
  @ApiResponse({ status: 400, description: '没有上传文件或文件格式请求无效。' })
  @ApiResponse({ status: 401, description: '缺少或提供了无效的 Access Token。' })
  @ApiResponse({ status: 503, description: '对象存储未配置或暂不可用。' })
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

}
