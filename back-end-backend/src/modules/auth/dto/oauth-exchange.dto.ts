import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class OAuthExchangeDto {
  @ApiProperty({
    description: 'OAuth 回调后由前端取得的一次性登录兑换码，不是第三方授权码。',
    example: 'a1b2c3d4e5f6',
    maxLength: 60,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  code: string;
}
