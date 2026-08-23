import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OtpContact, OtpProvider } from './otp-provider.interface';

const BREVO_SEND_URL = 'https://api.brevo.com/v3/smtp/email';

interface BrevoErrorBody {
  message?: string;
  code?: string;
}

/**
 * Sends OTPs over Brevo's transactional email HTTPS API — the sole
 * real delivery channel (ConsoleOtpProvider is the no-credentials dev
 * fallback). Needs contact.email; callers without one on file get a
 * clear 400 rather than a silent failure.
 *
 * HTTPS, not SMTP, deliberately: Render's free tier blocks outbound
 * traffic to SMTP ports (25/465/587) entirely, which is what this
 * provider replaced Nodemailer/Gmail SMTP for — see
 * email-otp-migration-plan.md. The sender identity is SMTP_USER's
 * value (the address already verified as this app's Brevo sender),
 * not a new env var — SMTP_HOST/PORT/PASS/FROM are unused here but
 * deliberately left in place; see env.validation.ts.
 */
@Injectable()
export class EmailOtpProvider implements OtpProvider {
  readonly channel = 'email' as const;
  private readonly logger = new Logger('OTP (Email)');

  constructor(private readonly config: ConfigService) {}

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

    const apiKey = this.config.getOrThrow<string>('email.brevoApiKey');
    const senderEmail = this.config.getOrThrow<string>('email.smtpUser');

    let response: Response;
    try {
      response = await fetch(BREVO_SEND_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'api-key': apiKey,
        },
        body: JSON.stringify({
          sender: { email: senderEmail, name: 'Scholar' },
          to: [{ email: to }],
          subject: `Your Scholar login code: ${code}`,
          // Plain text only, no HTML — better deliverability and the
          // code stays readable straight from the notification.
          textContent: `Your verification code is ${code}.\n\nThis code expires in 5 minutes. If you didn't request this, you can ignore this email.`,
        }),
      });
    } catch (err) {
      // fetch() itself throws for DNS/connection/timeout failures —
      // never include the API key (only ever in a header we sent,
      // never in what we caught here), just the failure reason.
      this.logger.error(
        `Email send failed: could not reach Brevo (${err instanceof Error ? err.message : 'unknown network error'})`,
      );
      throw new ServiceUnavailableException(
        'Could not send the code by email — try again shortly.',
      );
    }

    if (response.ok) return;

    const body = (await response.json().catch(() => ({}))) as BrevoErrorBody;

    // Server-side diagnostics only ever include Brevo's own error
    // description — never the API key, headers, or request body.
    this.logger.error(
      `Email send failed (HTTP ${response.status}): ${body.message ?? 'unknown error'}`,
    );
    throw new ServiceUnavailableException(
      'Could not send the code by email — try again shortly.',
    );
  }
}
