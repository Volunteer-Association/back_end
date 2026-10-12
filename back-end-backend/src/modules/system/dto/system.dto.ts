/** 系统资源查询参数和文件上传请求字段定义。 */
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional } from 'class-validator';
import 'Multer';

export class Parameter {
  @ApiProperty({ required: false, enum: ['KB', 'MB', 'GB'], default: 'MB' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @IsIn(['KB', 'MB', 'GB'])
  memory?: 'KB' | 'MB' | 'GB';
}

export interface SystemResource {
  cpu: {
    model: string;
    speedMhz: number;
    cores: number;
  };
  memory: {
    free: number;
    used: number;
    total: number;
    unit: 'KB' | 'MB' | 'GB';
  };
  arch: string;
  platform: NodeJS.Platform;
  release: string;
  uptime: number;
}

export class FilesUploadDto {
  @ApiProperty({
    description: '待上传文件，单文件最大 500 KiB。',
    type: 'array',
    items: { type: 'string', format: 'binary' },
  })
  files: Array<Express.Multer.File>;
}
