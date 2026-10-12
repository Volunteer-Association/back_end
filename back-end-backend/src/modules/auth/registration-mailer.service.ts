import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';

@Injectable()
export class RegistrationMailerService {
  private readonly logger = new Logger(RegistrationMailerService.name);

  constructor(private readonly config: ConfigService) {}

  ensureConfigured(): void {
    const mail = this.config.getOrThrow<{
      host: string;
      user: string;
      password: string;
      from: string;
    }>('app.email');
    if (!mail.host || !mail.user || !mail.password || !mail.from) {
      throw new ServiceUnavailableException('邮箱服务尚未配置');
    }
  }

  async sendVerificationCode(
    email: string,
    code: string,
    expiresMs: number,
  ): Promise<void> {
    const mail = this.config.getOrThrow<{
      host: string;
      port: number;
      secure: boolean;
      user: string;
      password: string;
      from: string;
    }>('app.email');
    this.ensureConfigured();

    const transport = nodemailer.createTransport({
      host: mail.host,
      port: mail.port,
      secure: mail.secure,
      auth: { user: mail.user, pass: mail.password },
    });

    try {
      await transport.sendMail({
        from: mail.from,
        to: email,
        subject: '注册邮箱验证码',
        text: `你的注册验证码是 ${code}，有效期 ${Math.ceil(expiresMs / 60000)} 分钟。若非本人操作，请忽略此邮件。`,
        html: `<p>你的注册验证码是：</p><p style="font-size:24px;font-weight:bold;letter-spacing:6px">${code}</p><p>验证码有效期 ${Math.ceil(expiresMs / 60000)} 分钟。若非本人操作，请忽略此邮件。</p>`,
      });
    } catch (error: unknown) {
      this.logger.error(
        `注册验证码邮件发送失败 [${error instanceof Error ? error.name : 'UnknownError'}]`,
      );
      throw new ServiceUnavailableException('验证码邮件发送失败，请稍后重试');
    } finally {
      transport.close();
    }
  }
}
