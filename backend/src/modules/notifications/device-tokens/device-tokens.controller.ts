import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../identity/auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../identity/auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../../identity/auth/tokens.service';
import { DeviceTokensRepository } from './device-tokens.repository';
import { RegisterDeviceTokenDto } from './dto/register-device-token.dto';
import { UnregisterDeviceTokenDto } from './dto/unregister-device-token.dto';

@Controller('notifications/device-tokens')
@UseGuards(JwtAuthGuard)
export class DeviceTokensController {
  constructor(private readonly repository: DeviceTokensRepository) {}

  @Post()
  register(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: RegisterDeviceTokenDto,
  ) {
    return this.repository.upsert(
      user.sub,
      dto.token,
      dto.platform ?? 'android',
    );
  }

  /**
   * Sign-out: detach this device from the signed-in user so their
   * notifications stop reaching a phone they've logged out of. POST with
   * the token in the body (not DELETE /:token) so it never lands in a URL
   * or access log. Identity is the JWT; only the caller's own row can go.
   */
  @Post('unregister')
  @HttpCode(200)
  unregister(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: UnregisterDeviceTokenDto,
  ) {
    return this.repository.deleteForUser(user.sub, dto.token);
  }
}
