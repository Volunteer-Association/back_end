import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';

interface MailConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
}

@Injectable()
export class RegistrationMailerService {
  private readonly logger = new Logger(RegistrationMailerService.name);

  /** 懒加载缓存 SMTP transporter，避免每封邮件都新建 TCP+TLS 连接。 */
  private transporter: Transporter | null = null;

  constructor(private readonly config: ConfigService) {}

  ensureConfigured(): void {
    const mail = this.config.getOrThrow<MailConfig>('app.email');
    if (!mail.host || !mail.user || !mail.password || !mail.from) {
      throw new ServiceUnavailableException('邮箱服务尚未配置');
    }
  }

  private getTransporter(mail: MailConfig): Transporter {
    if (!this.transporter) {
      this.transporter = nodemailer.createTransport({
        host: mail.host,
        port: mail.port,
        secure: mail.secure,
        auth: { user: mail.user, pass: mail.password },
      });
    }
    return this.transporter;
  }

  async sendVerificationCode(
    email: string,
    code: string,
    expiresMs: number,
  ): Promise<void> {
    const mail = this.config.getOrThrow<MailConfig>('app.email');
    this.ensureConfigured();

    const transport = this.getTransporter(mail);

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
    }
  }
}
