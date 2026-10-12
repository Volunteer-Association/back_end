import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class OAuthExchangeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  code: string;
}
