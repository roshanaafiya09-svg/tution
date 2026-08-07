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
 * Learns users' chat ids. A Telegram bot can't message anyone who
 * hasn't messaged it first, so the only way to get a chat id is to read
 * the bot's own inbound updates and match a `/start <token>` against a
 * pending link request.
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
        // request URL and must not reach the logs.
        this.logger.error(
          `Update poll failed: ${err instanceof Error ? err.message : 'unknown error'}`,
        );
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
    const text = update.message?.text?.trim();
    const chatId = update.message?.chat?.id;
    if (!text || chatId === undefined) return;

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
    const linked = await this.linkRepository.markLinked(token, String(chatId));
    if (!linked) {
      // Expired, already-consumed, or fabricated token. The reply is
      // deliberately identical either way so a stranger can't probe for
      // which tokens are live.
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
    // between issuing the token and the user pressing Start, and
    // recording it here keeps that account usable.
    const request = await this.linkRepository.findByToken(token);
    if (request) {
      const user = await this.usersRepository.findByIdentifier(
        request.identifier,
      );
      if (user && !user.telegram_chat_id) {
        await this.usersRepository.setTelegramChatId(user.id, String(chatId));
      }
    }

    await this.reply(
      chatId,
      'Telegram connected. Head back to the app and request your code.',
    );
  }

  private async reply(chatId: number, text: string): Promise<void> {
    const botToken = this.config.getOrThrow<string>('telegram.botToken');
    try {
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text }),
      });
    } catch (err) {
      // A failed courtesy reply must not abort the link itself — the
      // chat id is already recorded by this point.
      this.logger.warn(
        `Could not reply to chat: ${err instanceof Error ? err.message : 'unknown error'}`,
      );
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
