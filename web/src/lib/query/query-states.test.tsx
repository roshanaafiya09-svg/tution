import { describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { api, session } from '@/lib/api';
import { configureApi } from '@/lib/api/config';
import { academyContext, teachingContext } from '@/lib/teaching-context';
import { useApiQuery } from '@/lib/query';
import { EmptyState, QueryBoundary } from '@/components/ui';
import { envelope, mockFetch, ok } from '@/test/fetch-mock';

interface Student {
  id: string;
  name: string;
}
interface ClassRow {
  id: string;
  title: string;
}

/** A dashboard page written the way every page now is. */
function StudentsPage() {
  const q = useApiQuery(() => api.get<Student[]>('/students/me'), []);
  return (
    <QueryBoundary
      query={q}
      what="your students"
      loading={<p>Loading students…</p>}
      empty={<EmptyState title="No students yet" description="Invite students to get started." />}
    >
      {(rows) => (
        <ul aria-label="students">
          {rows.map((s) => (
            <li key={s.id}>{s.name}</li>
          ))}
        </ul>
      )}
    </QueryBoundary>
  );
}

/** A page with two independent widgets, each with its own request and state. */
function TwoWidgetDashboard() {
  const students = useApiQuery(() => api.get<Student[]>('/students/me'), []);
  const classes = useApiQuery(() => api.get<ClassRow[]>('/sessions/today'), []);
  return (
    <div>
      <section aria-label="students-widget">
        <QueryBoundary
          query={students}
          what="your students"
          compact
          empty={<p>No students yet</p>}
          loading={<p>loading students</p>}
        >
          {(rows) => <p>{rows.length} students</p>}
        </QueryBoundary>
      </section>
      <section aria-label="classes-widget">
        <QueryBoundary
          query={classes}
          what="today's classes"
          compact
          empty={<p>No classes today</p>}
          loading={<p>loading classes</p>}
        >
          {(rows) => <p>{rows.length} classes today</p>}
        </QueryBoundary>
      </section>
    </div>
  );
}

const STUDENTS: Student[] = [
  { id: '1', name: 'Asha' },
  { id: '2', name: 'Ravi' },
];

describe('A. successful response with data → shows the data', () => {
  it('renders every record and no error or empty UI', async () => {
    mockFetch({ 'GET /students/me': ok(STUDENTS) });
    render(<StudentsPage />);
    expect(screen.getByText('Loading students…')).toBeInTheDocument();
    expect(await screen.findByText('Asha')).toBeInTheDocument();
    expect(screen.getByText('Ravi')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText('No students yet')).toBeNull();
  });
});

describe('B. successful response with zero records → shows the empty state', () => {
  it('shows "No students yet" and no error', async () => {
    mockFetch({ 'GET /students/me': ok([]) });
    render(<StudentsPage />);
    expect(await screen.findByText('No students yet')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('C. 500 → error state, NOT the empty state', () => {
  it('shows a server-error state with the request reference and never "No students yet"', async () => {
    mockFetch({ 'GET /students/me': envelope(500, 'INTERNAL_ERROR', 'Something went wrong on our side. Please try again.') });
    render(<StudentsPage />);

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Something went wrong on our side')).toBeInTheDocument();
    expect(alert).toHaveTextContent('loading your students');
    expect(within(alert).getByText('srv-req-500-abcdef')).toBeInTheDocument(); // traceable reference
    expect(within(alert).getByRole('button', { name: 'Retry' })).toBeInTheDocument();

    expect(screen.queryByText('No students yet')).toBeNull();
    expect(screen.queryByRole('list')).toBeNull();
    // and it must not be mislabelled as a connection problem
    expect(alert).not.toHaveTextContent(/connection|internet/i);
  });
});

describe('D. 403 → permission error, NOT the empty state', () => {
  it('says the account has no access and offers no pointless Retry', async () => {
    mockFetch({ 'GET /students/me': envelope(403, 'FORBIDDEN', "You don't have permission to do that.") });
    render(<StudentsPage />);

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('No access')).toBeInTheDocument();
    expect(alert).toHaveTextContent("doesn't have permission to see your students");
    expect(within(alert).queryByRole('button', { name: 'Retry' })).toBeNull();
    expect(screen.queryByText('No students yet')).toBeNull();
    expect(alert).not.toHaveTextContent(/connection|internet/i);
  });

  it('an Academy isolation 403 keeps the server’s specific explanation visible', async () => {
    session.set('t', 'c');
    teachingContext.set(academyContext('11111111-1111-4111-8111-111111111111'));
    mockFetch({
      'GET /students/me': envelope(
        403,
        'TEACHING_CONTEXT_MISMATCH',
        'This is an Individual batch. Switch to your Individual profile to manage it.',
      ),
    });
    render(<StudentsPage />);

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Wrong teaching profile')).toBeInTheDocument();
    expect(alert).toHaveTextContent('Switch to your Individual profile to manage it.');
    expect(alert).toHaveAttribute('data-error-code', 'TEACHING_CONTEXT_MISMATCH');
    expect(screen.queryByText('No students yet')).toBeNull();
  });

  it('losing membership of the academy offers a one-click way back to Individual', async () => {
    const user = userEvent.setup();
    session.set('t', 'c');
    teachingContext.set(academyContext('11111111-1111-4111-8111-111111111111'));
    mockFetch({
      'GET /students/me': (call) =>
        call.headers['x-teaching-context'] === 'individual'
          ? ok(STUDENTS)
          : envelope(403, 'TEACHING_CONTEXT_FORBIDDEN', "You aren't an active member of that academy"),
    });
    render(<StudentsPage />);

    await user.click(await screen.findByRole('button', { name: 'Switch to Individual profile' }));
    // The switch re-runs the query centrally — under the Individual profile.
    expect(await screen.findByText('Asha')).toBeInTheDocument();
  });
});

describe('E. 404 → not-found state where appropriate', () => {
  it('says it was not found, and does not offer Retry', async () => {
    mockFetch({ 'GET /students/me': envelope(404, 'NOT_FOUND', 'Not Found') });
    render(<StudentsPage />);

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Not found')).toBeInTheDocument();
    expect(alert).toHaveTextContent("couldn't find your students");
    expect(within(alert).queryByRole('button', { name: 'Retry' })).toBeNull();
    expect(screen.queryByText('No students yet')).toBeNull();
  });
});

describe('F. network failure → connection error', () => {
  it('is the ONLY failure that talks about the connection', async () => {
    mockFetch({ 'GET /students/me': { networkError: true } });
    render(<StudentsPage />);

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText("Can't reach the server")).toBeInTheDocument();
    expect(alert).toHaveTextContent('Check your internet connection');
    expect(within(alert).getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.queryByText('No students yet')).toBeNull();
  });

  it('a request that times out is described as slow, not as "no connection"', async () => {
    mockFetch({ 'GET /students/me': { hang: true } });
    configureApi({ timeoutMs: 10, retryDelaysMs: [] });
    render(<StudentsPage />);

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('The server took too long to respond')).toBeInTheDocument();
    expect(alert).not.toHaveTextContent(/internet connection/i);
  });
});

describe('G. Retry button retries the failed request', () => {
  it('a 500 followed by a success: clicking Retry loads the data', async () => {
    const user = userEvent.setup();
    const m = mockFetch({
      'GET /students/me': [envelope(500, 'INTERNAL_ERROR', 'x'), ok(STUDENTS)],
    });
    render(<StudentsPage />);

    await user.click(await screen.findByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('Asha')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(m.to('GET /students/me')).toHaveLength(2);
  });

  it('a Retry that fails again stays an error — it never degrades to empty', async () => {
    const user = userEvent.setup();
    mockFetch({ 'GET /students/me': envelope(500, 'INTERNAL_ERROR', 'x') });
    render(<StudentsPage />);

    await user.click(await screen.findByRole('button', { name: 'Retry' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText('No students yet')).toBeNull();
  });

  it('a Retry that comes back empty shows the empty state (a successful answer)', async () => {
    const user = userEvent.setup();
    mockFetch({ 'GET /students/me': [envelope(500, 'INTERNAL_ERROR', 'x'), ok([])] });
    render(<StudentsPage />);

    await user.click(await screen.findByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('No students yet')).toBeInTheDocument();
  });
});

describe('H. transient failures retry automatically, without a click', () => {
  it('two 503s then success: the page just loads the data', async () => {
    const m = mockFetch({
      'GET /students/me': [
        envelope(503, 'SERVICE_UNAVAILABLE', 'x'),
        envelope(503, 'SERVICE_UNAVAILABLE', 'x'),
        ok(STUDENTS),
      ],
    });
    render(<StudentsPage />);
    expect(await screen.findByText('Asha')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(m.to('GET /students/me')).toHaveLength(3);
  });

  it('a 500 is NOT retried automatically — it goes straight to the error state', async () => {
    const m = mockFetch({ 'GET /students/me': envelope(500, 'INTERNAL_ERROR', 'x') });
    render(<StudentsPage />);
    await screen.findByRole('alert');
    expect(m.to('GET /students/me')).toHaveLength(1);
  });

  it('a 503 that never clears ends in an error state after the bounded retries', async () => {
    const m = mockFetch({ 'GET /students/me': envelope(503, 'SERVICE_UNAVAILABLE', 'x') });
    render(<StudentsPage />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Service temporarily unavailable');
    expect(m.to('GET /students/me')).toHaveLength(4);
    expect(screen.queryByText('No students yet')).toBeNull();
  });
});

describe('I. 401 is handled centrally (no page code involved)', () => {
  it('the page silently recovers when the session can be refreshed', async () => {
    session.set('old', 'c');
    mockFetch({
      'GET /students/me': (call) =>
        call.headers.authorization === 'Bearer fresh' ? ok(STUDENTS) : envelope(401, 'UNAUTHENTICATED', 'x'),
      'POST /auth/refresh': ok({ accessToken: 'fresh', csrfToken: 'c2' }),
    });
    render(<StudentsPage />);
    expect(await screen.findByText('Asha')).toBeInTheDocument();
  });

  it('when the session is gone the page shows "Session expired", never an empty list', async () => {
    session.set('old', 'c');
    mockFetch({
      'GET /students/me': envelope(401, 'UNAUTHENTICATED', 'x'),
      'POST /auth/refresh': envelope(401, 'UNAUTHENTICATED', 'x'),
    });
    render(<StudentsPage />);
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Session expired')).toBeInTheDocument();
    expect(within(alert).queryByRole('button', { name: 'Retry' })).toBeNull();
    expect(screen.queryByText('No students yet')).toBeNull();
  });
});

describe('J. the selected profile is attached consistently, and switching reloads data', () => {
  it('switching profile refetches the same page under the new profile with no page code', async () => {
    session.set('t', 'c');
    const ACADEMY = academyContext('11111111-1111-4111-8111-111111111111');
    const m = mockFetch({
      'GET /students/me': (call) =>
        call.headers['x-teaching-context'] === 'individual' ? ok([{ id: '1', name: 'Individual Ian' }]) : ok([{ id: '2', name: 'Academy Amy' }]),
    });
    render(<StudentsPage />);
    expect(await screen.findByText('Individual Ian')).toBeInTheDocument();

    act(() => teachingContext.set(ACADEMY));

    expect(await screen.findByText('Academy Amy')).toBeInTheDocument();
    expect(screen.queryByText('Individual Ian')).toBeNull();
    expect(m.calls.map((c) => c.headers['x-teaching-context'])).toEqual(['individual', ACADEMY]);
  });

  it('a slow response from the previous profile can never overwrite the new profile’s data', async () => {
    session.set('t', 'c');
    const ACADEMY = academyContext('11111111-1111-4111-8111-111111111111');
    const json = (body: unknown) =>
      new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

    // The Individual request is held open; the Academy one answers at once.
    let answerIndividual: (() => void) | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init: RequestInit) => {
        const profile = (init.headers as Record<string, string>)['X-Teaching-Context'];
        if (profile === 'individual') {
          return new Promise<Response>((resolve) => {
            answerIndividual = () => resolve(json([{ id: '1', name: 'Individual Ian' }]));
          });
        }
        return Promise.resolve(json([{ id: '2', name: 'Academy Amy' }]));
      }),
    );

    render(<StudentsPage />);
    act(() => teachingContext.set(ACADEMY));
    expect(await screen.findByText('Academy Amy')).toBeInTheDocument();

    // Now the stale Individual answer finally arrives…
    await act(async () => {
      answerIndividual?.();
      await Promise.resolve();
    });
    // …and must be ignored.
    expect(screen.getByText('Academy Amy')).toBeInTheDocument();
    expect(screen.queryByText('Individual Ian')).toBeNull();
  });
});

describe('K. one failed widget never silently empties an unrelated widget', () => {
  it('students fails (500) while classes succeeds with none: students is an ERROR, classes is a genuine empty', async () => {
    mockFetch({
      'GET /students/me': envelope(500, 'INTERNAL_ERROR', 'x'),
      'GET /sessions/today': ok([]),
    });
    render(<TwoWidgetDashboard />);

    const students = screen.getByRole('region', { name: 'students-widget' });
    const classes = screen.getByRole('region', { name: 'classes-widget' });

    expect(await within(students).findByRole('alert')).toBeInTheDocument();
    expect(within(students).queryByText('No students yet')).toBeNull();
    expect(within(students).queryByText(/0 students/)).toBeNull();

    expect(await within(classes).findByText('No classes today')).toBeInTheDocument();
    expect(within(classes).queryByRole('alert')).toBeNull();
  });

  it('classes fails while students loads: students still shows real data, classes shows an error not "0 classes"', async () => {
    mockFetch({
      'GET /students/me': ok(STUDENTS),
      'GET /sessions/today': envelope(500, 'INTERNAL_ERROR', 'x'),
    });
    render(<TwoWidgetDashboard />);

    const students = screen.getByRole('region', { name: 'students-widget' });
    const classes = screen.getByRole('region', { name: 'classes-widget' });

    expect(await within(students).findByText('2 students')).toBeInTheDocument();
    expect(await within(classes).findByRole('alert')).toBeInTheDocument();
    expect(within(classes).queryByText(/0 classes/)).toBeNull();
    expect(within(classes).queryByText('No classes today')).toBeNull();
  });

  it('retrying one widget does not disturb the other', async () => {
    const user = userEvent.setup();
    const m = mockFetch({
      'GET /students/me': ok(STUDENTS),
      'GET /sessions/today': [envelope(500, 'INTERNAL_ERROR', 'x'), ok([{ id: 'c1', title: 'Maths' }])],
    });
    render(<TwoWidgetDashboard />);
    const classes = screen.getByRole('region', { name: 'classes-widget' });

    await user.click(await within(classes).findByRole('button', { name: 'Retry' }));

    expect(await within(classes).findByText('1 classes today')).toBeInTheDocument();
    expect(m.to('GET /students/me')).toHaveLength(1); // students not refetched
    await waitFor(() => expect(screen.getByText('2 students')).toBeInTheDocument());
  });
});
