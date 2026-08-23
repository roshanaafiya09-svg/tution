import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../identity/auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../identity/auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../../identity/auth/tokens.service';
import { DeviceTokensRepository } from './device-tokens.repository';
import { RegisterDeviceTokenDto } from './dto/register-device-token.dto';

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
}
