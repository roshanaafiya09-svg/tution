import {
  BadRequestException,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { TelegramOtpProvider } from './telegram-otp.provider';

const CONFIG: Record<string, string> = {
  'telegram.botToken': 'test-bot-token',
};

function fakeConfigService(): ConfigService {
  return {
    getOrThrow: (key: string) => {
      const value = CONFIG[key];
      if (value === undefined) throw new Error(`missing config: ${key}`);
      return value;
    },
  } as unknown as ConfigService;
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

describe('TelegramOtpProvider', () => {
  let provider: TelegramOtpProvider;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    provider = new TelegramOtpProvider(fakeConfigService());
    fetchMock = jest.fn();
    global.fetch = fetchMock;
  });

  it('rejects when no chat id is supplied', async () => {
    await expect(
      provider.send('+919876543210', '123456'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the code and resolves on a 200', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true }));

    await expect(
      provider.send('+919876543210', '123456', { telegramChatId: '42' }),
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.telegram.org/bottest-bot-token/sendMessage',
      expect.objectContaining({ method: 'POST' }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.chat_id).toBe('42');
    expect(body.text).toContain('123456');
  });

  it('never puts the bot token in the outgoing message body', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true }));
    await provider.send('+919876543210', '123456', { telegramChatId: '42' });

    const body = fetchMock.mock.calls[0][1].body as string;
    expect(body).not.toContain('test-bot-token');
  });

  it('maps a network failure (fetch throwing) to ServiceUnavailableException', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    await expect(
      provider.send('+919876543210', '123456', { telegramChatId: '42' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('maps a 429 to ServiceUnavailableException', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(429, { ok: false, description: 'Too Many Requests' }),
    );

    await expect(
      provider.send('+919876543210', '123456', { telegramChatId: '42' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('maps a 401 (bad bot token) to ServiceUnavailableException', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(401, { ok: false, description: 'Unauthorized' }),
    );

    await expect(
      provider.send('+919876543210', '123456', { telegramChatId: '42' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('maps a 400 (bad/unstarted chat) to BadRequestException', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(400, {
        ok: false,
        description: 'Bad Request: chat not found',
      }),
    );

    await expect(
      provider.send('+919876543210', '123456', { telegramChatId: '42' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('falls back to InternalServerErrorException for anything unrecognized', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(500, { ok: false, description: 'Internal Server Error' }),
    );

    await expect(
      provider.send('+919876543210', '123456', { telegramChatId: '42' }),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('never leaks the bot token in a thrown error message', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(500, { ok: false, description: 'Internal Server Error' }),
    );

    try {
      await provider.send('+919876543210', '123456', { telegramChatId: '42' });
      fail('expected send() to throw');
    } catch (err) {
      expect((err as Error).message).not.toContain('test-bot-token');
    }
  });
});
