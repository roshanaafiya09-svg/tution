import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../identity/auth/guards/roles.guard';
import { Roles } from '../../identity/auth/decorators/roles.decorator';
import { CurrentUser } from '../../identity/auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../../identity/auth/tokens.service';
import { AcademyReviewsService } from './academy-reviews.service';
import { SubmitAcademyReviewDto } from './dto/submit-academy-review.dto';

@Controller('marketplace/academy-reviews')
export class AcademyReviewsController {
  constructor(private readonly academyReviewsService: AcademyReviewsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('student')
  submit(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: SubmitAcademyReviewDto,
  ) {
    return this.academyReviewsService.submit(user.sub, dto);
  }

  /** Public — feeds the academy's discovery card/profile page. */
  @Get('academy/:academyId')
  listForAcademy(@Param('academyId') academyId: string) {
    return this.academyReviewsService.listForAcademy(academyId);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('student')
  listOwn(@CurrentUser() user: AccessTokenPayload) {
    return this.academyReviewsService.listOwn(user.sub);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('student')
  remove(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.academyReviewsService.remove(user.sub, id);
  }
}
