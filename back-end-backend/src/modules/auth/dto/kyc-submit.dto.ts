import { ApiProperty } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * 实名认证提交入参。
 * 证件三要素（真实姓名 + 证件类型 + 证件号码）只能通过本接口提交，
 * 由管理员审核后生效；普通资料修改接口不允许直接改这些字段。
 */
export class KycSubmitDto {
  @ApiProperty({
    description: '真实姓名，2-50 个字符，须与证件一致。',
    example: '张三',
    minLength: 2,
    maxLength: 50,
  })
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  realName: string;

  @ApiProperty({
    description: '证件类型：1身份证、2护照、3港澳通行证、4台胞证、9其他（与字典 id_type 对应）。',
    example: 1,
    enum: [1, 2, 3, 4, 9],
  })
  @IsInt()
  @IsIn([1, 2, 3, 4, 9])
  idType: number;

  @ApiProperty({
    description: '证件号码，6-50 个字符，仅允许字母、数字与少量常见证件符号。',
    example: '110101199001011234',
    minLength: 6,
    maxLength: 50,
  })
  @IsString()
  @MinLength(6)
  @MaxLength(50)
  @Matches(/^[A-Za-z0-9()（）·-]+$/, {
    message: '证件号码格式不正确',
  })
  idNumber: string;
}
