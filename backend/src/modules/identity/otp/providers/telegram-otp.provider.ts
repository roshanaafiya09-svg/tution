import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OtpContact, OtpProvider } from './otp-provider.interface';

interface TelegramErrorResponse {
  ok: false;
  error_code?: number;
  description?: string;
}

/**
 * Sends OTPs via the official Telegram Bot API's sendMessage method —
 * the only real delivery channel (ConsoleOtpProvider is the
 * no-credentials dev fallback). Telegram's platform rule is that a bot
 * can only message a chat that has *already* started a conversation
 * with it (no cold-messaging a username), so contact.telegramChatId
 * must be the numeric chat id captured by the linking flow (see
 * TelegramLinkService / TelegramUpdatesPoller), never a client-supplied
 * value or an @username.
 */
@Injectable()
export class TelegramOtpProvider implements OtpProvider {
  readonly channel = 'telegram' as const;
  private readonly logger = new Logger('OTP (Telegram)');

  constructor(private readonly config: ConfigService) {}

  async send(
    identifier: string,
    code: string,
    contact?: OtpContact,
  ): Promise<void> {
    const chatId = contact?.telegramChatId;
    if (!chatId) {
      // AuthService gates on a linked chat id before ever calling this,
      // so reaching here means a wiring bug, not user error.
      throw new BadRequestException(
        'Telegram is not linked for this account yet.',
      );
    }

    const botToken = this.config.getOrThrow<string>('telegram.botToken');

    let response: Response;
    try {
      response = await fetch(
        `https://api.telegram.org/bot${botToken}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: `Your verification code is ${code}. It expires in 5 minutes.`,
          }),
        },
      );
    } catch (err) {
      // fetch() itself throws for DNS/connection/timeout failures —
      // never include the bot token (only ever in the URL we requested,
      // never in what we caught here), just the failure reason.
      this.logger.error(
        `Telegram send failed: could not reach api.telegram.org (${err instanceof Error ? err.message : 'unknown network error'})`,
      );
      throw new ServiceUnavailableException(
        'Could not reach Telegram to send the code — try again shortly.',
      );
    }

    if (response.ok) return;

    const body = (await response
      .json()
      .catch(() => ({}) as TelegramErrorResponse)) as TelegramErrorResponse;
    const description = body.description ?? 'unknown error';

    // Server-side diagnostics only ever include Telegram's own error
    // description — never the bot token, headers, or request body.
    this.logger.error(
      `Telegram send failed (HTTP ${response.status}): ${description}`,
    );

    if (response.status === 429) {
      throw new ServiceUnavailableException(
        'OTP delivery is busy right now — try again in a moment.',
      );
    }

    if (response.status === 401 || response.status === 403) {
      // 401 = bad bot token (operator-configuration problem); 403 = this
      // chat blocked the bot or never started one — either way, not
      // something the caller can retry their way past.
      throw new ServiceUnavailableException(
        'OTP delivery is temporarily unavailable.',
      );
    }

    if (response.status === 400) {
      // Malformed/unknown chat_id — most commonly a chat that never
      // messaged the bot first, which Telegram also reports as 400.
      throw new BadRequestException(
        'Could not deliver to that Telegram chat — make sure you started a chat with the bot first.',
      );
    }

    throw new InternalServerErrorException('Failed to send OTP via Telegram');
  }
}
