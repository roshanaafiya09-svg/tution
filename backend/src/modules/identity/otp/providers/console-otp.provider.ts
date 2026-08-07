import { Injectable, Logger } from '@nestjs/common';
import { OtpProvider } from './otp-provider.interface';

/**
 * Dev-only stand-in for the WhatsApp/SMS OTP provider — logs the code
 * instead of sending it. Replace with a real Meta Cloud API client
 * before any non-local environment: see OtpProvider.
 */
@Injectable()
export class ConsoleOtpProvider implements OtpProvider {
  readonly channel = 'console' as const;
  private readonly logger = new Logger('OTP (dev)');

  send(phoneE164: string, code: string): Promise<void> {
    this.logger.warn(
      `OTP for ${phoneE164}: ${code} (dev provider — not actually sent)`,
    );
    return Promise.resolve();
  }
}
