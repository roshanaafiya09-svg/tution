/* eslint-disable @typescript-eslint/no-unsafe-member-access --
 * HTTP response bodies are untyped JSON in an e2e test; asserting on their shape IS the test. */
import {
  KYC_PROVIDER,
  type KycProvider,
} from '../src/modules/marketplace/academy-verification/providers/kyc-provider.interface';
import { KycProviderUnavailableError } from '../src/modules/marketplace/academy-verification/providers/setu-kyc.provider';
import { newId } from '../src/database/id';
import type { UserRole } from '../src/database/types';
import { createHarness, type Actor, type Harness } from './support/harness';

/**
 * Academy KYC end to end — real HTTP, real Postgres, real JWTs, real
 * services. Only the outbound KYC provider is stubbed, and only to be
 * "unavailable" (the real Setu provider does exactly that when Setu can't be
 * reached), which is how a submission genuinely lands in needs_manual_review
 * in production. Every state transition below goes through HTTP.
 *
 *   owner submits -> automatic check unsettled -> needs_manual_review
 *   -> admin queue -> admin approves / rejects -> academies.verification_status
 *   synced -> owner dashboard + public page -> owner notified (once)
 */
jest.setTimeout(300_000);

const VALID = {
  consent: true,
  policyVersion: '1.0',
  pan: 'ABCDE1234F',
  gstin: '29ABCDE1234F1Z5',
};
const QUEUE = '/admin/academy-verifications/queue';

