import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class UpdateProfileDto {
  @ApiPropertyOptional({
    description: '用户昵称；传 null 或空值可清空昵称。',
    example: '小明',
    maxLength: 60,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  nickname?: string | null;

  @ApiPropertyOptional({
    description: '新邮箱；系统内唯一，用于登录和转账收款。',
    example: 'new@example.com',
    maxLength: 100,
  })
  @IsOptional()
  @IsEmail({}, { message: '邮箱格式不正确' })
  @MaxLength(100)
  email?: string;

  @ApiPropertyOptional({
    description: '修改邮箱时必填：发到新邮箱的 6 位验证码。',
    example: '123456',
    maxLength: 6,
  })
  @IsOptional()
  @IsString()
  @MaxLength(6)
  emailCode?: string;

  @ApiPropertyOptional({
    description: '11 位数字手机号；传 null 或空值可清空手机号。',
    example: '13800138000',
    nullable: true,
    pattern: '^\\d{11}$',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{11}$/)
  mobile?: string | null;

  @ApiPropertyOptional({
    description: '性别：0 女，1 男，2 保密。',
    example: 2,
    enum: [0, 1, 2],
  })
  @IsOptional()
  @IsIn([0, 1, 2])
  sex?: number;

  @ApiPropertyOptional({
    description: '头像 URL；上传头像后将返回的 URL 传到此字段。',
    example: '/static/file/avatars/abc.png',
    maxLength: 255,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  avatar?: string | null;

  @ApiPropertyOptional({
    description: '证件类型：1身份证、2护照、3港澳通行证、4台胞证、9其他。',
    example: 1,
    enum: [1, 2, 3, 4, 9],
    nullable: true,
  })
  @IsOptional()
  @IsIn([1, 2, 3, 4, 9])
  idType?: number | null;

  @ApiPropertyOptional({
    description: '证件号码。',
    example: '110101199001011234',
    maxLength: 50,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  idNumber?: string | null;

  @ApiPropertyOptional({
    description: '联系地址。',
    example: '广东省深圳市南山区',
    maxLength: 255,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string | null;
}
