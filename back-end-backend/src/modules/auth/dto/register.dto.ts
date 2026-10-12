import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @ApiProperty({
    description: '自选本地登录账号，仅允许英文字母、数字、下划线和连字符，长度 3-60 位。',
    example: 'sample_user',
    minLength: 3,
    maxLength: 60,
    pattern: '^[A-Za-z0-9_-]{3,60}$',
  })
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{3,60}$/)
  username: string;

  @ApiProperty({
    description: '用于接收并验证注册验证码的邮箱地址。',
    example: 'user@example.com',
    maxLength: 100,
  })
  @IsEmail()
  @MaxLength(100)
  email: string;

  @ApiProperty({
    description: '本地登录密码，8-72 位；服务端使用 bcrypt 保存哈希。',
    example: 'StrongPass123!',
    minLength: 8,
    maxLength: 72,
  })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;

  @ApiProperty({
    description: '通过发送邮箱验证码接口收到的 6 位验证码。',
    example: '123456',
    minLength: 6,
    maxLength: 6,
  })
  @IsString()
  @Matches(/^\d{6}$/)
  emailCode: string;
}
