import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateSessionSettingsDto {
  @ApiProperty({
    description: '是否允许同一账号在多个设备同时登录',
    example: false,
  })
  @IsBoolean()
  allowMultiLogin: boolean;
}
