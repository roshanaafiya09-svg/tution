import {
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { TelegramLinkRepository } from './telegram-link.repository';
import type { UsersRepository } from '../users/users.repository';

// UsersRepository pulls in Kysely, which ships ESM that this Jest setup
// can't transform. Every repository here is mocked anyway, so stub the
// module rather than loading a DB client no assertion touches.
jest.mock('../users/users.repository', () => ({ UsersRepository: class {} }));

import { TelegramLinkService } from './telegram-link.service';

const CONFIG: Record<string, string> = {
  'telegram.botUsername': 'scholar_otp_bot',
};

function fakeConfigService(overrides: Record<string, string> = {}) {
  const values = { ...CONFIG, ...overrides };
  return {
    get: (key: string) => values[key],
  } as unknown as ConfigService;
}

describe('TelegramLinkService', () => {
  let linkRepo: jest.Mocked<Pick<TelegramLinkRepository, 'create' | 'incrementRequestCount' | 'findByToken' | 'findByIdentifier'>>;
  let usersRepo: jest.Mocked<Pick<UsersRepository, 'findByIdentifier'>>;

  function build(config = fakeConfigService()) {
    return new TelegramLinkService(
      config,
      linkRepo as unknown as TelegramLinkRepository,
      usersRepo as unknown as UsersRepository,
    );
  }

  beforeEach(() => {
    linkRepo = {
      create: jest.fn().mockResolvedValue(undefined),
      incrementRequestCount: jest.fn().mockResolvedValue(1),
      findByToken: jest.fn(),
      findByIdentifier: jest.fn(),
    };
    usersRepo = { findByIdentifier: jest.fn().mockResolvedValue(undefined) };
  });

  it('issues a token and deep link for an identifier with no account', async () => {
    const result = await build().startLink('+919876543210');

    expect(result.deepLink).toBe(
      `https://t.me/scholar_otp_bot?start=${result.token}`,
    );
    expect(result.token).toMatch(/^[0-9a-f]{32}$/);
    expect(linkRepo.create).toHaveBeenCalledWith(result.token, '+919876543210');
  });

  it('lower-cases an email identifier so casing cannot fork the account', async () => {
    await build().startLink('Student@Example.COM');

    expect(linkRepo.create).toHaveBeenCalledWith(
      expect.any(String),
      'student@example.com',
    );
    expect(usersRepo.findByIdentifier).toHaveBeenCalledWith(
      'student@example.com',
    );
  });

  it('refuses to link an existing account that has no Telegram yet (takeover guard)', async () => {
    usersRepo.findByIdentifier.mockResolvedValue({
      id: 'u1',
      telegram_chat_id: null,
    } as never);

    await expect(build().startLink('+919876543210')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(linkRepo.create).not.toHaveBeenCalled();
  });

  it('refuses to re-link an account that is already connected', async () => {
    usersRepo.findByIdentifier.mockResolvedValue({
      id: 'u1',
      telegram_chat_id: '4242',
    } as never);

    await expect(build().startLink('+919876543210')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(linkRepo.create).not.toHaveBeenCalled();
  });

  it('rate-limits link attempts per identifier', async () => {
    linkRepo.incrementRequestCount.mockResolvedValue(6);

    await expect(build().startLink('+919876543210')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(linkRepo.create).not.toHaveBeenCalled();
  });

  it('is unavailable rather than broken when no bot username is configured', async () => {
    const config = { get: () => undefined } as unknown as ConfigService;

    await expect(build(config).startLink('+919876543210')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('reports linked only once a chat id has been recorded', async () => {
    const service = build();

    linkRepo.findByToken.mockResolvedValue({ identifier: '+91987', chatId: '42' });
    await expect(service.linkStatus('tok')).resolves.toEqual({ linked: true });

    linkRepo.findByToken.mockResolvedValue({ identifier: '+91987' });
    await expect(service.linkStatus('tok')).resolves.toEqual({ linked: false });

    linkRepo.findByToken.mockResolvedValue(null);
    await expect(service.linkStatus('tok')).resolves.toEqual({ linked: false });
  });

  it('never returns the chat id to the client, only a boolean', async () => {
    linkRepo.findByToken.mockResolvedValue({
      identifier: '+919876543210',
      chatId: '999999',
    });

    const status = await build().linkStatus('tok');

    expect(JSON.stringify(status)).not.toContain('999999');
  });
});
