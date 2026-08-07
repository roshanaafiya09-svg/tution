import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CONNECTION } from '../../../database/redis.module';

export interface TelegramLinkRequest {
  identifier: string;
  /** Set once the user actually pressed Start and the poller saw it. */
  chatId?: string;
}

/** Long enough to switch apps, open Telegram and press Start without
 *  rushing; short enough that an abandoned token isn't claimable later. */
const LINK_TTL_SECONDS = 15 * 60;

/**
 * Pending Telegram link requests. Redis rather than Postgres for the
 * same reason OTP challenges are (see OtpRepository): short-lived,
 * TTL-expiring, high-churn, and worthless once consumed.
 *
 * Two keys per request because both lookup directions are needed: the
 * poller only knows the token (from `/start <token>`), while
 * AuthService.requestOtp only knows the identifier the user typed.
 */
@Injectable()
export class TelegramLinkRepository {
  constructor(@Inject(REDIS_CONNECTION) private readonly redis: Redis) {}

  private tokenKey(token: string): string {
    return `tg:link:token:${token}`;
  }

  private identifierKey(identifier: string): string {
    return `tg:link:id:${identifier}`;
  }

  private rateLimitKey(identifier: string): string {
    return `tg:link:ratelimit:${identifier}`;
  }

  async create(token: string, identifier: string): Promise<void> {
    const request: TelegramLinkRequest = { identifier };
    await this.redis
      .multi()
      .set(this.tokenKey(token), JSON.stringify(request), 'EX', LINK_TTL_SECONDS)
      .set(this.identifierKey(identifier), token, 'EX', LINK_TTL_SECONDS)
      .exec();
  }

  async findByToken(token: string): Promise<TelegramLinkRequest | null> {
    const raw = await this.redis.get(this.tokenKey(token));
    return raw ? (JSON.parse(raw) as TelegramLinkRequest) : null;
  }

  async findByIdentifier(
    identifier: string,
  ): Promise<TelegramLinkRequest | null> {
    const token = await this.redis.get(this.identifierKey(identifier));
    return token ? this.findByToken(token) : null;
  }

  /**
   * Records the chat id against an existing request. Returns false if
   * the token expired or never existed — the poller uses that to reply
   * "this link expired" instead of silently doing nothing. KEEPTTL so a
   * completed link doesn't outlive its original window.
   */
  async markLinked(token: string, chatId: string): Promise<boolean> {
    const key = this.tokenKey(token);
    const raw = await this.redis.get(key);
    if (!raw) return false;

    const request = JSON.parse(raw) as TelegramLinkRequest;
    request.chatId = chatId;
    await this.redis.set(key, JSON.stringify(request), 'KEEPTTL');
    return true;
  }

  async consume(token: string, identifier: string): Promise<void> {
    await this.redis
      .multi()
      .del(this.tokenKey(token))
      .del(this.identifierKey(identifier))
      .exec();
  }

  /** Same shape as OtpRepository.incrementRequestCount — starting a link
   *  is as spammable as requesting a code, so it gets its own limiter. */
  async incrementRequestCount(
    identifier: string,
    windowSeconds: number,
  ): Promise<number> {
    const key = this.rateLimitKey(identifier);
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, windowSeconds);
    }
    return count;
  }
}
