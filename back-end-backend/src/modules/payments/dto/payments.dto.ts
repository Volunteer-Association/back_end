import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { MIN_TXN_CENTS } from '../payments.service.js';

export class CreateRechargeDto {
  @ApiProperty({ example: 10000, description: '充值金额，单位分（10000 = ¥100.00）' })
  @IsInt()
  @Min(MIN_TXN_CENTS)
  amountCents: number;

  @ApiProperty({ enum: ['alipay', 'wechat', 'bank'] })
  @IsIn(['alipay', 'wechat', 'bank'])
  channel: 'alipay' | 'wechat' | 'bank';

  @ApiPropertyOptional({ example: '下午3点已转账，付款人张三', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  userNote?: string | null;

  @ApiProperty({
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: '幂等键（前端生成 UUID），重复提交不会产生重复充值单',
  })
  @IsString()
  @IsNotEmpty({ message: '幂等键不能为空' })
  @MaxLength(64)
  requestId: string;
}

/**
 * 审核通过充值申请的请求体。
 * - reviewNote：审核结果说明（可选），会展示给用户
 * - adminNote：管理员内部备注（可选），仅管理员可见
 */
export class ApproveRechargeDto {
  @ApiPropertyOptional({ example: '已核对支付宝到账', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: '审核备注最多 200 字' })
  reviewNote?: string | null;

  @ApiPropertyOptional({ example: '凭证号 XXX，内部留档', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: '内部备注最多 200 字' })
  adminNote?: string | null;
}

/**
 * 驳回充值申请的请求体。
 * - reviewNote：驳回原因（必填），会展示给用户
 * - adminNote：管理员内部备注（可选），仅管理员可见
 */
export class RejectRechargeDto {
  @ApiProperty({
    example: '未查到对应转账记录，请核对后重新申请',
    maxLength: 200,
    description: '驳回原因（必填），会展示给用户',
  })
  @IsString({ message: '驳回原因必须是字符串' })
  @IsNotEmpty({ message: '驳回时必须填写驳回原因' })
  @MaxLength(200, { message: '驳回原因最多 200 字' })
  reviewNote: string;

  @ApiPropertyOptional({ example: '已联系付款行核实，无此笔', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: '内部备注最多 200 字' })
  adminNote?: string | null;
}

/**
 * 管理员手工调整余额请求体。
 * amountCents 为正=加钱，负=扣钱；非零与单笔上限在 service 校验。
 */
export class AdminAdjustDto {
  @ApiProperty({ example: 'u_xxx', description: '目标用户ID' })
  @IsString()
  @IsNotEmpty({ message: '目标用户ID不能为空' })
  targetUserId: string;

  @ApiProperty({ example: 5000, description: '调整金额，单位分，正=加钱、负=扣钱' })
  @IsInt({ message: '调整金额必须为整数（分）' })
  @IsNotEmpty()
  amountCents: number;

  @ApiPropertyOptional({ example: '客服补偿', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: '调整原因最多 200 字' })
  note?: string;
}

export class TransferDto {
  @ApiProperty({ example: 'friend@example.com', description: '收款方账号（邮箱）' })
  @IsString()
  @MaxLength(100)
  toAccount: string;

  @ApiProperty({ example: 5000, description: '转账金额，单位分（5000 = ¥50.00）' })
  @IsInt()
  @Min(MIN_TXN_CENTS)
  amountCents: number;

  @ApiProperty({
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: '幂等键（前端生成 UUID），重复请求不会重复扣款',
  })
  @IsString()
  @MaxLength(64)
  requestId: string;

  @ApiPropertyOptional({ example: 'AA 转账', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string | null;

  @ApiProperty({ example: '123456', description: '6 位支付密码' })
  @IsString()
  paymentPassword: string;
}

/**
 * 逐用户对账修复。
 * - balance：以流水为准，只把余额表修正为流水加总（不产生新流水，推荐）
 * - ledger：以余额为准，只补一笔差额流水（余额不变）
 * 金额由服务端按当前账实计算，前端不得传金额。
 */
export class ReconcileFixDto {
  @ApiProperty({ example: 'u_xxx', description: '目标用户ID' })
  @IsString()
  @IsNotEmpty({ message: '目标用户ID不能为空' })
  targetUserId: string;

  @ApiPropertyOptional({
    enum: ['balance', 'ledger'],
    default: 'balance',
    description: '修复方向：balance=以流水为准修正余额（推荐）；ledger=以余额为准补流水',
  })
  @IsOptional()
  @IsIn(['balance', 'ledger'])
  mode?: 'balance' | 'ledger';

  @ApiPropertyOptional({ example: '历史账实差异修复', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: '备注最多 200 字' })
  note?: string;
}

/** 设置支付密码（首次）。 */
export class SetupPaymentPasswordDto {
  @ApiProperty({ example: '123456', description: '6 位数字支付密码' })
  @IsString()
  @Matches(/^\d{6}$/, { message: '支付密码必须是 6 位数字' })
  paymentPassword: string;
}

/** 修改支付密码。 */
export class ChangePaymentPasswordDto {
  @ApiProperty({ example: '123456', description: '原支付密码' })
  @IsString()
  oldPassword: string;

  @ApiProperty({ example: '654321', description: '新支付密码（6 位数字）' })
  @IsString()
  @Matches(/^\d{6}$/, { message: '新支付密码必须是 6 位数字' })
  newPassword: string;
}
