import { Injectable, NotFoundException } from '@nestjs/common';
import { UsersRepository } from '../identity/users/users.repository';
import { TokensService } from '../identity/auth/tokens.service';
import { ProfilesService } from '../identity/profiles/profiles.service';
import { ConsentRepository } from '../trust/consent/consent.repository';
import { VerificationsRepository } from '../trust/verifications/verifications.repository';
import { BatchesRepository } from '../scheduling/batches/batches.repository';
import { AttendanceRepository } from '../scheduling/attendance/attendance.repository';
import { SubmissionsRepository } from '../assessment/submissions/submissions.repository';
import { FeesRepository } from '../billing/fees/fees.repository';
import { InvitesRepository } from '../scheduling/invites/invites.repository';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * Top-level orchestration module for a cross-cutting concern (DPDP §4/§9
 * data-principal rights: export + deletion) that genuinely spans every
 * bounded context. Sits above the others in the dependency graph — like
 * AppModule — rather than inverting any one module's imports.
 */
@Injectable()
export class AccountService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly tokensService: TokensService,
    private readonly profilesService: ProfilesService,
    private readonly consentRepository: ConsentRepository,
    private readonly verificationsRepository: VerificationsRepository,
    private readonly batchesRepository: BatchesRepository,
    private readonly attendanceRepository: AttendanceRepository,
    private readonly submissionsRepository: SubmissionsRepository,
    private readonly feesRepository: FeesRepository,
    private readonly notificationsService: NotificationsService,
    private readonly invitesRepository: InvitesRepository,
  ) {}

  /**
   * A portable dump of the caller's own data (blueprint §9: "data-
   * principal rights (export + deletion)"). Scoped to what this account
   * directly owns or appears in — not every row it's ever been
   * mentioned in system-wide (e.g. a tutor's export lists batches they
   * run, not every student's private notes about them).
   */
  async exportData(userId: string, roles: string[]) {
    const user = await this.usersRepository.findById(userId);
    if (!user) throw new NotFoundException('Account not found');

    const isTutor = roles.includes('tutor');
    const isStudent = roles.includes('student');

    const [consentRecords, notifications] = await Promise.all([
      this.consentRepository.listForUser(userId),
      this.notificationsService.listForUser(userId),
    ]);

    const data: Record<string, unknown> = {
      exportedAt: new Date().toISOString(),
      account: {
        id: user.id,
        phoneE164: user.phone_e164,
        email: user.email,
        locale: user.locale,
        timezone: user.timezone,
        createdAt: user.created_at,
      },
      roles,
      consentRecords,
      notifications,
    };

    if (isTutor) {
      const [profile, verifications, batches, feeLedger] = await Promise.all([
        this.profilesService.getTutorProfile(userId),
        this.verificationsRepository.listForTutor(userId),
        this.batchesRepository.listAllForTutor(userId),
        this.feesRepository.listAllForTutor(userId),
      ]);
      data.tutorProfile = profile ?? null;
      data.verifications = verifications;
      data.batchesOwned = batches;
      data.feeLedgerRecorded = feeLedger;
    }

    if (isStudent) {
      const [profile, batches, attendance, submissions, feeLedger] =
        await Promise.all([
          this.profilesService.getStudentProfile(userId),
          this.batchesRepository.listForStudent(userId),
          this.attendanceRepository.listForStudent(userId),
          this.submissionsRepository.listForStudent(userId),
          this.feesRepository.listForStudent(userId),
        ]);
      data.studentProfile = profile ?? null;
      data.batchesEnrolled = batches;
      data.attendance = attendance;
      data.submissions = submissions;
      data.feeLedgerBilled = feeLedger;
    }

    return data;
  }

  /**
   * Tombstones the account and revokes every session (see
   * UsersRepository.softDelete for why this isn't a hard delete). H8:
   * revokeAccessTokens also kills the caller's *current* access token
   * immediately, rather than leaving it valid for its remaining
   * ≤15-minute lifetime — refreshing it was already impossible once
   * every refresh session is revoked, but the access token itself used
   * to keep working until it naturally expired.
   *
   * A tutor's public Find-a-Teacher listing is hidden as soon as this
   * runs too (ProfilesRepository.findTutorBySlug / DiscoveryRepository.
   * searchOfferings now exclude a deleted user), as is their card on any
   * public Academy page (AcademyMembershipsRepository.listPublicForAcademy)
   * and their batches in that page's open-batch list — batches, sessions,
   * attendance, fee history and any Academy membership record are
   * deliberately left untouched, same as exportData's scoping: those
   * are historical records other parties (students, Academies) still
   * legitimately need, not just this account's own data.
   */
  async deleteAccount(userId: string, roles: string[]): Promise<void> {
    // Durable first: the tombstone also bumps users.token_version, which
    // is what invalidates every access token issued before now — the
    // Redis refresh below only makes the next request see it sooner.
    await this.usersRepository.softDelete(userId);
    await this.tokensService.revokeAllSessions(userId);
    await this.tokensService.revokeAccessTokens(userId);
    // H8: a deleted teacher's invite links must not enroll anyone new
    // (InvitesRepository.claimUse also refuses them independently).
    if (roles.includes('tutor')) {
      await this.invitesRepository.revokeAllForTutor(userId);
    }
    // Best-effort, mirrors ProfilesService.removeAvatar's own existing
    // pattern — only tutors have a profile photo to clean up, and a
    // deleted account's avatar is no longer reachable through any live
    // query anyway (the profile itself is now hidden), so this is
    // storage hygiene, not a privacy fix in its own right.
    if (roles.includes('tutor')) {
      await this.profilesService.removeAvatar(userId);
    }
  }
}
