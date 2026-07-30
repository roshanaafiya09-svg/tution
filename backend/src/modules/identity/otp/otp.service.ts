import { randomInt, createHash } from 'node:crypto';
import {
  Inject,
  Injectable,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { OtpRepository } from './otp.repository';
import { OTP_PROVIDER } from './providers/otp-provider.interface';
import type { OtpProvider } from './providers/otp-provider.interface';

const CODE_TTL_MS = 5 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 5;
const REQUEST_WINDOW_MS = 15 * 60 * 1000;
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

  async requestOtp(phoneE164: string): Promise<void> {
    const recentCount = await this.otpRepository.countRecentRequests(
      phoneE164,
      new Date(Date.now() - REQUEST_WINDOW_MS),
    );
    if (recentCount >= MAX_REQUESTS_PER_WINDOW) {
      throw new BadRequestException('Too many OTP requests. Try again later.');
    }

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    await this.otpRepository.create(
      phoneE164,
      hashCode(code),
      new Date(Date.now() + CODE_TTL_MS),
    );
    await this.otpProvider.send(phoneE164, code);
  }

  async verifyOtp(phoneE164: string, code: string): Promise<void> {
    const challenge = await this.otpRepository.findLatestActive(phoneE164);
    if (!challenge) {
      throw new UnauthorizedException(
        'No active OTP for this number. Request a new one.',
      );
    }
    if (new Date(challenge.expires_at) < new Date()) {
      throw new UnauthorizedException('OTP expired. Request a new one.');
    }
    if (challenge.attempts >= MAX_VERIFY_ATTEMPTS) {
      throw new UnauthorizedException(
        'Too many incorrect attempts. Request a new OTP.',
      );
    }

    if (hashCode(code) !== challenge.code_hash) {
      await this.otpRepository.incrementAttempts(challenge.id);
      throw new UnauthorizedException('Incorrect OTP.');
    }

    await this.otpRepository.consume(challenge.id);
  }
}
