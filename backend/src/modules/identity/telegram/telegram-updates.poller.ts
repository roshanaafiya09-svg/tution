import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TelegramLinkRepository } from './telegram-link.repository';
import { UsersRepository } from '../users/users.repository';

interface TelegramUpdate {
  update_id: number;
  message?: {
    text?: string;
    chat?: { id?: number };
    contact?: {
      phone_number?: string;
      /** Telegram guarantees this equals the sender's own id when a
       *  contact reaches a bot via a request_contact button tap — that
       *  UI can only ever share the tapping account's own contact card,
       *  never an arbitrary one, so this is what makes the phone number
       *  below trustworthy rather than just user-supplied text. */
      user_id?: number;
    };
  };
}

interface GetUpdatesResponse {
  ok: boolean;
  result?: TelegramUpdate[];
}

/** Telegram holds the request open this long when there's nothing new,
 *  so an idle bot costs ~2 requests/minute rather than constant polling. */
const LONG_POLL_TIMEOUT_SECONDS = 25;
const ERROR_BACKOFF_MS = 5_000;

/**
 * Learns users' chat ids — and, critically, verifies they're allowed to
 * claim the identifier they're signing up with before recording them.
 *
 * `/start <token>` alone only proves control of *some* Telegram chat; it
 * says nothing about whether the phone number typed into the signup
 * form belongs to that chat. Pressing Start used to be treated as
 * sufficient on its own, which let anyone bind their own Telegram to a
 * phone number they don't own (e.g. a family member's). The fix: after
 * `/start <token>`, the chat is asked to tap a `request_contact` button
 * — a Telegram-native UI element that can only ever share the tapping
 * account's own, platform-verified phone number, never an arbitrary
 * one. Only once that number matches the identifier being linked does
 * `markLinked` ever get called. See TelegramLinkService.startLink for
 * the other half of this: it now refuses to issue a token for a
 * brand-new *email* identifier at all, since Telegram has no equivalent
 * ownership proof for email — this contact-share check is meaningless
 * without an actual phone number to compare against.
 *
 * Long-polling `getUpdates` rather than a webhook: no public URL is
 * needed, so this works identically in local dev and on Render, and the
 * whole flow is testable without a tunnel. The tradeoff is that exactly
 * one process may poll — a second instance would steal updates from the
 * first, since Telegram deletes an update once it's been confirmed via
 * `offset`. Fine on Render's single-instance free tier; scaling out
 * would mean switching to a webhook.
 */
