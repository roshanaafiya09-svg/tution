import { Controller, Delete, Get, HttpCode, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../identity/auth/guards/jwt-auth.guard';
import { CurrentUser } from '../identity/auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../identity/auth/tokens.service';
import { AccountService } from './account.service';

@Controller('account')
@UseGuards(JwtAuthGuard)
export class AccountController {
  constructor(private readonly accountService: AccountService) {}

  @Get('export')
  exportData(@CurrentUser() user: AccessTokenPayload) {
    return this.accountService.exportData(user.sub, user.roles);
  }

  @Delete('me')
  @HttpCode(200)
  async deleteAccount(@CurrentUser() user: AccessTokenPayload) {
    await this.accountService.deleteAccount(user.sub);
    return { deleted: true };
  }
}
