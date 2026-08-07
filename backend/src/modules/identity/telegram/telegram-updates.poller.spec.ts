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

function contactUpdate(
  phoneNumber: string,
  chatId = 555,
  userId = chatId,
) {
  return {
    update_id: 2,
    message: {
      chat: { id: chatId },
      contact: { phone_number: phoneNumber, user_id: userId },
    },
  };
}

describe('TelegramUpdatesPoller', () => {
  let linkRepo: jest.Mocked<
    Pick<
      TelegramLinkRepository,
      | 'markAwaitingContact'
      | 'markLinked'
      | 'findByToken'
      | 'findByPendingChatId'
    >
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
      markAwaitingContact: jest.fn().mockResolvedValue(true),
      markLinked: jest.fn().mockResolvedValue(true),
      findByToken: jest.fn().mockResolvedValue(null),
      findByPendingChatId: jest.fn().mockResolvedValue(null),
    };
    usersRepo = {
      findByIdentifier: jest.fn().mockResolvedValue(undefined),
      setTelegramChatId: jest.fn().mockResolvedValue(undefined),
    };
    fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  describe('/start <token> — stage 1, does not link yet', () => {
    it('marks the chat as awaiting contact rather than linking immediately', async () => {
      await handle(build(), startUpdate('/start abc123', 4242));

      expect(linkRepo.markAwaitingContact).toHaveBeenCalledWith(
        'abc123',
        '4242',
      );
      expect(linkRepo.markLinked).not.toHaveBeenCalled();
    });

    it('asks the chat to share its phone number via a request_contact button', async () => {
      await handle(build(), startUpdate('/start abc123'));

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.reply_markup.keyboard[0][0].request_contact).toBe(true);
    });

    it('does not start polling at all when no bot token is configured', () => {
      const poller = build(fakeConfigService({}));
      poller.onModuleInit();

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('tells the user to use the app link on a bare /start', async () => {
      await handle(build(), startUpdate('/start'));

      expect(linkRepo.markAwaitingContact).not.toHaveBeenCalled();
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.text).toContain('Connect Telegram');
    });

    it('reports an expired/unknown token instead of silently ignoring it', async () => {
      linkRepo.markAwaitingContact.mockResolvedValue(false);

      await handle(build(), startUpdate('/start staletoken'));

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.text).toContain('expired');
    });

    it('ignores updates with no text or no chat', async () => {
      const poller = build();
      await handle(poller, { update_id: 1, message: {} });
      await handle(poller, { update_id: 2 });

      expect(linkRepo.markAwaitingContact).not.toHaveBeenCalled();
    });

    it('does not fail when the courtesy reply errors', async () => {
      fetchMock.mockRejectedValue(new TypeError('fetch failed'));

      await expect(
        handle(build(), startUpdate('/start abc123')),
      ).resolves.toBeUndefined();
      expect(linkRepo.markAwaitingContact).toHaveBeenCalled();
    });

    it('never puts the bot token in an outgoing message body', async () => {
      await handle(build(), startUpdate('/start abc123'));

      const body = fetchMock.mock.calls[0][1].body as string;
      expect(body).not.toContain('test-bot-token');
    });
  });

  describe('contact share — stage 2, the actual ownership check', () => {
    it('links only when the shared phone matches the identifier being claimed', async () => {
      linkRepo.findByPendingChatId.mockResolvedValue({
        token: 'abc123',
        request: { identifier: '+919812399001', pendingChatId: '4242' },
      });

      await handle(build(), contactUpdate('919812399001', 4242));

      expect(linkRepo.markLinked).toHaveBeenCalledWith('abc123', '4242');
    });

    it("refuses to link when the shared phone doesn't match — this is the vulnerability fix", async () => {
      // The attacker's own Telegram account, sharing THEIR real number,
      // while the pending request is for someone else's phone number —
      // exactly the "entered my sister's number" scenario.
      linkRepo.findByPendingChatId.mockResolvedValue({
        token: 'abc123',
        request: { identifier: '+919812399001', pendingChatId: '4242' },
      });

      await handle(build(), contactUpdate('+919999999999', 4242));

      expect(linkRepo.markLinked).not.toHaveBeenCalled();
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.text).toContain("doesn't match");
    });

    it('normalizes a phone number missing its leading + before comparing', async () => {
      linkRepo.findByPendingChatId.mockResolvedValue({
        token: 'abc123',
        request: { identifier: '+919812399001', pendingChatId: '4242' },
      });

      // Telegram commonly omits the '+' — this must still match.
      await handle(build(), contactUpdate('919812399001', 4242));

      expect(linkRepo.markLinked).toHaveBeenCalledWith('abc123', '4242');
    });

    it('ignores a contact share from a chat with no pending link', async () => {
      linkRepo.findByPendingChatId.mockResolvedValue(null);

      await handle(build(), contactUpdate('+919812399001', 4242));

      expect(linkRepo.markLinked).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('reports an expired link if markLinked fails after a matching contact', async () => {
      linkRepo.findByPendingChatId.mockResolvedValue({
        token: 'abc123',
        request: { identifier: '+919812399001', pendingChatId: '4242' },
      });
      linkRepo.markLinked.mockResolvedValue(false);

      await handle(build(), contactUpdate('919812399001', 4242));

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.text).toContain('expired');
    });

    it('backfills an account created between issuing the token and finishing verification', async () => {
      linkRepo.findByPendingChatId.mockResolvedValue({
        token: 'abc123',
        request: { identifier: '+919812399001', pendingChatId: '4242' },
      });
      usersRepo.findByIdentifier.mockResolvedValue({
        id: 'user-1',
        telegram_chat_id: null,
      } as never);

      await handle(build(), contactUpdate('919812399001', 4242));

      expect(usersRepo.setTelegramChatId).toHaveBeenCalledWith(
        'user-1',
        '4242',
      );
    });

    it('never overwrites a chat id already linked to an account', async () => {
      linkRepo.findByPendingChatId.mockResolvedValue({
        token: 'abc123',
        request: { identifier: '+919812399001', pendingChatId: '4242' },
      });
      usersRepo.findByIdentifier.mockResolvedValue({
        id: 'user-1',
        telegram_chat_id: '111',
      } as never);

      await handle(build(), contactUpdate('919812399001', 4242));

      expect(usersRepo.setTelegramChatId).not.toHaveBeenCalled();
    });

    it('never puts the bot token in an outgoing message body', async () => {
      linkRepo.findByPendingChatId.mockResolvedValue({
        token: 'abc123',
        request: { identifier: '+919812399001', pendingChatId: '4242' },
      });

      await handle(build(), contactUpdate('919812399001', 4242));

      const body = fetchMock.mock.calls[0][1].body as string;
      expect(body).not.toContain('test-bot-token');
    });
  });
});
