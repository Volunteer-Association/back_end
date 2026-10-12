import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    description: '本地登录账号，需与注册或账号设置时使用的账号一致。',
    example: 'sample_user',
    maxLength: 60,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  username: string;

  @ApiProperty({
    description: '本地账号密码，8-72 位密码均可；不会在响应中返回。',
    example: 'StrongPass123!',
    minLength: 1,
    maxLength: 128,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password: string;
}
