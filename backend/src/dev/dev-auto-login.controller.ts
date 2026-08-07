import { Controller, ForbiddenException, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsersRepository } from '../modules/identity/users/users.repository';
import { TokensService } from '../modules/identity/auth/tokens.service';

const DEV_SUPER_ADMIN_EMAIL = 'roshanaafiya09@gmail.com';

/**
 * Local-dev convenience only. This whole directory is excluded from the
 * production build (tsconfig.build.json) and only wired into AppModule
 * via a runtime-guarded require (see app.module.ts) — it never ships in
 * a production image. The NODE_ENV check below is defense-in-depth for
 * the unlikely case this ever runs outside that build (e.g. ts-node),
 * not the primary safeguard.
 */
@Controller('dev/auto-login')
export class DevAutoLoginController {
  constructor(
    private readonly config: ConfigService,
    private readonly usersRepository: UsersRepository,
    private readonly tokensService: TokensService,
  ) {}

  @Post()
  async autoLogin(): Promise<{ accessToken: string; refreshToken: string }> {
    if (this.config.get<string>('app.nodeEnv') === 'production') {
      throw new ForbiddenException('Not available in production');
    }

    const user = await this.usersRepository.findByEmail(DEV_SUPER_ADMIN_EMAIL);
    if (!user) {
      throw new ForbiddenException(
        'Dev Super Admin account does not exist yet — run migrations first (npm run migrate:up).',
      );
    }

    const roles = await this.usersRepository.getRoles(user.id);
    const accessToken = this.tokensService.signAccessToken(user.id, roles);
    const refreshToken = await this.tokensService.issueRefreshToken(
      user.id,
      'dev-auto-login',
    );

    return { accessToken, refreshToken };
  }
}
