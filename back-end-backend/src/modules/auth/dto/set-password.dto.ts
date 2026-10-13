import { ApiProperty } from '@nestjs/swagger';
import {
  IsOptional,
  Matches,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class SetPasswordDto {
  @ApiProperty({
    description: '设置本地账号时可指定；OAuth 系统生成账号首次完善时必填。已有正常本地账号可省略。',
    example: 'my_local_account',
    required: false,
    minLength: 3,
    maxLength: 60,
    pattern: '^[A-Za-z0-9_-]{3,60}$',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{3,60}$/)
  username?: string;

  @ApiProperty({
    description: '已设置本地密码的账号在修改密码时必填；首次设置密码时省略。',
    example: 'CurrentPass123!',
    required: false,
    maxLength: 128,
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  currentPassword?: string;

  @ApiProperty({
    description: '要设置的新密码，至少 12 位，最多 72 个 UTF-8 字节。',
    example: 'NewStrongPass123!',
    minLength: 12,
    maxLength: 72,
  })
  @IsString()
  @MinLength(12)
  @MaxLength(72)
  newPassword: string;
}
