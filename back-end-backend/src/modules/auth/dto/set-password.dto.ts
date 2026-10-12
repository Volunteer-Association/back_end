import {
  IsOptional,
  Matches,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class SetPasswordDto {
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{3,60}$/)
  username?: string;

  @IsOptional()
  @IsString()
  @MaxLength(72)
  currentPassword?: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  newPassword: string;
}
