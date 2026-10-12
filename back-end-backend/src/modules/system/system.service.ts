/*
 * @Author: chenguihui
 * @Date: 2023-07-04 01:20:37
 * @LastEditors: chenguihui
 * @LastEditTime: 2023-07-10 15:36:28
 * @Description: 头部注释
 * @filePath: Do not edit
 */
import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as os from 'node:os';
import * as fs from 'node:fs';
import * as OSS from 'ali-oss';
import { Parameter } from './dto/system.dto.js';
@Injectable()
export class SystemService {
  updateUserAudio(_value: string): string {
    throw new Error('Method not implemented.');
  }
  /**
   * CalculateByteConversion 字节转换函数
   * @param num 要转换的字节数
   * @param Bytecodes 转换的单位 KB MB GB
   * @returns 转换后的数值
   */
  private CalculateByteConversion: (
    num: number,
    Bytecodes?: string,
  ) => number | string;
  num: number;
  constructor(private readonly config: ConfigService) {
    /**
     * CalculateByteConversion 字节转换函数
     * @param num 要转换的字节数
     * @param Bytecodes 转换的单位 KB MB GB
     * @returns 转换后的数值
     */
    this.CalculateByteConversion = function (
      num: number,
      Bytecodes: string = 'MB',
    ) {
      const byteMap = {
        kb: 1024,
        mb: 1024 * 1024,
        gb: 1024 * 1024 * 1024,
        KB: 1024,
        MB: 1024 * 1024,
        GB: 1024 * 1024 * 1024,
      };

      const byte = byteMap[Bytecodes];

      if (!byte) {
        // callback(`wrong Bytecodes(未知的字节码): ${Bytecodes}`);
        return 'wrong Bytecodes(未知的字节码): ' + Bytecodes;
        throw new Error(`wrong Bytecodes(未知的字节码): ${Bytecodes}`);
      }
      if (num < 0) {
        return '字节数不能为负数';
        throw new Error(`wrong num(字节数不能为负数): ${num}`);
      }

      return Math.round((num / byte) * 100) / 100;
    };

    this.num = 0;
  }

