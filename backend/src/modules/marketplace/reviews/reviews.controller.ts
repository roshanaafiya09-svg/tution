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
import { ReviewsService } from './reviews.service';
import { SubmitReviewDto } from './dto/submit-review.dto';

@Controller('marketplace/reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('student')
  submit(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: SubmitReviewDto,
  ) {
    return this.reviewsService.submit(user.sub, dto);
  }

  /** Public — feeds the tutor's discovery/SEO page (blueprint §10 Phase 4). */
  @Get('tutor/:tutorId')
  listForTutor(@Param('tutorId') tutorId: string) {
    return this.reviewsService.listForTutor(tutorId);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('student')
  listOwn(@CurrentUser() user: AccessTokenPayload) {
    return this.reviewsService.listOwn(user.sub);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('student')
  remove(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.reviewsService.remove(user.sub, id);
  }
}
