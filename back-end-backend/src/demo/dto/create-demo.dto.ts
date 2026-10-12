import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/** API 演示资源的创建字段；演示服务当前仅返回模拟结果，不写入数据库。 */
export class CreateDemoDto {
  @ApiProperty({
    description: '演示记录名称。',
    example: '测试数据',
    maxLength: 100,
  })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiProperty({
    description: '演示记录的简短说明。',
    example: '这是一个测试数据',
    required: false,
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
