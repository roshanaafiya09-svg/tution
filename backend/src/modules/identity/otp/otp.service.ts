import { randomInt, createHash } from 'node:crypto';
import {
  Inject,
  Injectable,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { OtpRepository } from './otp.repository';
import { OTP_PROVIDER } from './providers/otp-provider.interface';
import type {
  OtpChannel,
  OtpContact,
  OtpProvider,
} from './providers/otp-provider.interface';

const CODE_TTL_SECONDS = 5 * 60;
const MAX_REQUESTS_PER_WINDOW = 5;
const REQUEST_WINDOW_SECONDS = 15 * 60;
const MAX_VERIFY_ATTEMPTS = 5;

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

@Injectable()
export class OtpService {
  constructor(
    private readonly otpRepository: OtpRepository,
    @Inject(OTP_PROVIDER) private readonly otpProvider: OtpProvider,
  ) {}

  /** Which OtpProvider is currently active — AuthService uses this to
   *  decide which contact field (if any) a successful verification
   *  actually proved control of. See OtpProvider.channel. */
  get activeChannel(): OtpChannel {
    return this.otpProvider.channel;
  }

  async requestOtp(phoneE164: string, contact?: OtpContact): Promise<void> {
    const requestCount = await this.otpRepository.incrementRequestCount(
      phoneE164,
      REQUEST_WINDOW_SECONDS,
    );
    if (requestCount > MAX_REQUESTS_PER_WINDOW) {
      throw new BadRequestException('Too many OTP requests. Try again later.');
    }

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    await this.otpRepository.create(
      phoneE164,
      hashCode(code),
      CODE_TTL_SECONDS,
    );
    await this.otpProvider.send(phoneE164, code, contact);
  }

  /**
   * Validates the code but does NOT consume it — callers that might
   * still need another round-trip (e.g. asking a first-time signer-upper
   * which role to sign up as) must be able to re-check the same code.
   * Call consumeOtp() once the caller is committing to the result.
   */
  async checkOtp(phoneE164: string, code: string): Promise<void> {
    const challenge = await this.otpRepository.findActive(phoneE164);
    if (!challenge) {
      throw new UnauthorizedException(
        'No active OTP for this number. Request a new one.',
      );
    }
    if (challenge.attempts >= MAX_VERIFY_ATTEMPTS) {
      throw new UnauthorizedException(
        'Too many incorrect attempts. Request a new OTP.',
      );
    }

    if (hashCode(code) !== challenge.codeHash) {
      await this.otpRepository.incrementAttempts(phoneE164);
      throw new UnauthorizedException('Incorrect OTP.');
    }
  }

  consumeOtp(phoneE164: string): Promise<void> {
    return this.otpRepository.consume(phoneE164);
  }
}
