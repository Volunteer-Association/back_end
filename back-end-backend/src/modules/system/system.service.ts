/** 系统资源采集及对象存储上传的业务实现。 */
import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import * as os from 'node:os';
import * as OSS from 'ali-oss';
import { Parameter, type SystemResource } from './dto/system.dto.js';

interface OssConfig {
  region: string;
  accessKeyId: string;
  accessKeySecret: string;
  bucket: string;
  authorizationV4: boolean;
}

interface UploadConfig {
  maxSizeBytes: number;
  maxCount: number;
  allowedExtensions: string[];
}

@Injectable()
export class SystemService {
  private static readonly BYTE_UNITS = {
    KB: 1024,
    MB: 1024 * 1024,
    GB: 1024 * 1024 * 1024,
  } as const;

  /** 懒加载缓存 OSS 客户端，避免每次上传新建实例。 */
  private ossClient: OSS | null = null;

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

  private getOssClient(ossConfig: OssConfig): OSS {
    if (!this.ossClient) {
      this.ossClient = new OSS({
        region: ossConfig.region,
        accessKeyId: ossConfig.accessKeyId,
        accessKeySecret: ossConfig.accessKeySecret,
        authorizationV4: ossConfig.authorizationV4,
        bucket: ossConfig.bucket,
      });
    }
    return this.ossClient;
  }

  /** 从原始文件名提取小写扩展名；无扩展名返回空串。 */
  private static extractExtension(filename: string): string {
    const match = /\.([a-z0-9]+)$/i.exec(filename);
    return match ? match[1].toLowerCase() : '';
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

    const ossConfig = this.config.getOrThrow<OssConfig>('app.oss');
    if (
      !ossConfig.region ||
      !ossConfig.accessKeyId ||
      !ossConfig.accessKeySecret ||
      !ossConfig.bucket
    ) {
      throw new ServiceUnavailableException('文件上传服务未配置');
    }

    const uploadConfig = this.config.getOrThrow<UploadConfig>('app.upload');
    if (files.length > uploadConfig.maxCount) {
      throw new BadRequestException(
        `单次最多上传 ${uploadConfig.maxCount} 个文件`,
      );
    }

    // 扩展名白名单在服务端校验，不依赖 interceptor；拒绝路径穿越与可执行文件。
    if (uploadConfig.allowedExtensions.length > 0) {
      const rejected = files.filter(
        (file) =>
          !uploadConfig.allowedExtensions.includes(
            SystemService.extractExtension(file.originalname),
          ),
      );
      if (rejected.length > 0) {
        throw new BadRequestException(
          `文件类型不允许：${rejected
            .map((f) => f.originalname)
            .join(', ')}；仅支持 ${uploadConfig.allowedExtensions.join(', ')}`,
        );
      }
    }

    const client = this.getOssClient(ossConfig);

    const uploadResults = await Promise.all(
      files.map(async (file) => {
        try {
          // 使用随机对象名，避免用户原始文件名带来的路径穿越、覆盖与特殊字符问题。
          const ext = SystemService.extractExtension(file.originalname);
          const objectKey = `upload/${new Date().toISOString().slice(0, 10)}/${randomBytes(16).toString('hex')}${ext ? `.${ext}` : ''}`;
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
  }
}
