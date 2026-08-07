import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

/** POST /auth/contact — self-service, requires an existing session. See
 *  UsersRepository.updateContact. */
export class UpdateContactDto {
  @IsOptional()
  @IsEmail(undefined, { message: 'email must be a valid email address' })
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  telegramChatId?: string;
}
