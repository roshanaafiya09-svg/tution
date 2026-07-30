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
import { TutorSubjectsService } from './tutor-subjects.service';
import { CreateTutorSubjectDto } from './dto/create-tutor-subject.dto';

@Controller('tutor-subjects')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('tutor')
export class TutorSubjectsController {
  constructor(private readonly tutorSubjectsService: TutorSubjectsService) {}

  @Get('me')
  listOwn(@CurrentUser() user: AccessTokenPayload) {
    return this.tutorSubjectsService.listForTutor(user.sub);
  }

  @Post()
  create(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: CreateTutorSubjectDto,
  ) {
    return this.tutorSubjectsService.create(user.sub, dto);
  }

  @Delete(':id')
  delete(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.tutorSubjectsService.delete(user.sub, id);
  }
}
