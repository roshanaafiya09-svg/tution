import { ForbiddenException, Injectable } from '@nestjs/common';
import { MessagesRepository } from './messages.repository';
import type { SenderRole } from './messages.repository';
import { BatchesRepository } from '../scheduling/batches/batches.repository';
import { ParentLinksRepository } from '../parents/parent-links.repository';
import { AnalyticsService } from '../analytics/analytics.service';
import type { AccessTokenPayload } from '../identity/auth/tokens.service';

/**
 * Monitored-only adult<->minor messaging (blueprint §9). A thread is
 * keyed by (batchId, studentId) rather than a sender/recipient pair, so
 * there is no way to construct a channel that excludes the tutor, the
 * student, or a consented parent — resolveAccess is the single gate
 * that decides who may read or post into a given thread, and it also
 * doubles as "which role is this sender acting as" for the message row.
 */
@Injectable()
export class MessagesService {
  constructor(
    private readonly repository: MessagesRepository,
    private readonly batchesRepository: BatchesRepository,
    private readonly parentLinksRepository: ParentLinksRepository,
    private readonly analytics: AnalyticsService,
  ) {}

  async send(
    user: AccessTokenPayload,
    batchId: string,
    studentId: string,
    body: string,
  ) {
    const role = await this.resolveAccess(user, batchId, studentId);
    const message = await this.repository.create(
      batchId,
      studentId,
      user.sub,
      role,
      body,
    );
    this.analytics.capture(user.sub, 'message_sent', {
      batchId,
      studentId,
      senderRole: role,
    });
    return message;
  }

  async listThread(user: AccessTokenPayload, batchId: string, studentId: string) {
    await this.resolveAccess(user, batchId, studentId);
    return this.repository.listForThread(batchId, studentId);
  }

  async listMine(user: AccessTokenPayload) {
    if (user.roles.includes('tutor')) {
      return this.repository.listThreadsForTutor(user.sub);
    }
    if (user.roles.includes('student')) {
      return this.repository.listThreadsForStudent(user.sub);
    }
    if (user.roles.includes('parent')) {
      return this.listThreadsForParent(user.sub);
    }
    return [];
  }

  private async listThreadsForParent(parentId: string) {
    const links = await this.parentLinksRepository.listForParent(parentId);
    const activeChildIds = links
      .filter((link) => link.status === 'active')
      .map((link) => link.student_id);

    const perChild = await Promise.all(
      activeChildIds.map(async (studentId) => {
        const threads = await this.repository.listThreadsForStudent(studentId);
        // listThreadsForStudent's query doesn't select student_id (it's an
        // implicit filter, not a column) — annotate it back on here so a
        // parent's flattened multi-child list can still tell threads apart
        // and the frontend has a studentId to link into each thread with.
        return threads.map((thread) => ({ ...thread, student_id: studentId }));
      }),
    );

    return perChild
      .flat()
      .sort(
        (a, b) =>
          new Date(b.last_message_at as unknown as string).getTime() -
          new Date(a.last_message_at as unknown as string).getTime(),
      );
  }

  /** The one access-control gate for the whole module: who may this
   *  caller act as in the (batchId, studentId) thread, if anyone. */
  private async resolveAccess(
    user: AccessTokenPayload,
    batchId: string,
    studentId: string,
  ): Promise<SenderRole> {
    if (user.roles.includes('tutor')) {
      const batch = await this.batchesRepository.findById(batchId);
      if (batch && batch.tutor_id === user.sub) {
        const enrollment = await this.batchesRepository.findEnrollment(
          batchId,
          studentId,
        );
        if (enrollment) return 'tutor';
      }
    }

    if (user.roles.includes('student') && user.sub === studentId) {
      const enrollment = await this.batchesRepository.findEnrollment(
        batchId,
        studentId,
      );
      if (enrollment) return 'student';
    }

    if (user.roles.includes('parent')) {
      const link = await this.parentLinksRepository.findByParentAndStudent(
        user.sub,
        studentId,
      );
      if (link?.status === 'active') {
        const enrollment = await this.batchesRepository.findEnrollment(
          batchId,
          studentId,
        );
        if (enrollment) return 'parent';
      }
    }

    throw new ForbiddenException('You do not have access to this conversation');
  }
}
