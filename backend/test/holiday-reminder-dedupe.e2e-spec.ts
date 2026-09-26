/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument --
 * HTTP response bodies are untyped JSON in an e2e test; asserting on their shape IS the test. */
import { DateTime } from 'luxon';
import { RemindersService } from '../src/modules/reminders/reminders.service';
import { HolidayService } from '../src/modules/holidays/holiday.service';
import { createHarness, type Actor, type Harness } from './support/harness';

/**
 * H7 — the holiday reminder paths get the same deterministic dedupe as the
 * other reminders (deterministic key + partial unique index + ON CONFLICT
 * DO NOTHING), proven against the real database with real concurrency:
 *  - the cron sweep run twice (and twice at once) → one logical notice
 *  - two different holidays → two notices, never merged
 *  - the holiday declaration notice re-applied concurrently → one notice
 *  - recipients stay inside the academy (an Individual class of a member
 *    teacher, at the same moment, is neither cancelled nor notified)
 */
jest.setTimeout(240_000);

describe('Holiday reminder dedupe (H7, e2e)', () => {
  let h: Harness;
  let A: Awaited<ReturnType<Harness['makeAcademy']>>;
  let T1: Actor;
  let T2: Actor;
  let T3: Actor;
  let shared: Actor; // in both academy batches
  let sInd: Actor; // T3's Individual student
  let b1: string;
  let b2: string;
  let ind: string;
  let s1: string;
  let s2: string;
  let sIndSession: string;
  let holiday1: string;
  let holiday2: string;

  beforeAll(async () => {
    h = await createHarness('hr');
    A = await h.makeAcademy('a');
    T1 = await h.makeUser('tutor', 't1');
    T2 = await h.makeUser('tutor', 't2');
    T3 = await h.makeUser('tutor', 't3');
    for (const t of [T1, T2, T3]) await h.join(A.id, t.id);
    shared = await h.makeUser('student', 'shared');
    sInd = await h.makeUser('student', 'sind');

    b1 = await h.createBatch(T1, { ctx: A.ctx });
    b2 = await h.createBatch(T2, { ctx: A.ctx });
    ind = await h.createBatch(T3); // Individual
    await h.enroll(b1, shared.id);
    await h.enroll(b2, shared.id);
    await h.enroll(ind, sInd.id);

    // All three classes start exactly 10 minutes from now (the sweep's window).
    const at = new Date(Date.now() + 10 * 60_000);
    s1 = await h.scheduleAt(T1, b1, at, { ctx: A.ctx });
    s2 = await h.scheduleAt(T2, b2, at, { ctx: A.ctx });
    sIndSession = await h.scheduleAt(T3, ind, at);

    // Two different batch-scoped holidays on that (IST) date.
    const day = DateTime.fromJSDate(at).setZone('Asia/Kolkata').toISODate()!;
    const declare = async (name: string, batchId: string) => {
      const res = await h.api('POST', '/academy/me/holidays', A.owner.token, {
        body: { name, startDate: day, scope: 'batches', batchIds: [batchId] },
      });
      expect(res.status).toBe(201);
      return res.body.id as string;
    };
    holiday1 = await declare(`Holiday One ${h.MARKER}`, b1);
    holiday2 = await declare(`Holiday Two ${h.MARKER}`, b2);
  });

  afterAll(async () => {
    await h?.close();
  });

  it('the holidays cancelled exactly their own academy classes — never the Individual one', async () => {
    const rows = await h.db
      .selectFrom('class_sessions')
      .select(['id', 'status', 'holiday_id'])
      .where('id', 'in', [s1, s2, sIndSession])
      .execute();
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(s1)).toMatchObject({
      status: 'cancelled',
      holiday_id: holiday1,
    });
    expect(byId.get(s2)).toMatchObject({
      status: 'cancelled',
      holiday_id: holiday2,
    });
    expect(byId.get(sIndSession)).toMatchObject({
      status: 'scheduled',
      holiday_id: null,
    });
  });

  it('sweep run twice at once, then again → one reminder per holiday, never merged, never duplicated', async () => {
    const reminders = h.app.get(RemindersService);
    await Promise.all([
      reminders.sendUpcomingClassReminders(),
      reminders.sendUpcomingClassReminders(),
    ]);
    await reminders.sendUpcomingClassReminders();

    const got = await h.notificationsFor(shared.id, 'holiday_class_reminder');
    const ours = got.filter((n) =>
      ((n.payload as any).sessionIds ?? []).some((id: string) =>
        [s1, s2].includes(id),
      ),
    );
    expect(ours).toHaveLength(2);
    // Each body starts with a batch title carrying a random suffix, so a
    // plain sort doesn't order them by holiday — match each holiday to
    // exactly one notice instead.
    const bodies = ours.map((n) => (n.payload as any).body as string);
    for (const name of ['Holiday One', 'Holiday Two']) {
      const matching = bodies.filter((b) => b.includes(`${name} ${h.MARKER}`));
      expect(matching).toHaveLength(1);
    }
    expect(new Set(ours.map((n) => n.dedupe_key)).size).toBe(2);
    // A cancelled class never gets the ordinary "starts in 10 minutes".
    expect(
      (await h.notificationsFor(shared.id, 'class_reminder')).filter((n) =>
        [s1, s2].includes((n.payload as any).sessionId),
      ),
    ).toHaveLength(0);
  });

  it('the Individual student hears nothing about the academy holidays, and gets their normal reminder once', async () => {
    const all = await h.notificationsFor(sInd.id);
    expect(
      all.filter((n) =>
        ['holiday_class_reminder', 'academy_holiday'].includes(n.type),
      ),
    ).toHaveLength(0);
    expect(
      all.filter(
        (n) =>
          n.type === 'class_reminder' &&
          (n.payload as any).sessionId === sIndSession,
      ),
    ).toHaveLength(1);
  });

  it('the holiday declaration notice re-applied concurrently is still one notice per holiday per user', async () => {
    const holidays = h.app.get(HolidayService);
    await Promise.all([
      holidays.applyHolidayForAcademy(holiday1, A.id),
      holidays.applyHolidayForAcademy(holiday1, A.id),
      holidays.applyHolidayForAcademy(holiday1, A.id),
    ]);
    const notices = (
      await h.notificationsFor(shared.id, 'academy_holiday')
    ).filter((n) => (n.payload as any).holidayId === holiday1);
    expect(notices).toHaveLength(1);
    expect(notices[0].dedupe_key).toBe(`holiday:${holiday1}:${A.id}`);
    // The teacher of the covered batch is notified once too; the
    // unrelated Individual student never.
    expect(
      (await h.notificationsFor(T1.id, 'academy_holiday')).filter(
        (n) => (n.payload as any).holidayId === holiday1,
      ),
    ).toHaveLength(1);
    expect(await h.notificationsFor(sInd.id, 'academy_holiday')).toHaveLength(
      0,
    );
  });
});
