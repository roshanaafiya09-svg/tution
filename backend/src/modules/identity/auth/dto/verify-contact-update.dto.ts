import { IsEmail, IsString, Length } from 'class-validator';

/** POST /auth/contact/verify — step 2 of the self-service email change
 *  (see AuthService.confirmEmailUpdate). `email` must match what
 *  POST /auth/contact was called with in step 1. */
export class VerifyContactUpdateDto {
  @IsEmail(undefined, { message: 'email must be a valid email address' })
  email!: string;

  @IsString()
  @Length(6, 6, { message: 'code must be exactly 6 digits' })
  code!: string;
}
