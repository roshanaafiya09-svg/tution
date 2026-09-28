jest.mock('../../../database/database.module', () => ({
  KYSELY_CONNECTION: 'KYSELY_CONNECTION',
}));

import { createValidationPipe } from '../../../common/http/app-setup';
import type { AccessTokenPayload } from '../../identity/auth/tokens.service';
import { DeviceTokensController } from './device-tokens.controller';
import type { DeviceTokensRepository } from './device-tokens.repository';
import { RegisterDeviceTokenDto } from './dto/register-device-token.dto';
import { UnregisterDeviceTokenDto } from './dto/unregister-device-token.dto';

const TOKEN = 'a'.repeat(40);
const user = { sub: 'user-from-jwt', roles: ['student'] } as AccessTokenPayload;

describe('DeviceTokensController — identity comes from the JWT only', () => {
  const build = () => {
    const repo = {
      upsert: jest.fn().mockResolvedValue(undefined),
      deleteForUser: jest.fn().mockResolvedValue(undefined),
    };
    return {
      repo,
      controller: new DeviceTokensController(
        repo as unknown as DeviceTokensRepository,
      ),
    };
  };

  it('register upserts under the authenticated user, defaulting to android', async () => {
    const { controller, repo } = build();
    await controller.register(user, { token: TOKEN });
    expect(repo.upsert).toHaveBeenCalledWith('user-from-jwt', TOKEN, 'android');
  });

  it("unregister removes only the authenticated user's own row", async () => {
    const { controller, repo } = build();
    await controller.unregister(user, { token: TOKEN });
    expect(repo.deleteForUser).toHaveBeenCalledWith('user-from-jwt', TOKEN);
  });
});

describe('device-token DTO validation (the production ValidationPipe)', () => {
  const pipe = createValidationPipe();
  const run = (metatype: new () => object, value: unknown) =>
    pipe.transform(value, { type: 'body', metatype });

  it('accepts a normal registration', async () => {
    await expect(
      run(RegisterDeviceTokenDto, { token: TOKEN, platform: 'android' }),
    ).resolves.toBeDefined();
  });

  it('rejects a client-supplied userId / user_id — the client cannot pick an owner', async () => {
    await expect(
      run(RegisterDeviceTokenDto, { token: TOKEN, userId: 'someone-else' }),
    ).rejects.toThrow();
    await expect(
      run(RegisterDeviceTokenDto, { token: TOKEN, user_id: 'someone-else' }),
    ).rejects.toThrow();
    await expect(
      run(UnregisterDeviceTokenDto, { token: TOKEN, userId: 'someone-else' }),
    ).rejects.toThrow();
  });

  it.each([
    [{ token: 'short' }],
    [{ token: 123 }],
    [{}],
    [{ token: TOKEN, platform: 'windows' }],
  ])('rejects malformed body %j', async (body) => {
    await expect(run(RegisterDeviceTokenDto, body)).rejects.toThrow();
  });
});
