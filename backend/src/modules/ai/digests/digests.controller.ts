import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../identity/auth/guards/roles.guard';
import { Roles } from '../../identity/auth/decorators/roles.decorator';
import { CurrentUser } from '../../identity/auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../../identity/auth/tokens.service';
import { DigestsService } from './digests.service';
import { GenerateDigestDto } from './dto/generate-digest.dto';

@Controller('digests')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DigestsController {
  constructor(private readonly digestsService: DigestsService) {}

  @Get('me')
  @Roles('parent')
  listMine(@CurrentUser() user: AccessTokenPayload) {
    return this.digestsService.listForParent(user.sub);
  }

  /** Manual stand-in for the Sunday-evening batch job (see DigestsService). */
  @Post('student/:studentId/generate')
  @Roles('parent')
  generate(
    @CurrentUser() user: AccessTokenPayload,
    @Param('studentId') studentId: string,
    @Body() dto: GenerateDigestDto,
  ) {
    return this.digestsService.generate(user.sub, studentId, dto);
  }
}
