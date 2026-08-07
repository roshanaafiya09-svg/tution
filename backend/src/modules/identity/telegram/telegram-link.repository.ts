import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CONNECTION } from '../../../database/redis.module';

export interface TelegramLinkRequest {
  identifier: string;
  /**
   * Set once `/start <token>` is seen, before the link is trusted — the
   * chat we've asked to prove it owns `identifier` by sharing its
   * Telegram-verified phone number. NOT the same as being linked: a
   * chat_id only ever reaches `chatId` below once that phone number is
   * confirmed to match. See TelegramUpdatesPoller.
   */
  pendingChatId?: string;
  /** Set only once the pending chat's shared contact phone number was
   *  confirmed to match `identifier` — this is what "linked" means. */
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

  private pendingChatKey(chatId: string): string {
    return `tg:link:pending-chat:${chatId}`;
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
   * Records that `/start <token>` was seen from `chatId`, without yet
   * trusting it — this chat still has to prove ownership by sharing its
   * contact (see TelegramUpdatesPoller). Returns false if the token
   * expired or never existed. The reverse pointer is what lets the
   * *next* update (a `contact` message, which carries no token) find its
   * way back to this pending request.
   */
  async markAwaitingContact(token: string, chatId: string): Promise<boolean> {
    const key = this.tokenKey(token);
    const raw = await this.redis.get(key);
    if (!raw) return false;

    const request = JSON.parse(raw) as TelegramLinkRequest;
    request.pendingChatId = chatId;
    await this.redis
      .multi()
      .set(key, JSON.stringify(request), 'KEEPTTL')
      .set(this.pendingChatKey(chatId), token, 'EX', LINK_TTL_SECONDS)
      .exec();
    return true;
  }

  /** Finds the pending request a chat is mid-verifying, if any — used to
   *  route an incoming `contact` share back to the token it belongs to.
   *  Returns the token too since `markLinked` needs it and the caller
   *  otherwise has no way to know it (only the chat id, from Telegram). */
  async findByPendingChatId(
    chatId: string,
  ): Promise<{ token: string; request: TelegramLinkRequest } | null> {
    const token = await this.redis.get(this.pendingChatKey(chatId));
    if (!token) return null;
    const request = await this.findByToken(token);
    return request ? { token, request } : null;
  }

  /**
   * Finalizes the link once the shared contact's phone number has been
   * confirmed to match — this, not `markAwaitingContact`, is what
   * `linkedChatIdFor`/the status endpoint mean by "linked". Returns
   * false if the token expired or never existed. KEEPTTL so a completed
   * link doesn't outlive its original window.
   */
  async markLinked(token: string, chatId: string): Promise<boolean> {
    const key = this.tokenKey(token);
    const raw = await this.redis.get(key);
    if (!raw) return false;

    const request = JSON.parse(raw) as TelegramLinkRequest;
    request.chatId = chatId;
    await this.redis
      .multi()
      .set(key, JSON.stringify(request), 'KEEPTTL')
      .del(this.pendingChatKey(chatId))
      .exec();
    return true;
  }

  async consume(token: string, identifier: string): Promise<void> {
    const request = await this.findByToken(token);
    const multi = this.redis
      .multi()
      .del(this.tokenKey(token))
      .del(this.identifierKey(identifier));
    if (request?.pendingChatId) {
      multi.del(this.pendingChatKey(request.pendingChatId));
    }
    await multi.exec();
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