describe('Academy KYC manual-review workflow (e2e)', () => {
  let h: Harness;
  let admin: Actor;
  let student: Actor;
  let parent: Actor;
  let tutor: Actor;
  let provider: KycProvider;
  let panSpy: jest.SpyInstance;

  // /academy/verification/start is @Throttle'd (5/min) and that limit still
  // applies here, so wait out the window rather than skip the real guard.
  const start = async (owner: Actor, body: object = VALID) => {
    let res = await h.api('POST', '/academy/verification/start', owner.token, {
      body,
    });
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 62_000));
      res = await h.api('POST', '/academy/verification/start', owner.token, {
        body,
      });
    }
    return res;
  };

  // Anyone who performs an audited action (owner submit, admin review) gets an
  // append-only audit_logs row keyed to them, and users referenced there can
  // never be deleted — so, like verifications-queue.e2e-spec, these fixture
  // users are reused across runs (find-or-create) instead of cleaned up.
  const audited = async (role: UserRole, email: string): Promise<Actor> => {
    let id = (
      await h.db
        .selectFrom('users')
        .select('id')
        .where('email', '=', email)
        .executeTakeFirst()
    )?.id;
    if (!id) {
      id = newId();
      await h.db
        .insertInto('users')
        .values({
          id,
          phone_e164: `+91${Math.floor(1e9 + Math.random() * 9e9)}`,
          email,
        })
        .execute();
      await h.db
        .insertInto('user_roles')
        .values({ user_id: id, role })
        .execute();
    }
    await h.db.deleteFrom('notifications').where('user_id', '=', id).execute();
    return { id, token: h.tokens.signAccessToken(id, [role]), label: email };
  };
  const academyIds: string[] = [];
  const makeAcademy = async (label: string) => {
    const owner = await audited('academy', `krfix-owner-${label}@example.test`);
    const slug = `krfix-${label}`;
    await h.db
      .deleteFrom('academies')
      .where((eb) =>
        eb.or([eb('slug', '=', slug), eb('owner_user_id', '=', owner.id)]),
      )
      .execute(); // cascades any earlier run's KYC rows
    const id = newId();
    await h.db
      .insertInto('academies')
      .values({
        id,
        name: `KYC Academy ${label}`,
        slug,
        owner_user_id: owner.id,
      })
      .execute();
    academyIds.push(id);
    return { id, slug, owner };
  };
  const review = (id: string, body: object, who: Actor = admin) =>
    h.api('POST', `/admin/academy-verifications/${id}/review`, who.token, {
      body,
    });
  const queue = async () =>
    (await h.api('GET', QUEUE, admin.token)).body as {
      id: string;
      academy_id: string;
      status: string;
    }[];
  const kyc = (academyId: string) =>
    h.db
      .selectFrom('academy_kyc_verifications')
      .selectAll()
      .where('academy_id', '=', academyId)
      .orderBy('created_at', 'asc')
      .execute();
  const academyStatus = async (academyId: string) =>
    (
      await h.db
        .selectFrom('academies')
        .select('verification_status')
        .where('id', '=', academyId)
        .executeTakeFirstOrThrow()
    ).verification_status;

  beforeAll(async () => {
    h = await createHarness('kr');
    admin = await audited('trust_safety', 'krfix-admin@example.test');
    student = await h.makeUser('student', 'stu');
    parent = await h.makeUser('parent', 'par');
    tutor = await h.makeUser('tutor', 'tut');
    provider = h.app.get<KycProvider>(KYC_PROVIDER, { strict: false });
    panSpy = jest
      .spyOn(provider, 'verifyPan')
      .mockRejectedValue(new KycProviderUnavailableError('unreachable'));
  });
  afterAll(async () => {
    panSpy?.mockRestore();
    if (academyIds.length) {
      await h.db
        .deleteFrom('academies')
        .where('id', 'in', academyIds)
        .execute();
    }
    await h?.close();
  });

  it('only reviewers can read the queue or review — never the academy owner, student, parent, tutor or anonymous', async () => {
    const A = await makeAcademy('gate');
    for (const who of [A.owner, student, parent, tutor]) {
      expect((await h.api('GET', QUEUE, who.token)).status).toBe(403);
      expect(
        (
          await review(
            '00000000-0000-4000-8000-000000000000',
            {
              status: 'verified',
            },
            who,
          )
        ).status,
      ).toBe(403);
    }
    expect((await h.api('GET', QUEUE)).status).toBe(401);
    expect((await h.api('GET', QUEUE, admin.token)).status).toBe(200);
  });

  it('manual review: submit -> queue -> APPROVE -> academy verified + owner notified once', async () => {
    const A = await makeAcademy('approve');
    const other = await makeAcademy('bystander');

    const res = await start(A.owner);
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('needs_manual_review');
    expect(res.body.result_code).toBe('provider_unavailable');
    expect(await academyStatus(A.id)).toBe('pending');

    // The submission is visible to the reviewer (this is the step that used to
    // return an empty queue), with its academy details.
    const item = (await queue()).find((q) => q.academy_id === A.id);
    expect(item).toBeDefined();
    expect(item!.status).toBe('needs_manual_review');

    const done = await review(item!.id, { status: 'verified' });
    expect(done.status).toBe(201);
    const [row] = await kyc(A.id);
    expect(row.status).toBe('verified');
    expect(row.reviewed_by).toBe(admin.id);
    expect(row.reviewed_at).not.toBeNull();
    expect(await academyStatus(A.id)).toBe('verified');

    // Owner-facing state + public page reflect it; no KYC internals leak.
    expect(
      (await h.api('GET', '/academy/verification/me', A.owner.token)).body
        .status,
    ).toBe('verified');
    expect(
      (await h.api('GET', '/academy/me', A.owner.token)).body
        .verificationStatus,
    ).toBe('verified');
    const pub = await h.api('GET', `/marketplace/academies/${A.slug}`);
    expect(pub.body.academy.verificationStatus).toBe('verified');
    expect(JSON.stringify(pub.body)).not.toMatch(
      /result_code|reviewed_by|consent|academy_kyc|provider_verification|ABCDE1234F|29ABCDE/i,
    );

    // Exactly one notification, to the owner only.
    expect(
      await h.notificationsFor(A.owner.id, 'academy_verification_approved'),
    ).toHaveLength(1);
    for (const u of [other.owner, student, parent, tutor, admin]) {
      expect(
        await h.notificationsFor(u.id, 'academy_verification_approved'),
      ).toHaveLength(0);
    }
    expect(await academyStatus(other.id)).toBe('pending');

    // Resolved => off the queue, cannot be re-decided, no duplicate notice.
    expect((await queue()).some((q) => q.academy_id === A.id)).toBe(false);
    const again = await review(item!.id, { status: 'rejected', reason: 'x' });
    expect(again.status).toBe(400);
    expect(await academyStatus(A.id)).toBe('verified');
    expect(
      await h.notificationsFor(A.owner.id, 'academy_verification_approved'),
    ).toHaveLength(1);
  });

  it('manual review: submit -> queue -> REJECT (reason required) -> academy rejected, owner told why, can resubmit', async () => {
    const A = await makeAcademy('reject');
    await start(A.owner);
    const item = (await queue()).find((q) => q.academy_id === A.id)!;

    expect((await review(item.id, { status: 'rejected' })).status).toBe(400);
    expect(await academyStatus(A.id)).toBe('pending');

    const done = await review(item.id, {
      status: 'rejected',
      reason: 'PAN does not match the academy owner',
    });
    expect(done.status).toBe(201);
    expect(await academyStatus(A.id)).toBe('rejected');
    const me = await h.api('GET', '/academy/verification/me', A.owner.token);
    expect(me.body.status).toBe('rejected');
    expect(me.body.reason).toContain('PAN does not match');
    expect(
      (await h.api('GET', '/academy/me', A.owner.token)).body
        .verificationStatus,
    ).toBe('rejected');

    const notes = await h.notificationsFor(
      A.owner.id,
      'academy_verification_rejected',
    );
    expect(notes).toHaveLength(1);
    expect(JSON.stringify(notes[0].payload)).toContain(
      'PAN does not match the academy owner',
    );
    expect(
      await h.notificationsFor(A.owner.id, 'academy_verification_approved'),
    ).toHaveLength(0);
    expect((await queue()).some((q) => q.academy_id === A.id)).toBe(false);

    // Resubmission keeps the rejected row as history.
    expect((await start(A.owner)).status).toBe(201);
    const rows = await kyc(A.id);
    expect(rows.map((r) => r.status)).toEqual([
      'rejected',
      'needs_manual_review',
    ]);
  });

  it('resubmitting from needs_manual_review leaves ONE queue entry (the latest), and the superseded row is not listed', async () => {
    const A = await makeAcademy('resubmit');
    await start(A.owner);
    await start(A.owner);
    const rows = await kyc(A.id);
    expect(rows).toHaveLength(2);
    const listed = (await queue()).filter((q) => q.academy_id === A.id);
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe(rows[1].id);
  });

  it('an owner can only ever submit for their OWN academy (identity from the JWT; a body academyId is rejected) and cannot decide anything', async () => {
    const A = await makeAcademy('iso-a');
    const B = await makeAcademy('iso-b');
    expect((await start(B.owner, { ...VALID, academyId: A.id })).status).toBe(
      400,
    );
    expect(await kyc(A.id)).toHaveLength(0);
    await start(B.owner);
    expect(await kyc(A.id)).toHaveLength(0);
    expect(await kyc(B.id)).toHaveLength(1);
    const bItem = (await kyc(B.id))[0];
    expect(
      (await review(bItem.id, { status: 'verified' }, A.owner)).status,
    ).toBe(403);
    expect(await academyStatus(B.id)).toBe('pending');
  });

  it('safe error responses: malformed id, missing id, invalid status', async () => {
    const bad = await review('not-a-uuid', { status: 'verified' });
    expect(bad.status).toBe(400);
    expect(JSON.stringify(bad.body)).not.toMatch(
      /select|relation|syntax|stack/i,
    );
    expect(
      (
        await review('00000000-0000-4000-8000-000000000000', {
          status: 'verified',
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await review('00000000-0000-4000-8000-000000000000', {
          status: 'pending',
        })
      ).status,
    ).toBe(400);
  });

  it('automatic verification (provider settles it) needs no reviewer: verified, not queued, no notice', async () => {
    panSpy.mockResolvedValueOnce({
      verified: true,
      fullName: 'X',
      resultCode: 'verified',
    });
    const gstinSpy = jest.spyOn(provider, 'verifyGstin').mockResolvedValueOnce({
      verified: true,
      active: true,
      legalName: 'Y',
      resultCode: 'verified',
    });
    const A = await makeAcademy('auto');
    const res = await start(A.owner);
    gstinSpy.mockRestore();
    expect(res.body.status).toBe('verified');
    expect(await academyStatus(A.id)).toBe('verified');
    expect((await queue()).some((q) => q.academy_id === A.id)).toBe(false);
    expect(
      await h.notificationsFor(A.owner.id, 'academy_verification_approved'),
    ).toHaveLength(0);
    const [row] = await kyc(A.id);
    expect(JSON.stringify(row)).not.toMatch(/ABCDE1234F|29ABCDE/);
  });
});
