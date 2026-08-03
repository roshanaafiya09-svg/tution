import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InvitesRepository } from './invites.repository';
import { BatchesService } from '../batches/batches.service';
import type { CreateInviteDto } from './dto/create-invite.dto';
import { AnalyticsService } from '../../analytics/analytics.service';

const DEFAULT_MAX_USES = 50;
const DEFAULT_EXPIRY_DAYS = 30;

@Injectable()
export class InvitesService {
  constructor(
    private readonly repository: InvitesRepository,
    private readonly batchesService: BatchesService,
    private readonly analytics: AnalyticsService,
  ) {}

  async create(tutorId: string, batchId: string, dto: CreateInviteDto) {
    await this.batchesService.getOwnedBatch(tutorId, batchId);

    const token = randomBytes(12).toString('base64url');
    const expiresAt = new Date(
      Date.now() +
        (dto.expiresInDays ?? DEFAULT_EXPIRY_DAYS) * 24 * 60 * 60 * 1000,
    );

    const invite = await this.repository.create(
      tutorId,
      batchId,
      token,
      expiresAt,
      dto.maxUses ?? DEFAULT_MAX_USES,
    );

    this.analytics.capture(tutorId, 'invite_created', { batchId });

    return invite;
  }

  async listForBatch(tutorId: string, batchId: string) {
    await this.batchesService.getOwnedBatch(tutorId, batchId);
    return this.repository.listForBatch(batchId);
  }

  /**
   * Public preview so the invite landing page can show what the student
   * is joining before they sign up (blueprint §4: "lands pre-enrolled",
   * no empty states).
   */
  async preview(token: string) {
    const invite = await this.repository.findByToken(token);
    if (!invite) throw new NotFoundException('Invite not found');

    const batch = await this.batchesService.getBatchForInvite(invite.batch_id);
    return {
      batchTitle: batch.title,
      expiresAt: invite.expires_at,
      isExhausted: invite.used_count >= invite.max_uses,
      isExpired: new Date(invite.expires_at) <= new Date(),
    };
  }

  async redeem(token: string, studentId: string) {
    const invite = await this.repository.findByToken(token);
    if (!invite) throw new NotFoundException('Invite not found');

    const claimed = await this.repository.claimUse(token);
    if (!claimed) {
      throw new BadRequestException(
        'This invite link has expired or is fully used',
      );
    }

    return this.batchesService.enroll(invite.batch_id, studentId, 'invite');
  }
}
