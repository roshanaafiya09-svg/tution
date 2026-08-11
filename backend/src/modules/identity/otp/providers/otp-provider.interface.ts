export const OTP_PROVIDER = 'OTP_PROVIDER';

/** Where to actually deliver a code — currently always an email address. */
export interface OtpContact {
  email?: string;
}

export type OtpChannel = 'console' | 'email';

/**
 * Email (via Brevo's HTTPS API) is the only real delivery channel;
 * ConsoleOtpProvider is the development-only fallback that logs the
 * code instead of sending it. IdentityModule's OTP_PROVIDER factory
 * picks between them — swapping the active one never touches
 * OtpService.
 */
export interface OtpProvider {
  readonly channel: OtpChannel;
  send(identifier: string, code: string, contact?: OtpContact): Promise<void>;
}
