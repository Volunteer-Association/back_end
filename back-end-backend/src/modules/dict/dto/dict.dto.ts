import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateDictItemDto {
  @ApiProperty({ example: 'bill_category_expense' })
  @IsString()
  @MaxLength(64)
  dictType: string;

  @ApiProperty({
    example: 'food',
    description: '字典项英文键，如 salary / food，同一字典类型下唯一',
  })
  @IsString()
  @MaxLength(64)
  dictKey: string;

  @ApiProperty({ example: '餐饮' })
  @IsString()
  @MaxLength(64)
  itemValue: string;

  @ApiPropertyOptional({ example: 1, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class UpdateDictItemDto extends PartialType(CreateDictItemDto) {}
