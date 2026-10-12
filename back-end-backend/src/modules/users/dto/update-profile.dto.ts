import {
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  nickname?: string | null;

  @IsOptional()
  @IsString()
  @Matches(/^\d{11}$/)
  mobile?: string | null;

  @IsOptional()
  @IsIn([0, 1, 2])
  sex?: number;
}
