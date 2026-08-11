import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OtpProvider } from './otp-provider.interface';

/**
 * Development-only stand-in for EmailOtpProvider — logs the code
 * instead of sending it, so local dev and tests work with no Brevo
 * account. IdentityModule's OTP_PROVIDER factory only ever falls back
 * to this outside production, and hard-fails at startup instead of
 * reaching here if production is missing Brevo credentials. The
 * NODE_ENV check in send() below is defense-in-depth for that same
 * guarantee, not the primary safeguard.
 */
@Injectable()
export class ConsoleOtpProvider implements OtpProvider {
  readonly channel = 'console' as const;
  private readonly logger = new Logger('OTP (dev)');

  constructor(private readonly config: ConfigService) {}

  send(identifier: string, code: string): Promise<void> {
    if (this.config.get<string>('app.nodeEnv') === 'production') {
      // Should be unreachable — IdentityModule's factory refuses to
      // wire this provider up in production. Thrown, not logged, so a
      // real OTP code can never end up in a production log line.
      throw new Error(
        'ConsoleOtpProvider must never run in production — this is a bug in OTP_PROVIDER selection, not a missing credential.',
      );
    }

    this.logger.warn(
      `OTP for ${identifier}: ${code} (dev provider — not actually sent)`,
    );
    return Promise.resolve();
  }
}
