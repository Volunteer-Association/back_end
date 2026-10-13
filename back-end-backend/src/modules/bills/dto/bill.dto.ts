import { PartialType } from '@nestjs/mapped-types';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MaxLength,
} from 'class-validator';
import type { BillType } from '../../../../mysql/entities/bill.entity.js';

export class CreateBillDto {
  @ApiProperty({ enum: ['income', 'expense'], example: 'expense' })
  @IsIn(['income', 'expense'])
  type: BillType;

  @ApiProperty({
    example: '餐饮',
    description: '分类值，由数据字典 bill_category 动态提供。',
  })
  @IsString()
  @MaxLength(64)
  category: string;

  @ApiProperty({
    example: '128.50',
    description: '正数金额，最多两位小数，最大 9999999999.99。',
  })
  @IsString()
  @Matches(/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/)
  amount: string;

  @ApiProperty({ example: '2026-10-13', format: 'date' })
  @IsDateString({ strict: true })
  transactionDate: string;

  @ApiPropertyOptional({ example: '午餐', maxLength: 500, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string | null;
}

export class UpdateBillDto extends PartialType(CreateBillDto) {}

export class BillQueryDto {
  @ApiPropertyOptional({ enum: ['income', 'expense'] })
  @IsOptional()
  @IsIn(['income', 'expense'])
  type?: BillType;

  @ApiPropertyOptional({ description: '分类筛选，值来自数据字典。' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ example: '2026-10-01', format: 'date' })
  @IsOptional()
  @IsDateString({ strict: true })
  from?: string;

  @ApiPropertyOptional({ example: '2026-10-31', format: 'date' })
  @IsOptional()
  @IsDateString({ strict: true })
  to?: string;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  page = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

export type BillFilters = Pick<
  BillQueryDto,
  'type' | 'category' | 'from' | 'to'
>;
