import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../identity/auth/guards/roles.guard';
import { Roles } from '../../identity/auth/decorators/roles.decorator';
import { CurrentUser } from '../../identity/auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../../identity/auth/tokens.service';
import { FeesService } from './fees.service';
import { GeneratePeriodDto } from './dto/generate-period.dto';
import { RecordPaymentDto } from './dto/record-payment.dto';

function currentPeriodLabel(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

@Controller('fees')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FeesController {
  constructor(private readonly feesService: FeesService) {}

  @Post('batch/:batchId/generate')
  @Roles('tutor')
  generate(
    @CurrentUser() user: AccessTokenPayload,
    @Param('batchId') batchId: string,
    @Body() dto: GeneratePeriodDto,
  ) {
    return this.feesService.generateForBatch(user.sub, batchId, dto);
  }

  /** The monthly "who hasn't paid" view (blueprint §4). */
  @Get('period')
  @Roles('tutor')
  listForPeriod(
    @CurrentUser() user: AccessTokenPayload,
    @Query('period') period?: string,
  ) {
    return this.feesService.listForPeriod(
      user.sub,
      period ?? currentPeriodLabel(),
    );
  }

  @Get('period/totals')
  @Roles('tutor')
  totals(
    @CurrentUser() user: AccessTokenPayload,
    @Query('period') period?: string,
  ) {
    return this.feesService.periodTotals(
      user.sub,
      period ?? currentPeriodLabel(),
    );
  }

  @Get('me')
  @Roles('student')
  listOwn(@CurrentUser() user: AccessTokenPayload) {
    return this.feesService.listForStudent(user.sub);
  }

  /** Parent's view of a consented child's fee history (blueprint §3). */
  @Get('student/:studentId')
  @Roles('parent')
  listForStudent(
    @CurrentUser() user: AccessTokenPayload,
    @Param('studentId') studentId: string,
  ) {
    return this.feesService.listForParent(user.sub, studentId);
  }

  @Post(':id/record-payment')
  @Roles('tutor')
  recordPayment(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() dto: RecordPaymentDto,
  ) {
    return this.feesService.recordPayment(
      user.sub,
      id,
      dto.paidMinor,
      dto.note ?? null,
    );
  }

  @Post(':id/waive')
  @Roles('tutor')
  waive(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body('note') note?: string,
  ) {
    return this.feesService.waive(user.sub, id, note ?? null);
  }
}
