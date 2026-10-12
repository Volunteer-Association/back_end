/*
 * @Author: chenguihui
 * @Date: 2023-07-08 00:30:54
 * @LastEditors: chenguihui
 * @LastEditTime: 2023-07-08 00:51:56
 * @Description: 头部注释
 * @filePath: Do not edit
 */
import { ApiProperty } from '@nestjs/swagger';
import * as os from 'node:os';
import 'Multer';

export class Parameter {
  @ApiProperty({ required: false, default: '' })
  id?: string;

  @ApiProperty({ required: false, default: 'mb' })
  memory?: string;
}

export class SystemResource<T> {
  cpu: os.CpuInfo[];
  memory: {
    size: number;
    usedSize: number;
    veSize: number;
  };
  arch: T;
  EOL: string;
  constants: T;
  endianness: T;
  homedir: T;
  hostname: T;
  loadavg: T;
  networkInterfaces: T;
  platform: T;
  release: T;
  tmpdir: T;
  type: T;
  uptime: T;
  userInfo: T;
}

export class FilesUploadDto {
  @ApiProperty({ type: 'array', items: { type: 'string', format: 'binary' } })
  files: Array<Express.Multer.File>;
}
