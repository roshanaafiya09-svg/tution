import type { ConfigService } from '@nestjs/config';
import type { TelegramLinkRepository } from './telegram-link.repository';
import type { UsersRepository } from '../users/users.repository';

// UsersRepository pulls in Kysely, which ships ESM that this Jest setup
// can't transform. Every repository here is mocked anyway, so stub the
// module rather than loading a DB client no assertion touches.
jest.mock('../users/users.repository', () => ({ UsersRepository: class {} }));

import { TelegramUpdatesPoller } from './telegram-updates.poller';

const CONFIG: Record<string, string> = {
  'telegram.botToken': 'test-bot-token',
};

function fakeConfigService(values: Record<string, string> = CONFIG) {
  return {
    get: (key: string) => values[key],
    getOrThrow: (key: string) => {
      const value = values[key];
      if (value === undefined) throw new Error(`missing config: ${key}`);
      return value;
    },
  } as unknown as ConfigService;
}

function startUpdate(text: string, chatId = 555) {
  return { update_id: 1, message: { text, chat: { id: chatId } } };
}

describe('TelegramUpdatesPoller', () => {
  let linkRepo: jest.Mocked<
    Pick<TelegramLinkRepository, 'markLinked' | 'findByToken'>
  >;
  let usersRepo: jest.Mocked<
    Pick<UsersRepository, 'findByIdentifier' | 'setTelegramChatId'>
  >;
  let fetchMock: jest.Mock;

  function build(config = fakeConfigService()) {
    return new TelegramUpdatesPoller(
      config,
      linkRepo as unknown as TelegramLinkRepository,
      usersRepo as unknown as UsersRepository,
    );
  }

  /** handleUpdate is the unit worth testing; the surrounding while-loop
   *  is an infinite poll that can't be driven directly from a test. */
  function handle(poller: TelegramUpdatesPoller, update: unknown) {
    return (
      poller as unknown as { handleUpdate(u: unknown): Promise<void> }
    ).handleUpdate(update);
  }

  beforeEach(() => {
    linkRepo = {
      markLinked: jest.fn().mockResolvedValue(true),
      findByToken: jest.fn().mockResolvedValue(null),
    };
    usersRepo = {
      findByIdentifier: jest.fn().mockResolvedValue(undefined),
      setTelegramChatId: jest.fn().mockResolvedValue(undefined),
    };
    fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('records the chat id from a /start carrying a token', async () => {
    await handle(build(), startUpdate('/start abc123', 4242));

    expect(linkRepo.markLinked).toHaveBeenCalledWith('abc123', '4242');
  });

  it('does not start polling at all when no bot token is configured', () => {
    const poller = build(fakeConfigService({}));
    poller.onModuleInit();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('tells the user to use the app link on a bare /start', async () => {
    await handle(build(), startUpdate('/start'));

    expect(linkRepo.markLinked).not.toHaveBeenCalled();
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.text).toContain('Connect Telegram');
  });

  it('reports an expired/unknown token instead of silently ignoring it', async () => {
    linkRepo.markLinked.mockResolvedValue(false);

    await handle(build(), startUpdate('/start staletoken'));

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.text).toContain('expired');
  });

  it('backfills an account created between issuing the token and pressing Start', async () => {
    linkRepo.findByToken.mockResolvedValue({ identifier: 'a@example.com' });
    usersRepo.findByIdentifier.mockResolvedValue({
      id: 'user-1',
      telegram_chat_id: null,
    } as never);

    await handle(build(), startUpdate('/start tok', 777));

    expect(usersRepo.setTelegramChatId).toHaveBeenCalledWith('user-1', '777');
  });

  it('never overwrites a chat id already linked to an account', async () => {
    linkRepo.findByToken.mockResolvedValue({ identifier: 'a@example.com' });
    usersRepo.findByIdentifier.mockResolvedValue({
      id: 'user-1',
      telegram_chat_id: '111',
    } as never);

    await handle(build(), startUpdate('/start tok', 999));

    expect(usersRepo.setTelegramChatId).not.toHaveBeenCalled();
  });

  it('ignores updates with no text or no chat', async () => {
    const poller = build();
    await handle(poller, { update_id: 1, message: {} });
    await handle(poller, { update_id: 2 });

    expect(linkRepo.markLinked).not.toHaveBeenCalled();
  });

  it('does not fail the link when the courtesy reply errors', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    await expect(
      handle(build(), startUpdate('/start abc123')),
    ).resolves.toBeUndefined();
    expect(linkRepo.markLinked).toHaveBeenCalled();
  });

  it('never puts the bot token in an outgoing message body', async () => {
    await handle(build(), startUpdate('/start abc123'));

    const body = fetchMock.mock.calls[0][1].body as string;
    expect(body).not.toContain('test-bot-token');
  });
});
