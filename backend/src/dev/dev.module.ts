import { Module } from '@nestjs/common';
import { IdentityModule } from '../modules/identity/identity.module';
import { DevAutoLoginController } from './dev-auto-login.controller';

/** See dev-auto-login.controller.ts for why this module is safe to exist. */
@Module({
  imports: [IdentityModule],
  controllers: [DevAutoLoginController],
})
export class DevModule {}
