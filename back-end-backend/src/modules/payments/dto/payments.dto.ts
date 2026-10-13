import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateRechargeDto {
  @ApiProperty({ example: 10000, description: '充值金额，单位分（10000 = ¥100.00）' })
  @IsInt()
  @Min(100)
  amountCents: number;

  @ApiProperty({ enum: ['alipay', 'wechat', 'bank'] })
  @IsIn(['alipay', 'wechat', 'bank'])
  channel: 'alipay' | 'wechat' | 'bank';

  @ApiPropertyOptional({ example: '下午3点已转账，付款人张三', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  userNote?: string | null;
}

export class ReviewRechargeDto {
  @ApiPropertyOptional({ example: '已核对到账', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reviewNote?: string | null;
}
