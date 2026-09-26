/**
 * The ONE definition of "present / absent" for a class, shared by every
 * Academy attendance number (the Today card, the per-class table and — by
 * the same rule, per student — the absent-students report), so the same class
 * can never show different counts on different Academy pages.
 *
 * - The roster is the batch's ACTIVE enrolments UNION anyone with an
 *   attendance row for that class: a student who has since left still counts
 *   for a class they actually attended or were marked absent for, and is not
 *   invented for a class they never had a row for.
 * - present = roster students with a `present`/`late` row.
 * - absent, for a COMPLETED class = every roster student who is not present
 *   (an unmarked seat on a class that has run is an absence — the same rule
 *   the absent-students report applies). For any other status (a
 *   not-yet-run class) only students explicitly marked `absent` count, since
 *   nobody can be absent from a class that has not happened.
 * - a cancelled class never has attendance rows, so it counts nothing.
 */
export interface RosterAttendance {
  roster: number;
  present: number;
  absent: number;
}

export function rosterAttendance(input: {
  sessionStatus: string;
  activeStudentIds: readonly string[];
  rows: ReadonlyArray<{ student_id: string; status: string }>;
}): RosterAttendance {
  const rosterIds = new Set<string>([
    ...input.activeStudentIds,
    ...input.rows.map((r) => r.student_id),
  ]);
  const presentIds = new Set(
    input.rows
      .filter((r) => r.status === 'present' || r.status === 'late')
      .map((r) => r.student_id),
  );
  const explicitAbsentIds = new Set(
    input.rows.filter((r) => r.status === 'absent').map((r) => r.student_id),
  );

  const absent =
    input.sessionStatus === 'completed'
      ? [...rosterIds].filter((id) => !presentIds.has(id)).length
      : [...explicitAbsentIds].filter((id) => !presentIds.has(id)).length;

  return { roster: rosterIds.size, present: presentIds.size, absent };
}