  getHello(): string {
    return 'Hello World!';
  }
  /**
   * 获取系统资源信息
   * @param option 参数
   * @param option.id 资源id
   * @param option.memory 内存单位 KB MB GB
   * @returns
   */
  getSystemResource(option: Parameter): any {
    // 资源监视系统
    class _ResourceMonitor {
      cpuMeasure: any;
      constructor() {
        this.cpuMeasure = null;
      }

      getCpuUsage() {
        const cpus = os.cpus();
        let totalIdle = 0,
          totalTick = 0;

        cpus.forEach((cpu) => {
          for (const type in cpu.times) {
            totalTick += cpu.times[type];
          }
          totalIdle += cpu.times.idle;
        });

        return {
          idle: totalIdle / cpus.length,
          total: totalTick / cpus.length,
        };
      }

      calculateCpuUsage(startMeasure, endMeasure) {
        const idleDifference = endMeasure.idle - startMeasure.idle;
        const totalDifference = endMeasure.total - startMeasure.total;
        const percentageCPU =
          100 - ~~((100 * idleDifference) / totalDifference);
        return percentageCPU;
      }

      getMemoryUsage() {
        const freeMem = os.freemem();
        const totalMem = os.totalmem();
        const usedMem = totalMem - freeMem;
        const memoryUsage = (usedMem / totalMem) * 100;

        return {
          free: freeMem,
          total: totalMem,
          used: usedMem,
          usage: memoryUsage,
        };
      }

      getDiskUsage(path: string) {
        return new Promise((resolve, reject) => {
          fs.statfs(path, (err, stats) => {
            if (err) {
              reject(err);
            } else {
              const totalSize = stats.blocks * stats.bsize;
              const freeSize = stats.bfree * stats.bsize;
              const usedSize = totalSize - freeSize;
              const diskUsage = (usedSize / totalSize) * 100;

              resolve({
                total: totalSize,
                free: freeSize,
                used: usedSize,
                usage: diskUsage,
              });
            }
          });
        });
      }

      startMonitoring() {
        /**
         * 处理回调函数
         * @param value 回调值
         * @param callback 回调函数
         * @returns void
         */
        function registerCallback(callback: (value: string | number) => void) {
          // 注册回调函数
          if (typeof callback === 'function') {
            callback('监控开始');
            callback(2223);
          } else {
            console.error('回调函数必须是一个函数');
          }
        }

        /**
         * 注册回调函数
         * @param callback 回调函数
         * @returns void
         */
        // 注册回调函数
        registerCallback((value) => {
          console.log(value);
        });

        // 启动监控
        /*
        // 定时器
        // setInterval(() => {
        //   const startMeasure = this.getCpuUsage();
        //   setTimeout(() => {
        //     const endMeasure = this.getCpuUsage();
        //     const cpuUsage = this.calculateCpuUsage(startMeasure, endMeasure);
        //     console.log(`CPU使用率：${cpuUsage}%`);
        //   }, 1000);

        //   const memory = this.getMemoryUsage();
        //   console.log(`内存使用率：${memory.usage.toFixed(2)}%`);

          const diskPath = os.platform() === 'win32' ? 'C:' : '/';
          this.getDiskUsage(diskPath)
            .then((disk) => {
              console.log(
                `磁盘使用率：${(disk as { usage: number }).usage.toFixed(2)}%`,
              );
            })
            .catch((err) => {
              console.error('获取磁盘信息失败:', err);
            });
        }, 1000);
        */
      }
    }

    const _cpus = os.cpus();
    /** 获取系统可用内存 */
    const _memory = os.freemem();
    /** 获取系统总内存 */
    const _memorys = os.totalmem();
    /** 计算系统已用 */
    const _usedMemory = _memorys - _memory;

    return {
      cpu: _cpus,
      memory: {
        size: this.CalculateByteConversion(_memory, option?.memory),
        usedSize: this.CalculateByteConversion(_usedMemory, option?.memory),
        veSize: this.CalculateByteConversion(_memorys, option?.memory),
      },
      arch: os.arch(),
      EOL: os.EOL,
      constants: os.constants,
      endianness: os.endianness(),
      homedir: os.homedir(),
      hostname: os.hostname(),
      loadavg: os.loadavg(),
      networkInterfaces: os.networkInterfaces(),
      platform: os.platform(),
      release: os.release(),
      tmpdir: os.tmpdir(),
      type: os.type(),
      uptime: os.uptime(),
      userInfo: os.userInfo(),
      ...os,
    };
  }
/**
 * 文件上传到阿里云OSS
 * @param files 要上传的文件数组
 * @returns Promise<string> 返回上传结果信息
 */
// async uploadFile(files: Array<Express.Multer.File>): Promise<{
//   success: boolean;
//   message: string;
//   results?: Array<
//     | { name: string; url: string; size: number; success: true }
//     | { name: string; success: false; error: string }
//   >;
// }> {
//   // 参数校验
//   if (!files || files.length === 0) {
//     return {
//       success: false,
//       message: '未接收到有效文件',
//     };
//   }

//   try {
//     // 初始化OSS客户端
//     const client = new OSS({
//       region: Config.ThirdPartyStorageOSS.AliyunOSS.region,
//       accessKeyId: Config.ThirdPartyStorageOSS.AliyunOSS.accessKeyId,
//       accessKeySecret: Config.ThirdPartyStorageOSS.AliyunOSS.accessKeySecret,
//       authorizationV4: Config.ThirdPartyStorageOSS.AliyunOSS.authorizationV4,
//       bucket: Config.ThirdPartyStorageOSS.AliyunOSS.bucket,
//     });

//     // 并行上传所有文件
//     const uploadResults = await Promise.all(
//       files.map(async (file) => {
//         try {
//           // 添加进度回调（可选）
//           const options: OSS.PutObjectOptions = {
//             progress: (p: number) => {
//               console.log(
//                 `文件 ${file.originalname} 上传进度: ${Math.round(p * 100)}%`,
//               );
//             },
//           };

//           // 执行上传
//           const result = await client.put(
//             `${Date.now()}_${file.originalname}`, // 添加时间戳防止重名
//             file.buffer,
//             options,
//           );

//           return {
//             name: file.originalname,
//             url: String(result.url),
//             size: file.size,
//             success: true as true,
//           };
//         } catch (error) {
//           console.error(`文件 ${file.originalname} 上传失败:`, error);
//           return {
//             name: file.originalname,
//             success: false as false,
//             error: String(error.message),
//           };
//         }
//       }),
//     );

//     // 统计上传结果
//     const failedUploads = uploadResults.filter((r) => !r.success);
//     if (failedUploads.length > 0) {
//       return {
//         success: false,
//         message: `部分文件上传失败: ${failedUploads.map((f) => f.name).join(', ')}`,
//         results: uploadResults,
//       };
//     }

//     return {
//       success: true,
//       message: '所有文件上传成功',
//       results: uploadResults,
//     };
//   } catch (error) {
//     console.error('OSS客户端初始化或上传过程中出错:', error);
//     return {
//       success: false,
//       message: `上传服务出错: ${error.message}`,
//     };
//   }
// }

/**
 * 文件上传到阿里云OSS
 * @param files 要上传的文件数组
 * @returns Promise<string> 返回上传结果信息
 */
async uploadFile(files: Array<Express.Multer.File>): Promise<{
  success: boolean;
  message: string;
  results?: Array<
    | { name: string; url: string; size: number; success: true }
    | { name: string; success: false; error: string }
  >;
}> {
  // 参数校验
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
  if (!ossConfig.region || !ossConfig.accessKeyId || !ossConfig.accessKeySecret || !ossConfig.bucket) {
    throw new ServiceUnavailableException('文件上传服务未配置');
  }

  try {
    // 初始化OSS客户端
    const client = new OSS({
      region: ossConfig.region,
      accessKeyId: ossConfig.accessKeyId,
      accessKeySecret: ossConfig.accessKeySecret,
      authorizationV4: ossConfig.authorizationV4,
      bucket: ossConfig.bucket,
    });

    // 并行上传所有文件
    const uploadResults = await Promise.all(
      files.map(async (file) => {
        try {
          // 添加进度回调（可选）
          const options: OSS.PutObjectOptions = {
            progress: (p: number) => {
              console.log(
                `文件 ${file.originalname} 上传进度: ${Math.round(p * 100)}%`,
              );
            },
          };

          // 执行上传
          const result = await client.put(
            `${Date.now()}_${file.originalname}`, // 添加时间戳防止重名
            file.buffer,
            options,
          );

          return {
            name: file.originalname,
            url: String(result.url),
            size: file.size,
            success: true as const,
          };
        } catch (error) {
          console.error(`文件 ${file.originalname} 上传失败:`, error);
          return {
            name: file.originalname,
            success: false as const,
            error: String(error.message),
          };
        }
      }),
    );

    // 统计上传结果
    const failedUploads = uploadResults.filter((r) => !r.success);
    if (failedUploads.length > 0) {
      const failedNames = failedUploads.map((f) => f.name).join(', ');
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
  } catch (error) {
    console.error('OSS客户端初始化或上传过程中出错:', error);
    throw new ServiceUnavailableException('上传服务暂不可用');
  }
}

  getUserAudio(_value: string): string {
    fs.statSync('./public/ycccc.kgma');

    const ReadStream = fs.createReadStream('./public/ycccc.kgma');
    const WriteStream = fs.createWriteStream('./public/ycccc.mp3');

    ReadStream.pipe(WriteStream);

    // fs.readFile("./public/ycccc.kgma", (err, data) => {
    //   if (err) {
    //     console.log("错误", err)
    //   } else {
    //     // console.log("成功", data)
    //   }

    //   let fileUrl = Buffer.from(data);
    //   console.log(names, fileUrl)

    //   fs.watchFile("./public/ycccc.mp3", data, (err) => {
    //   })

    // })
    return '文件上传成功';
  }
}
