import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ParentLinksRepository } from './parent-links.repository';
import { ParentInviteRepository } from './parent-invite.repository';
import { ConsentRepository } from '../trust/consent/consent.repository';
import { AnalyticsService } from '../analytics/analytics.service';

const CONSENT_TYPE = 'parent_child_link';
const MAX_USER_AGENT_LENGTH = 500;

@Injectable()
export class ParentLinksService {
  constructor(
    private readonly repository: ParentLinksRepository,
    private readonly inviteRepository: ParentInviteRepository,
    private readonly consentRepository: ConsentRepository,
    private readonly analytics: AnalyticsService,
  ) {}

  /** Student-initiated (blueprint §1: invite-link pattern) — the student
   *  shares this token with their own parent out-of-band (WhatsApp). */
  async createInvite(studentId: string) {
    const token = randomBytes(9).toString('base64url');
    await this.inviteRepository.create(token, studentId);
    return { token };
  }

  /** Parent redeems the token. Idempotent: redeeming twice for the same
   *  parent/student pair returns the existing link instead of erroring —
   *  the unique(parent_id, student_id) constraint is the source of truth. */
  async redeemInvite(parentId: string, token: string) {
    const studentId = await this.inviteRepository.findStudentId(token);
    if (!studentId) {
      throw new NotFoundException('Invite not found or expired');
    }

    const existing = await this.repository.findByParentAndStudent(
      parentId,
      studentId,
    );
    if (existing) {
      return existing;
    }

    const link = await this.repository.create(parentId, studentId);
    await this.inviteRepository.consume(token);
    this.analytics.capture(parentId, 'parent_link_created', { studentId });
    return link;
  }

  /** DPDP Act 2023 (blueprint §9): verifiable parental consent. Grants
   *  it and activates the link in one step — a 'pending' link has no
   *  other purpose than waiting for exactly this. */
  async grantConsent(
    parentId: string,
    linkId: string,
    policyVersion: string,
    ip: string | null,
    userAgent: string | null,
  ) {
    const link = await this.repository.findById(linkId);
    if (!link) throw new NotFoundException('Link not found');
    if (link.parent_id !== parentId) {
      throw new ForbiddenException('Not your link');
    }
    if (link.status === 'active') {
      throw new BadRequestException('Consent already granted');
    }

    const consent = await this.consentRepository.create({
      userId: parentId,
      consentType: CONSENT_TYPE,
      policyVersion,
      ip,
      userAgent: userAgent ? userAgent.slice(0, MAX_USER_AGENT_LENGTH) : null,
    });

    const activated = await this.repository.activate(linkId, consent.id);
    this.analytics.capture(parentId, 'parent_consent_granted', {
      studentId: link.student_id,
    });
    return activated;
  }

  listForParent(parentId: string) {
    return this.repository.listForParent(parentId);
  }

  listForStudent(studentId: string) {
    return this.repository.listForStudent(studentId);
  }
}
