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
 * Sends OTPs over SMTP via Nodemailer — the sole real delivery channel
 * (ConsoleOtpProvider is the no-credentials dev fallback). Needs
 * contact.email; callers without one on file get a clear 400 rather
 * than a silent failure.
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
    identifier: string,
    code: string,
    contact?: OtpContact,
  ): Promise<void> {
    const to = contact?.email;
    if (!to) {
      throw new BadRequestException(
        'Email OTP delivery requires an email address on the account.',
      );
    }

    const from = this.config.getOrThrow<string>('email.smtpFrom');
    const transporter = this.getTransporter();

    try {
      await transporter.sendMail({
        from,
        to,
        subject: `Your Scholar login code: ${code}`,
        // Plain text only, no HTML — better Gmail deliverability and
        // the code stays readable straight from the notification.
        // "5 minutes" matches the real TTL, OtpService.CODE_TTL_SECONDS
        // — corrected from an earlier "10 minutes" that didn't.
        text: `Your verification code is ${code}.\n\nThis code expires in 5 minutes. If you didn't request this, you can ignore this email.`,
      });
    } catch (err) {
      // Never log the OTP itself or SMTP credentials — only the
      // failure reason, same discipline as TelegramOtpProvider.
      this.logger.error(
        `Email send failed: ${err instanceof Error ? err.message : 'unknown SMTP error'}`,
      );
      throw new ServiceUnavailableException(
        'Could not send the code by email — try again shortly.',
      );
    }
  }
}
