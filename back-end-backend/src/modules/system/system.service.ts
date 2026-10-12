/** 系统资源采集及对象存储上传的业务实现。 */
import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as os from 'node:os';
import * as OSS from 'ali-oss';
import { Parameter, type SystemResource } from './dto/system.dto.js';
@Injectable()
export class SystemService {
  private static readonly BYTE_UNITS = {
    KB: 1024,
    MB: 1024 * 1024,
    GB: 1024 * 1024 * 1024,
  } as const;

  constructor(private readonly config: ConfigService) {}

  getHello(): string {
    return 'Hello World!';
  }
  /** 读取系统资源摘要；容量按请求的 KB、MB 或 GB 单位换算。 */
  getSystemResource(option: Parameter): SystemResource {
    const unit = option?.memory ?? 'MB';
    const divisor = SystemService.BYTE_UNITS[unit];
    const cpus = os.cpus();
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const convertBytes = (bytes: number) =>
      Math.round((bytes / divisor) * 100) / 100;

    return {
      cpu: {
        model: cpus[0]?.model ?? 'unknown',
        speedMhz: cpus[0]?.speed ?? 0,
        cores: cpus.length,
      },
      memory: {
        free: convertBytes(freeMemory),
        used: convertBytes(totalMemory - freeMemory),
        total: convertBytes(totalMemory),
        unit,
      },
      arch: os.arch(),
      platform: os.platform(),
      release: os.release(),
      uptime: os.uptime(),
    };
  }
  /** 并行上传文件到阿里云 OSS，并逐项返回成功 URL 或错误信息。 */
  async uploadFile(files: Array<Express.Multer.File>): Promise<{
    success: boolean;
    message: string;
    results?: Array<
      | { name: string; url: string; size: number; success: true }
      | { name: string; success: false; error: string }
    >;
  }> {
    if (!files || files.length === 0) {
      throw new BadRequestException('未接收到有效文件');
    }

    const ossConfig = this.config.getOrThrow<{
      region: string;
      accessKeyId: string;
      accessKeySecret: string;
      bucket: string;
      authorizationV4: boolean;
    }>('app.oss');
    if (
      !ossConfig.region ||
      !ossConfig.accessKeyId ||
      !ossConfig.accessKeySecret ||
      !ossConfig.bucket
    ) {
      throw new ServiceUnavailableException('文件上传服务未配置');
    }

    try {
      const client = new OSS({
        region: ossConfig.region,
        accessKeyId: ossConfig.accessKeyId,
        accessKeySecret: ossConfig.accessKeySecret,
        authorizationV4: ossConfig.authorizationV4,
        bucket: ossConfig.bucket,
      });

      const uploadResults = await Promise.all(
        files.map(async (file) => {
          try {
            const objectKey = `${Date.now()}_${file.originalname}`;
            const result = await client.put(objectKey, file.buffer);

            return {
              name: file.originalname,
              url: String(result.url),
              size: file.size,
              success: true as const,
            };
          } catch (error: unknown) {
            return {
              name: file.originalname,
              success: false as const,
              error:
                error instanceof Error
                  ? error.message
                  : '未知的对象存储错误',
            };
          }
        }),
      );

      const failedUploads = uploadResults.filter((result) => !result.success);
      if (failedUploads.length > 0) {
        const failedNames = failedUploads.map((file) => file.name).join(', ');
        return {
          success: false,
          message: `部分文件上传失败: ${failedNames}`,
          results: uploadResults,
        };
      }

      return {
        success: true,
        message: '所有文件上传成功',
        results: uploadResults,
      };
    } catch (error: unknown) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException('上传服务暂不可用');
    }
  }

}
