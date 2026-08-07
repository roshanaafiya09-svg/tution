export const OTP_PROVIDER = 'OTP_PROVIDER';

/**
 * Where to actually deliver a code — phone_e164 alone is enough for
 * WhatsApp/console, but Email and Telegram need a destination that isn't
 * derivable from a phone number. Optional and additive: existing
 * providers ignore it entirely.
 */
export interface OtpContact {
  email?: string;
  telegramChatId?: string;
}

export type OtpChannel = 'console' | 'whatsapp' | 'email' | 'telegram';

/**
 * Blueprint §4: WhatsApp OTP (Meta Cloud API) primary, SMS fallback.
 * Email/Telegram sit below it as cheaper channels that don't need a Meta
 * Business account. Every implementation is behind this interface —
 * swap the active one via IdentityModule's provider-selection factory
 * without touching OtpService.
 */
export interface OtpProvider {
  /** Tags which delivery channel this is — see IdentityModule's
   *  selection factory and AuthService's contact-persistence logic,
   *  which only trusts a contact field it can attribute to this. */
  readonly channel: OtpChannel;
  send(phoneE164: string, code: string, contact?: OtpContact): Promise<void>;
}
