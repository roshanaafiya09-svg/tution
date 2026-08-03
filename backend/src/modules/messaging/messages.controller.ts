import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../identity/auth/guards/roles.guard';
import { Roles } from '../identity/auth/decorators/roles.decorator';
import { CurrentUser } from '../identity/auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../identity/auth/tokens.service';
import { MessagesService } from './messages.service';
import { SendMessageDto } from './dto/send-message.dto';

@Controller('messages')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  /** Every thread the caller is part of, most-recently-active first. */
  @Get('mine')
  @Roles('tutor', 'student', 'parent')
  listMine(@CurrentUser() user: AccessTokenPayload) {
    return this.messagesService.listMine(user);
  }

  @Get('batch/:batchId/student/:studentId')
  @Roles('tutor', 'student', 'parent')
  listThread(
    @CurrentUser() user: AccessTokenPayload,
    @Param('batchId') batchId: string,
    @Param('studentId') studentId: string,
  ) {
    return this.messagesService.listThread(user, batchId, studentId);
  }

  @Post('batch/:batchId/student/:studentId')
  @Roles('tutor', 'student', 'parent')
  send(
    @CurrentUser() user: AccessTokenPayload,
    @Param('batchId') batchId: string,
    @Param('studentId') studentId: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.messagesService.send(user, batchId, studentId, dto.body);
  }
}
