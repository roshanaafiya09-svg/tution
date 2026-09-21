import { Injectable, NotFoundException } from '@nestjs/common';
import { AcademiesRepository } from '../academies/academies.repository';
import { AcademyMembershipsRepository } from '../academy-memberships/academy-memberships.repository';
import { BatchesRepository } from '../../scheduling/batches/batches.repository';
import { AttendanceRepository } from '../../scheduling/attendance/attendance.repository';
import { AcademyOwnerParentsRepository } from './academy-owner-parents.repository';

/**
 * Academy-wide Parents directory (Main > Parents, new feature). Built from
 * the same 3-hop chain HolidayService/TeacherLeaveService already use for
 * notification fan-out: academy_memberships -> batches/enrollments ->
 * parent_child_links -> users. There is no `profiles_parent` table, so a
 * parent has no name — every method returns only phone/email plus their
 * linked children; the frontend falls back to "Parent of {child}" when it
 * needs a label.
 */
@Injectable()
export class AcademyOwnerParentsService {
  constructor(
    private readonly academiesRepository: AcademiesRepository,
    private readonly academyMembershipsRepository: AcademyMembershipsRepository,
    private readonly batchesRepository: BatchesRepository,
    private readonly attendanceRepository: AttendanceRepository,
    private readonly parentsRepository: AcademyOwnerParentsRepository,
  ) {}

  private async resolveOwnAcademy(ownerUserId: string) {
    const academy =
      await this.academiesRepository.findByOwnerUserId(ownerUserId);
    if (!academy) {
      throw new NotFoundException('No academy is linked to this account yet');
    }
    return academy;
  }

  /** Every active enrollment in batches THE ACADEMY OWNS — same call
   *  listStudentsAcrossAcademy makes, so Students and Parents always agree
   *  on "which children belong to this academy". A member teacher's
   *  Individual students (and their parents) are not part of it. */
  private async listAcademyEnrollments(academyId: string) {
    const teacherNames =
      await this.academyMembershipsRepository.displayNamesForAcademy(academyId);
    const enrollments = await this.batchesRepository.listEnrollmentsForAcademy(
      academyId,
      'active',
    );
    return { enrollments, teacherNames };
  }

  async listParentsAcrossAcademy(ownerUserId: string) {
    const academy = await this.resolveOwnAcademy(ownerUserId);
    const { enrollments } = await this.listAcademyEnrollments(academy.id);
    if (enrollments.length === 0) return [];

    const studentIds = [...new Set(enrollments.map((e) => e.student_id))];
    const links =
      await this.parentsRepository.listActiveLinksForStudents(studentIds);

    const enrollmentsByStudent = new Map<string, typeof enrollments>();
    for (const e of enrollments) {
      const list = enrollmentsByStudent.get(e.student_id) ?? [];
      list.push(e);
      enrollmentsByStudent.set(e.student_id, list);
    }

    const byParent = new Map<
      string,
      {
        parentId: string;
        phoneE164: string;
        email: string | null;
        children: Map<
          string,
          { studentId: string; displayName: string | null; status: string }
        >;
      }
    >();
    for (const link of links) {
      const parent = byParent.get(link.parent_id) ?? {
        parentId: link.parent_id,
        phoneE164: link.phone_e164,
        email: link.email,
        children: new Map(),
      };
      const studentEnrollments =
        enrollmentsByStudent.get(link.student_id) ?? [];
      if (
        studentEnrollments.length > 0 &&
        !parent.children.has(link.student_id)
      ) {
        parent.children.set(link.student_id, {
          studentId: link.student_id,
          displayName: studentEnrollments[0].display_name,
          status: studentEnrollments[0].status,
        });
      }
      byParent.set(link.parent_id, parent);
    }

    return Array.from(byParent.values())
      .filter((p) => p.children.size > 0)
      .map((p) => ({
        parentId: p.parentId,
        phoneE164: p.phoneE164,
        email: p.email,
        childrenCount: p.children.size,
        children: Array.from(p.children.values()),
      }));
  }

  async getParentDetail(ownerUserId: string, parentId: string) {
    const academy = await this.resolveOwnAcademy(ownerUserId);
    const { enrollments, teacherNames } = await this.listAcademyEnrollments(
      academy.id,
    );
    const studentIds = [...new Set(enrollments.map((e) => e.student_id))];

    const link =
      await this.parentsRepository.findActiveLinkForParentAndStudents(
        parentId,
        studentIds,
      );
    if (!link) {
      throw new NotFoundException(
        'That parent has no child linked to your academy',
      );
    }

    const contact = await this.parentsRepository.findParentContact(parentId);

    const linksForAllStudents =
      await this.parentsRepository.listActiveLinksForStudents(studentIds);
    const thisParentsStudentIds = new Set(
      linksForAllStudents
        .filter((l) => l.parent_id === parentId)
        .map((l) => l.student_id),
    );

    const childEnrollments = enrollments.filter((e) =>
      thisParentsStudentIds.has(e.student_id),
    );

    const byStudent = new Map<string, typeof childEnrollments>();
    for (const e of childEnrollments) {
      const list = byStudent.get(e.student_id) ?? [];
      list.push(e);
      byStudent.set(e.student_id, list);
    }

    const children = await Promise.all(
      Array.from(byStudent.entries()).map(async ([studentId, rows]) => ({
        studentId,
        displayName: rows[0].display_name,
        gradeLevel: rows[0].grade_level,
        batches: await Promise.all(
          rows.map(async (r) => ({
            batchId: r.batch_id,
            batchTitle: r.batch_title,
            tutorId: r.tutor_id,
            tutorDisplayName: teacherNames.get(r.tutor_id) ?? null,
            status: r.status,
            attendance: await this.attendanceRepository
              .summaryForStudent(studentId, r.batch_id)
              .catch(() => null),
          })),
        ),
      })),
    );

    return {
      parentId,
      phoneE164: contact?.phone_e164 ?? '',
      email: contact?.email ?? null,
      children,
    };
  }
}
