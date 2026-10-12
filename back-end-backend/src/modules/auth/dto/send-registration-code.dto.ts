import { IsEmail, MaxLength } from 'class-validator';

export class SendRegistrationCodeDto {
  @IsEmail()
  @MaxLength(100)
  email: string;
}
