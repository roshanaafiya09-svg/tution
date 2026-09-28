jest.mock('../../database/database.module', () => ({
  KYSELY_CONNECTION: 'KYSELY_CONNECTION',
}));

import { Logger } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import type { NotificationsRepository } from './notifications.repository';
import type { PushMessage } from './push/push-provider.interface';

/**
 * The push provider is handed EXACTLY the recipients the notification rows
 * were written for — there is no second recipient-resolution path.
 */
describe('NotificationsService.notify → push', () => {
  const build = (delivered: string[]) => {
    const createMany = jest.fn().mockResolvedValue(delivered);
    const push = {
      send: jest
        .fn<Promise<void>, [PushMessage[]]>()
        .mockResolvedValue(undefined),
    };
    const whatsapp = { send: jest.fn().mockResolvedValue(undefined) };
    const service = new NotificationsService(
      { createMany } as unknown as NotificationsRepository,
      push,
      whatsapp,
    );
    return { service, createMany, push };
  };
  const input = (userIds: string[]) => ({
    userIds,
    type: 'class_cancelled',
    title: 'T',
    body: 'B',
  });

  it('pushes to exactly the users a row was written for', async () => {
    // 3 requested; the repository's eligibility gate (deleted user, departed
    // teacher…) or the dedupe key dropped "gone".
    const { service, push } = build(['a', 'b']);
    const result = await service.notify(input(['a', 'b', 'gone']));
    expect(result).toEqual(['a', 'b']);
    const sent = push.send.mock.calls[0][0];
    expect(sent.map((m) => m.userId)).toEqual(['a', 'b']);
  });

  it('sends NO push when every recipient was filtered/deduped (a repeat event)', async () => {
    const { service, push } = build([]);
    await service.notify(input(['a']));
    expect(push.send).not.toHaveBeenCalled();
  });

  it('a push failure never fails the triggering action and the rows still count as created', async () => {
    const error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const { service, push } = build(['a']);
    push.send.mockRejectedValue(new Error('FCM outage'));
    await expect(service.notify(input(['a']))).resolves.toEqual(['a']);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it('makes exactly one push call per event', async () => {
    const { service, push } = build(['a']);
    await service.notify(input(['a']));
    expect(push.send).toHaveBeenCalledTimes(1);
  });
});
