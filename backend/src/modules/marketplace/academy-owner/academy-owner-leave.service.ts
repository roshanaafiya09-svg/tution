import { Injectable, NotFoundException } from '@nestjs/common';
import { AcademiesRepository } from '../academies/academies.repository';
import { TeacherLeaveService } from '../../holidays/teacher-leave.service';

/**
 * Academy-scoped delegation over TeacherLeaveService — same shape as
 * AcademyOwnerBatchesService's delegation over BatchesService/
 * SessionsService (see that class's doc comment). Every method resolves
 * "my academy" from the caller's own id first; TeacherLeaveService's own
 * academyId-scoped methods do the actual ownership check against the
 * request row, so a client can never act on another academy's leave
 * requests even if academyId here were somehow wrong.
 */
@Injectable()
export class AcademyOwnerLeaveService {
  constructor(
    private readonly academiesRepository: AcademiesRepository,
    private readonly teacherLeaveService: TeacherLeaveService,
  ) {}

  private async resolveOwnAcademy(ownerUserId: string) {
    const academy =
      await this.academiesRepository.findByOwnerUserId(ownerUserId);
    if (!academy) {
      throw new NotFoundException('No academy is linked to this account yet');
    }
    return academy;
  }

  async listPending(ownerUserId: string) {
    const academy = await this.resolveOwnAcademy(ownerUserId);
    return this.teacherLeaveService.listPendingForAcademy(academy.id);
  }

  async listAll(ownerUserId: string) {
    const academy = await this.resolveOwnAcademy(ownerUserId);
    return this.teacherLeaveService.listAllForAcademy(academy.id);
  }

  async listSessions(ownerUserId: string, requestId: string) {
    const academy = await this.resolveOwnAcademy(ownerUserId);
    // Ownership check first — listSessionsForRequest itself takes no
    // academyId and doesn't scope by one, so skipping this (as the old
    // code did, discarding resolveOwnAcademy's result) let any academy
    // admin view another academy's leave-request session detail by
    // guessing/enumerating a requestId.
    await this.teacherLeaveService.getOwnedForAcademy(academy.id, requestId);
    return this.teacherLeaveService.listSessionsForRequest(requestId);
  }

  async approve(
    ownerUserId: string,
    requestId: string,
    substituteTutorId?: string,
  ) {
    const academy = await this.resolveOwnAcademy(ownerUserId);
    return this.teacherLeaveService.approve(
      academy.id,
      requestId,
      ownerUserId,
      substituteTutorId,
    );
  }

  async reject(ownerUserId: string, requestId: string) {
    const academy = await this.resolveOwnAcademy(ownerUserId);
    return this.teacherLeaveService.reject(academy.id, requestId, ownerUserId);
  }

  async assignSubstitute(
    ownerUserId: string,
    requestId: string,
    substituteTutorId: string,
  ) {
    const academy = await this.resolveOwnAcademy(ownerUserId);
    return this.teacherLeaveService.assignSubstitute(
      academy.id,
      requestId,
      substituteTutorId,
    );
  }
}