@Injectable()
export class TelegramUpdatesPoller implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Telegram (updates)');
  private running = false;
  private offset = 0;
  private loop: Promise<void> | undefined;

  constructor(
    private readonly config: ConfigService,
    private readonly linkRepository: TelegramLinkRepository,
    private readonly usersRepository: UsersRepository,
  ) {}

  onModuleInit(): void {
    if (!this.config.get<string>('telegram.botToken')) {
      // No bot configured (local dev, CI) — ConsoleOtpProvider is
      // handling delivery, so there's nothing to link and no reason to
      // hold an outbound connection open.
      return;
    }
    this.running = true;
    this.loop = this.pollLoop();
  }

  async onModuleDestroy(): Promise<void> {
    this.running = false;
    // The in-flight getUpdates can hang for up to LONG_POLL_TIMEOUT_SECONDS;
    // awaiting it keeps shutdown from racing a half-processed update.
    await this.loop;
  }

  private async pollLoop(): Promise<void> {
    while (this.running) {
      try {
        const updates = await this.fetchUpdates();
        for (const update of updates) {
          // Advance past this update even if handling it throws —
          // otherwise one malformed message would be re-fetched forever.
          this.offset = update.update_id + 1;
          await this.handleUpdate(update);
        }
      } catch (err) {
        // Never let a transient Telegram/network failure kill the loop
        // or the app. Log the reason only — the bot token lives in the
        // request URL and must not reach the logs; describeError only
        // surfaces DNS/TCP-layer detail (e.g. ENOTFOUND, ECONNRESET),
        // which comes from the connection attempt, not the request.
        this.logger.error(`Update poll failed: ${describeError(err)}`);
        await this.sleep(ERROR_BACKOFF_MS);
      }
    }
  }

  private async fetchUpdates(): Promise<TelegramUpdate[]> {
    const botToken = this.config.getOrThrow<string>('telegram.botToken');
    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/getUpdates?offset=${this.offset}&timeout=${LONG_POLL_TIMEOUT_SECONDS}`,
    );

    if (!response.ok) {
      throw new Error(`getUpdates returned HTTP ${response.status}`);
    }

    const body = (await response.json()) as GetUpdatesResponse;
    return body.result ?? [];
  }

  private async handleUpdate(update: TelegramUpdate): Promise<void> {
    const chatId = update.message?.chat?.id;
    if (chatId === undefined) return;

    if (update.message?.contact) {
      await this.handleContactShare(chatId, update.message.contact);
      return;
    }

    const text = update.message?.text?.trim();
    if (!text) return;

    const match = /^\/start\s+(\S+)$/.exec(text);
    if (!match) {
      // A bare /start (no token) or any other chatter — the user opened
      // the bot directly rather than via our deep link.
      if (text.startsWith('/start')) {
        await this.reply(
          chatId,
          'Open the "Connect Telegram" link from the app to finish signing in.',
        );
      }
      return;
    }

    const token = match[1];
    const awaiting = await this.linkRepository.markAwaitingContact(
      token,
      String(chatId),
    );
    if (!awaiting) {
      // Expired, already-consumed, or fabricated token. The reply is
      // deliberately identical either way so a stranger can't probe for
      // which tokens are live.
      await this.reply(
        chatId,
        'That sign-in link has expired. Start again from the app.',
      );
      return;
    }

    await this.reply(
      chatId,
      'Almost done — tap the button below to confirm this is your number.',
      { requestContact: true },
    );
  }

  /**
   * The verification step this whole redesign exists for: only a
   * `contact` sharing from a Telegram-native request_contact button tap
   * reaches here, so `user_id` is guaranteed to be this chat's own —
   * there's no way this phone number could belong to someone else. If
   * it doesn't match what was typed into the signup form, this chat
   * simply isn't who it's claiming to be; refuse and leave the pending
   * request unlinked rather than trusting it anyway.
   */
  private async handleContactShare(
    chatId: number,
    contact: { phone_number?: string; user_id?: number },
  ): Promise<void> {
    const pending = await this.linkRepository.findByPendingChatId(
      String(chatId),
    );
    if (!pending || !contact.phone_number) return;

    const sharedPhone = normalizeTelegramPhone(contact.phone_number);
    if (sharedPhone !== pending.request.identifier) {
      await this.reply(
        chatId,
        "That phone number doesn't match the one you're signing up with. Open the Telegram account registered to that number and try again from the app.",
      );
      return;
    }

    const linked = await this.linkRepository.markLinked(
      pending.token,
      String(chatId),
    );
    if (!linked) {
      await this.reply(
        chatId,
        'That sign-in link has expired. Start again from the app.',
      );
      return;
    }

    // If the identifier already belongs to an account, persist the chat
    // id straight onto it. TelegramLinkService.startLink only issues
    // tokens for identifiers with no account, so this normally can't
    // happen — but an account could have been created in the window
    // between issuing the token and finishing verification here, and
    // recording it now keeps that account usable.
    const user = await this.usersRepository.findByIdentifier(
      pending.request.identifier,
    );
    if (user && !user.telegram_chat_id) {
      await this.usersRepository.setTelegramChatId(user.id, String(chatId));
    }

    await this.reply(
      chatId,
      'Telegram connected. Head back to the app and request your code.',
    );
  }

  private async reply(
    chatId: number,
    text: string,
    options?: { requestContact?: boolean },
  ): Promise<void> {
    const botToken = this.config.getOrThrow<string>('telegram.botToken');
    const body: Record<string, unknown> = { chat_id: chatId, text };
    if (options?.requestContact) {
      body.reply_markup = {
        keyboard: [[{ text: 'Share my phone number', request_contact: true }]],
        resize_keyboard: true,
        one_time_keyboard: true,
      };
    }
    try {
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (err) {
      // A failed reply must not abort the link itself — nothing here
      // has been recorded as linked until markLinked succeeds anyway.
      this.logger.warn(
        `Could not reply to chat: ${err instanceof Error ? err.message : 'unknown error'}`,
      );
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/** Telegram's contact.phone_number isn't guaranteed to include a
 *  leading '+' (format varies by client/locale) — strip everything but
 *  digits and re-add exactly one, matching the E.164 shape identifiers
 *  are already normalized to (see identifier.util.ts). */
function normalizeTelegramPhone(raw: string): string {
  return `+${raw.replace(/\D/g, '')}`;
}

/** Node's fetch wraps every network-level failure in a generic
 *  TypeError('fetch failed'); the actual reason (DNS, connection
 *  refused, TLS, timeout) is nested in `cause`. Surfacing cause's
 *  `code` turns an opaque log line into an actionable one. */
function describeError(err: unknown): string {
  if (!(err instanceof Error)) return 'unknown error';
  const cause = (err as { cause?: unknown }).cause;
  if (cause instanceof Error) {
    const code = (cause as NodeJS.ErrnoException).code;
    return code
      ? `${err.message} (${code}: ${cause.message})`
      : `${err.message} (${cause.message})`;
  }
  return err.message;
}
