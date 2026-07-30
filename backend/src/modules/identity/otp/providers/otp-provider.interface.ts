export const OTP_PROVIDER = 'OTP_PROVIDER';

/**
 * Blueprint §4: WhatsApp OTP (Meta Cloud API) primary, SMS fallback.
 * Both need real provider credentials this environment doesn't have, so
 * this stays behind an interface — swap in a Meta Cloud API / SMS
 * implementation without touching OtpService.
 */
export interface OtpProvider {
  send(phoneE164: string, code: string): Promise<void>;
}
