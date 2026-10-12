import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, MaxLength } from 'class-validator';

export class SendRegistrationCodeDto {
  @ApiProperty({
    description: '接收注册验证码的邮箱地址。',
    example: 'user@example.com',
    maxLength: 100,
  })
  @IsEmail()
  @MaxLength(100)
  email: string;
}
