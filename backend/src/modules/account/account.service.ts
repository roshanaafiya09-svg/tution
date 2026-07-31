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
        this.batchesRepository.listForTutor(userId),
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
   * UsersRepository.softDelete for why this isn't a hard delete). The
   * caller's *current* access token stays valid for up to its remaining
   * 15-minute lifetime — short-lived by design, and refreshing it is now
   * impossible since every refresh session was just revoked.
   */
  async deleteAccount(userId: string): Promise<void> {
    await this.usersRepository.softDelete(userId);
    await this.tokensService.revokeAllSessions(userId);
  }
}
