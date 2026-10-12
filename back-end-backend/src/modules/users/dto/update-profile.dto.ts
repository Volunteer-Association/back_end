import { ApiPropertyOptional } from '@nestjs/swagger';
import {
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
}
