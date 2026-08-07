import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';
import { OtpContact, OtpProvider } from './otp-provider.interface';

/**
 * Sends OTPs over SMTP via Nodemailer. Ranks below WhatsApp, above
 * Telegram in IdentityModule's provider-selection factory — free/cheap
 * compared to a Meta Business account, at the cost of email deliverability
 * (spam folders, corporate filtering) WhatsApp doesn't have.
 *
 * Needs contact.email — there's no way to derive an address from
 * phone_e164, so callers without one on file (new signups, or existing
 * accounts that never set one) get a clear 400 telling them to supply it.
 * See otp-provider.interface.ts's OtpContact and AuthService, which is
 * what actually resolves/persists that address.
 */
@Injectable()
export class EmailOtpProvider implements OtpProvider {
  readonly channel = 'email' as const;
  private readonly logger = new Logger('OTP (Email)');
  private transporter: Transporter | undefined;

  constructor(private readonly config: ConfigService) {}

  private getTransporter(): Transporter {
    if (this.transporter) return this.transporter;

    const host = this.config.getOrThrow<string>('email.smtpHost');
    const port = this.config.getOrThrow<number>('email.smtpPort');
    const user = this.config.getOrThrow<string>('email.smtpUser');
    const pass = this.config.getOrThrow<string>('email.smtpPass');

    this.transporter = createTransport({
      host,
      port,
      // 465 is SMTPS (implicit TLS); everything else (587, 25) uses
      // STARTTLS, which nodemailer negotiates automatically when
      // `secure: false` — hardcoding secure=true for any other port
      // would break the common 587 case.
      secure: port === 465,
      auth: { user, pass },
    });
    return this.transporter;
  }

  async send(
    phoneE164: string,
    code: string,
    contact?: OtpContact,
  ): Promise<void> {
    const to = contact?.email;
    if (!to) {
      throw new BadRequestException(
        'Email OTP delivery requires an email address — include "email" in the request.',
      );
    }

    const from = this.config.getOrThrow<string>('email.smtpFrom');
    const transporter = this.getTransporter();

    try {
      await transporter.sendMail({
        from,
        to,
        subject: `${code} is your verification code`,
        text: plainTextBody(code),
        html: htmlBody(code),
      });
    } catch (err) {
      // Never log the OTP itself or SMTP credentials — only the failure
      // reason, same discipline as WhatsAppCloudApiOtpProvider.
      this.logger.error(
        `Email send failed: ${err instanceof Error ? err.message : 'unknown SMTP error'}`,
      );
      throw new ServiceUnavailableException(
        'Could not send the code by email — try again shortly.',
      );
    }
  }
}

function plainTextBody(code: string): string {
  return `Your verification code is ${code}.\n\nThis code expires in 5 minutes. If you didn't request this, you can ignore this email.`;
}

function htmlBody(code: string): string {
  return `<!doctype html>
<html>
  <body style="font-family: sans-serif; color: #1a1a1a;">
    <p>Your verification code is:</p>
    <p style="font-size: 28px; font-weight: bold; letter-spacing: 4px;">${code}</p>
    <p style="color: #666; font-size: 13px;">This code expires in 5 minutes. If you didn't request this, you can ignore this email.</p>
  </body>
</html>`;
}
