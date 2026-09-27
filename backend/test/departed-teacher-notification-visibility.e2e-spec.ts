/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return --
 * HTTP response bodies are untyped JSON in an e2e test; asserting on their shape IS the test. */
import { newId } from '../src/database/id';
import { createHarness, type Actor, type Harness } from './support/harness';

/**
 * A departed teacher's OLD Academy notifications disappear from their
 * active notification feed — real HTTP, real Postgres, real JWTs.
 *
 * This is deliberately about HISTORICAL VISIBILITY, not the (already
 * covered elsewhere — see academy-reschedule-teacher-notice.e2e-spec's
 * T4, and cancel-leave-substitute-connections) NEW-notification block: a
 * notification created while T1 was still an active member must stop
 * appearing in T1's own feed the moment T1 leaves that academy, while
 * staying untouched in the database and unaffected for every other
 * academy and for Individual notifications.
 */
jest.setTimeout(300_000);

describe('Departed teacher — old Academy notification visibility (e2e)', () => {
  let h: Harness;
  let A: Awaited<ReturnType<Harness['makeAcademy']>>;
  let B: Awaited<ReturnType<Harness['makeAcademy']>>;
  let T1: Actor; // member of A AND B, plus an Individual batch
  let s: Actor;
  let iBatch: string;
  let aBatch: string;
  let bBatch: string;
  const holidayIds: string[] = [];

  const inHours = (n: number) => new Date(Date.now() + n * 3600_000);
  const local = (d: Date) => d.toISOString().slice(0, 19);

  const notes = async (u: Actor, type: string) =>
    (await h.notificationsFor(u.id, type)) as Array<{
      id: string;
      payload: Record<string, any>;
    }>;
  const list = (u: Actor) => h.api('GET', '/notifications', u.token);
  const unreadCount = async (u: Actor) =>
    (await h.api('GET', '/notifications/unread-count', u.token)).body.count;
  const markRead = (u: Actor, id: string) =>
    h.api('POST', `/notifications/${id}/read`, u.token);
  const markAllRead = (u: Actor) =>
    h.api('POST', '/notifications/read-all', u.token);
  const isRead = async (id: string) =>
    Boolean(
      (
        await h.db
          .selectFrom('notifications')
          .select('read_at')
          .where('id', '=', id)
          .executeTakeFirstOrThrow()
      ).read_at,
    );

  const cancelSession = (owner: Actor, batchId: string, sessionId: string) =>
    h.api(
      'POST',
      `/academy/me/batches/${batchId}/sessions/${sessionId}/cancel`,
      owner.token,
      { body: {} },
    );
  const rescheduleSession = (
    owner: Actor,
    batchId: string,
    sessionId: string,
    to: Date,
  ) =>
    h.api(
      'POST',
      `/academy/me/batches/${batchId}/sessions/${sessionId}/reschedule`,
      owner.token,
      { body: { newStartLocal: local(to), timezone: 'UTC' } },
    );

  let a1: string; // class_cancelled_by_academy notice for T1 in Academy A
  let b1: string; // class_rescheduled_by_academy notice for T1 in Academy B
  let i1: string; // Individual notice for T1 (assessment_completed, academyId null)

  beforeAll(async () => {
    h = await createHarness('dep');
    A = await h.makeAcademy('a');
    B = await h.makeAcademy('b');
    T1 = await h.makeUser('tutor', 't1');
    s = await h.makeUser('student', 's');
    await h.join(A.id, T1.id);
    await h.join(B.id, T1.id);

    iBatch = await h.createBatch(T1, { title: 'Individual Batch' });
    aBatch = await h.createBatch(T1, { ctx: A.ctx, title: 'Academy A Batch' });
    bBatch = await h.createBatch(T1, { ctx: B.ctx, title: 'Academy B Batch' });
    await h.enroll(iBatch, s.id);
    await h.enroll(aBatch, s.id);
    await h.enroll(bBatch, s.id);

    // --- A1: Academy A cancels one of T1's classes -> class_cancelled_by_academy
    const aSid = await h.scheduleAt(T1, aBatch, inHours(20), { ctx: A.ctx });
    expect((await cancelSession(A.owner, aBatch, aSid)).status).toBe(201);
    const aRows = await notes(T1, 'class_cancelled_by_academy');
    a1 = aRows.find((n) => n.payload.sessionId === aSid)!.id;
    expect(a1).toBeDefined();

    // --- B1: Academy B reschedules one of T1's classes -> class_rescheduled_by_academy
    const bSid = await h.scheduleAt(T1, bBatch, inHours(21), { ctx: B.ctx });
    expect(
      (await rescheduleSession(B.owner, bBatch, bSid, inHours(40))).status,
    ).toBe(201);
    const bRows = await notes(T1, 'class_rescheduled_by_academy');
    b1 = bRows.find((n) => n.payload.sessionId === bSid)!.id;
    expect(b1).toBeDefined();

    // --- I1: T1's own Individual assessment completes -> assessment_completed (academyId: null)
    const created = await h.api('POST', '/assessments/online', T1.token, {
      body: {
        title: `Individual assessment ${h.MARKER}`,
        subjectId: h.subjectId,
        batchIds: [iBatch],
      },
    });
    expect(created.status).toBe(201);
    const assessmentId = created.body.id;
    await h.db
      .insertInto('assessment_questions')
      .values([
        {
          id: newId(),
          assessment_id: assessmentId,
          order_index: 0,
          question_text: 'Q1',
          choices: JSON.stringify(['a', 'b', 'c', 'd']),
          correct_choice_index: 1,
          marks: 5,
          difficulty: 'easy',
          explanation: null,
        },
      ])
      .execute();
    await h.db
      .updateTable('assessments')
      .set({ max_score: 5 })
      .where('id', '=', assessmentId)
      .execute();
    expect(
      (
        await h.api(
          'POST',
          `/assessments/online/${assessmentId}/publish`,
          T1.token,
          {
            body: {},
          },
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await h.api(
          'POST',
          `/assessments/online/${assessmentId}/submit`,
          s.token,
          { body: { answers: [1] } },
        )
      ).status,
    ).toBe(201);
    const iRows = await notes(T1, 'assessment_completed');
    i1 = iRows.find((n) => n.payload.assessmentId === assessmentId)!.id;
    expect(i1).toBeDefined();
    expect(iRows.find((n) => n.id === i1)!.payload.academyId).toBeNull();
  });

  it('1-4 while fully active, A1/B1/I1 are all visible in the real notification list', async () => {
    const res = await list(T1);
    expect(res.status).toBe(200);
    const ids = res.body.map((n: any) => n.id);
    expect(ids).toEqual(expect.arrayContaining([a1, b1, i1]));
  });

  it('5-9 leaving Academy A hides A1 only — B1 and I1 stay visible', async () => {
    // Self-serve departure — the real membership lifecycle, not a direct DB flip.
    const leave = await h.api(
      'POST',
      `/marketplace/academies/${A.slug}/leave`,
      T1.token,
    );
    expect(leave.status).toBe(201);

    const res = await list(T1);
    const ids = res.body.map((n: any) => n.id);
    expect(ids).not.toContain(a1);
    expect(ids).toContain(b1);
    expect(ids).toContain(i1);
  });

  it('10-11 a NEW Academy A event after departure never reaches T1 (existing protection, unweakened)', async () => {
    // markLeft already cancelled T1's own future classes as part of leaving
    // (see AcademyMembershipsRepository.markLeft), so there's no scheduled
    // class left to reschedule/cancel a second time — a fresh Academy-wide
    // event (a new holiday) is the real "something happens after I left"
    // case. T1 must be excluded from its recipients (HolidayService reads
    // the CURRENT active roster, listActiveForAcademy — T1 already isn't in
    // it), even though T1's batch (aBatch) is what the holiday touches.
    const res = await h.api('POST', '/academy/me/holidays', A.owner.token, {
      body: {
        name: `Post-departure holiday ${h.MARKER}`,
        startDate: new Date(Date.now() + 5 * 86400_000)
          .toISOString()
          .slice(0, 10),
        scope: 'batches',
        batchIds: [aBatch],
      },
    });
    expect(res.status).toBe(201);
    holidayIds.push(res.body.id);
    expect(await notes(T1, 'academy_holiday')).toHaveLength(0);
  });

  it('12-14 direct access: marking the hidden A1 notification read is a no-op, not a leak', async () => {
    const before = await isRead(a1);
    expect(before).toBe(false);
    const res = await markRead(T1, a1);
    // The endpoint always returns 201 whether or not it acted (it never
    // reveals which by status code — same "denied/inaccessible" shape as
    // marking someone else's id), so the only real assertion is the DB.
    expect(res.status).toBe(201);
    expect(await isRead(a1)).toBe(false);
  });

  it('15 unread count excludes the hidden A1 notification', async () => {
    const count = await unreadCount(T1);
    const res = await list(T1);
    const unreadVisible = res.body.filter((n: any) => !n.read_at).length;
    expect(count).toBe(unreadVisible);
    // Sanity: A1 itself is genuinely still unread in the DB (proves the
    // count is excluding it deliberately, not because it was read).
    expect(await isRead(a1)).toBe(false);
  });

  it('mark-all-read only touches what T1 can see — the hidden A1 row is untouched', async () => {
    const res = await markAllRead(T1);
    expect([200, 201]).toContain(res.status);
    expect(await isRead(a1)).toBe(false); // still untouched
    expect(await isRead(b1)).toBe(true); // a visible one WAS marked
    expect(await isRead(i1)).toBe(true);
    expect(await unreadCount(T1)).toBe(0);
  });

  it('17 Individual visibility is entirely unaffected by the Academy A departure', async () => {
    const rows = await notes(T1, 'assessment_completed');
    expect(rows.some((n) => n.id === i1)).toBe(true);
  });

  it('18 Academy B is entirely unaffected by the Academy A departure', async () => {
    const rows = await notes(T1, 'class_rescheduled_by_academy');
    expect(rows.some((n) => n.id === b1)).toBe(true);
    const res = await list(T1);
    expect(res.body.map((n: any) => n.id)).toContain(b1);
  });

  it('historical preservation: A1 still exists in the DB with its original data', async () => {
    const row = await h.db
      .selectFrom('notifications')
      .selectAll()
      .where('id', '=', a1)
      .executeTakeFirst();
    expect(row).toBeDefined();
    expect(row!.type).toBe('class_cancelled_by_academy');
    expect((row!.payload as any).academyId).toBe(A.id);
    // Academy A's own class history is untouched too.
    const batch = await h.db
      .selectFrom('batches')
      .select('academy_id')
      .where('id', '=', aBatch)
      .executeTakeFirstOrThrow();
    expect(batch.academy_id).toBe(A.id);
  });

  it('rejoining Academy A restores visibility of its old notifications (documented policy — see isVisible)', async () => {
    // A NEW active membership row (rejoin never revives the old 'left' one).
    await h.join(A.id, T1.id);
    const res = await list(T1);
    const ids = res.body.map((n: any) => n.id);
    expect(ids).toContain(a1);
  });

  afterAll(async () => {
    if (holidayIds.length) {
      await h?.db
        .deleteFrom('holidays')
        .where('id', 'in', holidayIds)
        .execute();
    }
    await h?.close();
  });
});
