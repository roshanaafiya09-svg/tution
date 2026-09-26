import { rosterAttendance } from './attendance-roster';

const row = (student_id: string, status: string) => ({ student_id, status });

describe('rosterAttendance — the one present/absent definition for a class', () => {
  it('a COMPLETED class counts every unmarked roster seat as absent', () => {
    expect(
      rosterAttendance({
        sessionStatus: 'completed',
        activeStudentIds: ['a', 'b', 'c'],
        rows: [row('a', 'present')],
      }),
    ).toEqual({ roster: 3, present: 1, absent: 2 });
  });

  it('late counts as present; an explicit absent is not double counted', () => {
    expect(
      rosterAttendance({
        sessionStatus: 'completed',
        activeStudentIds: ['a', 'b'],
        rows: [row('a', 'late'), row('b', 'absent')],
      }),
    ).toEqual({ roster: 2, present: 1, absent: 1 });
  });

  it('a student who has since LEFT still counts for a class they have a row for, and is not invented otherwise', () => {
    // 'gone' left the batch but attended: present, and they enlarge the roster.
    expect(
      rosterAttendance({
        sessionStatus: 'completed',
        activeStudentIds: ['a', 'b'],
        rows: [row('a', 'absent'), row('gone', 'present')],
      }),
    ).toEqual({ roster: 3, present: 1, absent: 2 });
    // never attended -> not on the roster at all
    expect(
      rosterAttendance({
        sessionStatus: 'completed',
        activeStudentIds: ['a'],
        rows: [row('a', 'present')],
      }),
    ).toEqual({ roster: 1, present: 1, absent: 0 });
  });

  it('a class that has not run only counts EXPLICIT absences — nobody is absent yet', () => {
    expect(
      rosterAttendance({
        sessionStatus: 'scheduled',
        activeStudentIds: ['a', 'b'],
        rows: [row('a', 'absent')],
      }),
    ).toEqual({ roster: 2, present: 0, absent: 1 });
  });

  it('a cancelled class with no rows counts nothing as absent', () => {
    expect(
      rosterAttendance({
        sessionStatus: 'cancelled',
        activeStudentIds: ['a', 'b'],
        rows: [],
      }),
    ).toEqual({ roster: 2, present: 0, absent: 0 });
  });
});
