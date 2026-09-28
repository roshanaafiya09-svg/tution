const sendEach = jest.fn<Promise<unknown>, [{ token: string }[]]>();
jest.mock('firebase-admin/app', () => ({
  cert: (sa: unknown) => sa,
  initializeApp: () => ({}),
}));
jest.mock('firebase-admin/messaging', () => ({
  getMessaging: () => ({ sendEach }),
}));
jest.mock('../../../database/database.module', () => ({
  KYSELY_CONNECTION: 'KYSELY_CONNECTION',
}));

import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { FcmPushProvider } from './fcm-push.provider';
import type { DeviceTokensRepository } from '../device-tokens/device-tokens.repository';

/**
 * Stale-token cleanup. The error codes below are the ones the live FCM API
 * (via firebase-admin) actually returns — verified against the real API in
 * the FCM device-delivery verification. A misspelt code silently disables
 * cleanup for that failure class (this happened for UNREGISTERED tokens).
 */
describe('FcmPushProvider', () => {
  const serviceAccount = Buffer.from(
    JSON.stringify({ project_id: 'p' }),
  ).toString('base64');
  const config = {
    getOrThrow: () => serviceAccount,
  } as unknown as ConfigService;

  const build = (tokens: string[], userId = 'u1') => {
    const deleteTokens = jest.fn().mockResolvedValue(undefined);
    const findTokensForUsers = jest
      .fn()
      .mockResolvedValue(tokens.map((token) => ({ user_id: userId, token })));
    const repo = {
      findTokensForUsers,
      deleteTokens,
    } as unknown as DeviceTokensRepository;
    return {
      provider: new FcmPushProvider(config, repo),
      deleteTokens,
      findTokensForUsers,
    };
  };
  const failure = (code: string) => ({
    success: false,
    error: { code, message: code },
  });
  const push = [{ userId: 'u1', title: 't', body: 'b' }];

  beforeEach(() => sendEach.mockReset());

  describe('stale-token cleanup', () => {
    it.each([
      'messaging/registration-token-not-registered', // uninstalled / expired token
      'messaging/invalid-argument', // malformed token
      'messaging/invalid-registration-token',
    ])('removes the token when Firebase answers %s', async (code) => {
      sendEach.mockResolvedValue({ responses: [failure(code)] });
      const { provider, deleteTokens } = build(['tok-1']);
      await provider.send(push);
      expect(deleteTokens).toHaveBeenCalledWith(['tok-1']);
    });

    it('keeps the token on a transient/unrelated failure', async () => {
      sendEach.mockResolvedValue({
        responses: [failure('messaging/internal-error')],
      });
      const { provider, deleteTokens } = build(['tok-1']);
      await provider.send(push);
      expect(deleteTokens).not.toHaveBeenCalled();
    });

    it('keeps the token when the send succeeds', async () => {
      sendEach.mockResolvedValue({ responses: [{ success: true }] });
      const { provider, deleteTokens } = build(['tok-1']);
      await provider.send(push);
      expect(deleteTokens).not.toHaveBeenCalled();
    });
  });

  describe('multiple devices', () => {
    it('targets EVERY valid device of the student, one message each', async () => {
      sendEach.mockResolvedValue({
        responses: [{ success: true }, { success: true }],
      });
      const { provider, deleteTokens } = build(['dev-1', 'dev-2']);
      await provider.send(push);
      const sent = sendEach.mock.calls[0][0];
      expect(sent.map((m) => m.token)).toEqual(['dev-1', 'dev-2']);
      expect(deleteTokens).not.toHaveBeenCalled();
    });

    it('one valid + one stale: only the stale device is removed, the valid one is kept', async () => {
      sendEach.mockResolvedValue({
        responses: [
          { success: true }, // device 1 — valid
          failure('messaging/registration-token-not-registered'), // device 2
        ],
      });
      const { provider, deleteTokens } = build(['dev-1', 'dev-2']);
      await provider.send(push);
      expect(deleteTokens).toHaveBeenCalledTimes(1);
      expect(deleteTokens).toHaveBeenCalledWith(['dev-2']);
    });

    it('stale device listed FIRST does not take the valid one down with it', async () => {
      sendEach.mockResolvedValue({
        responses: [
          failure('messaging/registration-token-not-registered'),
          { success: true },
        ],
      });
      const { provider, deleteTokens } = build(['dev-1', 'dev-2']);
      await provider.send(push);
      expect(deleteTokens).toHaveBeenCalledWith(['dev-1']);
    });
  });

  describe('recipient scope (the provider never decides who is notified)', () => {
    it('looks up tokens for exactly the userIds it was handed — nobody else', async () => {
      const { provider, findTokensForUsers } = build([]);
      await provider.send([
        { userId: 'a', title: 't', body: 'b' },
        { userId: 'b', title: 't', body: 'b' },
        { userId: 'a', title: 't2', body: 'b2' },
      ]);
      expect(findTokensForUsers).toHaveBeenCalledWith(['a', 'b']);
    });

    it('sends nothing for an empty recipient list, and nothing for a user with no tokens', async () => {
      const { provider } = build([]);
      await provider.send([]);
      await provider.send(push);
      expect(sendEach).not.toHaveBeenCalled();
    });
  });

  describe('failure handling', () => {
    it('a provider-level outage propagates (NotificationsService catches it) and deletes nothing', async () => {
      sendEach.mockRejectedValue(new Error('network down'));
      const { provider, deleteTokens } = build(['tok-1']);
      await expect(provider.send(push)).rejects.toThrow('network down');
      expect(deleteTokens).not.toHaveBeenCalled();
    });

    it('never logs a device token, even when a send fails', async () => {
      const warn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      sendEach.mockResolvedValue({
        responses: [failure('messaging/internal-error')],
      });
      const { provider } = build(['SECRET-DEVICE-TOKEN-VALUE']);
      await provider.send(push);
      expect(warn).toHaveBeenCalled();
      for (const call of warn.mock.calls) {
        expect(String(call[0])).not.toContain('SECRET-DEVICE-TOKEN-VALUE');
      }
      warn.mockRestore();
    });
  });
});
