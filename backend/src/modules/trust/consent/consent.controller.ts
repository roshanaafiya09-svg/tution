import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { JwtAuthGuard } from '../../identity/auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../identity/auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../../identity/auth/tokens.service';
import { ConsentService } from './consent.service';
import { RecordConsentDto } from './dto/record-consent.dto';

/**
 * DPDP Act 2023 (blueprint §9): "consent records versioned and stored".
 * Records the consent grant itself for any authenticated user; verifiable
 * *parental* consent for minors lands with parent accounts in Phase 2.
 */
@Controller('consent')
@UseGuards(JwtAuthGuard)
export class ConsentController {
  constructor(private readonly service: ConsentService) {}

  @Post()
  record(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: RecordConsentDto,
    @Req() request: FastifyRequest,
  ) {
    const userAgent: string | undefined = request.headers['user-agent'];
    return this.service.record(
      user.sub,
      dto,
      request.ip ?? null,
      userAgent ?? null,
    );
  }

  @Get('me')
  listOwn(@CurrentUser() user: AccessTokenPayload) {
    return this.service.listOwn(user.sub);
  }
}
