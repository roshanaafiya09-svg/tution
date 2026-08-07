export const OTP_PROVIDER = 'OTP_PROVIDER';

/**
 * Where to actually deliver a code. A Telegram bot can only message a
 * chat that has already messaged it, so the chat id can't be derived
 * from the login identifier (phone or email) the way an SMS number
 * could — it has to be captured up front by the linking flow (see
 * TelegramLinkService) and passed in here.
 */
export interface OtpContact {
  telegramChatId?: string;
}

export type OtpChannel = 'console' | 'telegram';

/**
 * Telegram is the only real delivery channel; ConsoleOtpProvider is the
 * zero-credential dev fallback that logs the code instead of sending it.
 * IdentityModule's factory picks between them on whether a bot token is
 * configured — swapping the active one never touches OtpService.
 */
export interface OtpProvider {
  readonly channel: OtpChannel;
  send(identifier: string, code: string, contact?: OtpContact): Promise<void>;
}
