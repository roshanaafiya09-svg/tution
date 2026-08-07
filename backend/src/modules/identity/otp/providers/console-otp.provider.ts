import { Injectable, Logger } from '@nestjs/common';
import { OtpProvider } from './otp-provider.interface';

/**
 * Dev-only stand-in for TelegramOtpProvider — logs the code instead of
 * sending it, so local dev and tests work with no bot token and no
 * Telegram account. IdentityModule falls back to this whenever
 * TELEGRAM_BOT_TOKEN is unset; never reached in an environment that has
 * one configured.
 */
@Injectable()
export class ConsoleOtpProvider implements OtpProvider {
  readonly channel = 'console' as const;
  private readonly logger = new Logger('OTP (dev)');

  send(identifier: string, code: string): Promise<void> {
    this.logger.warn(
      `OTP for ${identifier}: ${code} (dev provider — not actually sent)`,
    );
    return Promise.resolve();
  }
}
