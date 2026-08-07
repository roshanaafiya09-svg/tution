import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsersRepository } from '../users/users.repository';
import { identifierType, normalizeIdentifier } from '../identifier.util';
import { TelegramLinkRepository } from './telegram-link.repository';

const MAX_LINK_REQUESTS_PER_WINDOW = 5;
const LINK_REQUEST_WINDOW_SECONDS = 15 * 60;

export interface StartLinkResult {
  token: string;
  deepLink: string;
}

@Injectable()
export class TelegramLinkService {
  constructor(
    private readonly config: ConfigService,
    private readonly linkRepository: TelegramLinkRepository,
    private readonly usersRepository: UsersRepository,
  ) {}

  /**
   * Issues a one-time token and the t.me deep link that carries it.
   *
   * Self-linking is deliberately allowed ONLY for an identifier with no
   * account yet. If an existing account could be linked by whoever asks
   * first, an attacker could enter someone else's phone/email, attach
   * their own Telegram, and receive that account's login codes — a full
   * takeover, since the OTP *is* the credential. An existing unlinked
   * account therefore gets a 409 and has to be linked out-of-band.
   *
   * Even for a brand-new identifier, "whoever presses Start owns it" is
   * not actually true on its own — pressing Start only proves control of
   * *some* Telegram chat, not of the phone number/email being claimed.
   * `TelegramUpdatesPoller` closes that gap for phone numbers by making
   * the chat prove ownership via Telegram's own request_contact button
   * (a platform-verified phone, not user-typed text) before it's ever
   * treated as linked. Telegram has no equivalent proof for an email
   * address, so a brand-new *email* identifier is refused here — new
   * accounts can only be created via phone; email becomes available as
   * a login identifier once it's added to an already-verified account
   * (see POST /auth/contact, which requires being signed in already).
   */
  async startLink(rawIdentifier: string): Promise<StartLinkResult> {
    const identifier = normalizeIdentifier(rawIdentifier);

    const botUsername = this.config.get<string>('telegram.botUsername');
    if (!botUsername) {
      throw new ServiceUnavailableException(
        'Telegram sign-in is not configured on this server.',
      );
    }

    const requestCount = await this.linkRepository.incrementRequestCount(
      identifier,
      LINK_REQUEST_WINDOW_SECONDS,
    );
    if (requestCount > MAX_LINK_REQUESTS_PER_WINDOW) {
      throw new BadRequestException(
        'Too many link attempts. Try again later.',
      );
    }

    const user = await this.usersRepository.findByIdentifier(identifier);
    if (user) {
      if (user.telegram_chat_id) {
        throw new ConflictException(
          'This account already has Telegram connected — request a code instead.',
        );
      }
      throw new ConflictException(
        'This account predates Telegram sign-in and needs to be connected by support before you can sign in.',
      );
    }

    if (identifierType(identifier) !== 'phone') {
      throw new BadRequestException(
        'New accounts need a phone number to sign up — Telegram has no way to verify an email address belongs to you. Sign up with your phone, then add your email afterward from your profile.',
      );
    }

    // 32 hex chars from a CSPRNG — this token is what proves a given
    // Telegram chat belongs to a given signup attempt, so it must not be
    // guessable by someone trying to hijack a pending link.
    const token = randomBytes(16).toString('hex');
    await this.linkRepository.create(token, identifier);

    return {
      token,
      deepLink: `https://t.me/${botUsername}?start=${token}`,
    };
  }

  /** Polled by the client while the user is off in Telegram. */
  async linkStatus(token: string): Promise<{ linked: boolean }> {
    const request = await this.linkRepository.findByToken(token);
    return { linked: Boolean(request?.chatId) };
  }

  /** The chat id to deliver to, or null if this identifier has no
   *  completed link waiting. Used by AuthService for signup, where no
   *  account row exists to read a chat id from yet. */
  async linkedChatIdFor(identifier: string): Promise<string | null> {
    const request = await this.linkRepository.findByIdentifier(identifier);
    return request?.chatId ?? null;
  }
}
