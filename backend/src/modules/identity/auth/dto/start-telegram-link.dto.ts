import { IsLoginIdentifier } from './identifier.validator';

export class StartTelegramLinkDto {
  /** The phone number or email the account will sign in with. */
  @IsLoginIdentifier()
  identifier!: string;
}
