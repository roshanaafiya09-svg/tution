const students = [
  { name: "Aditi R.", mon: true, tue: true, wed: true, thu: false, fri: true, sat: true, fee: "paid" },
  { name: "Karthik S.", mon: true, tue: true, wed: true, thu: true, fri: true, sat: true, fee: "paid" },
  { name: "Meera V.", mon: true, tue: false, wed: true, thu: true, fri: true, sat: false, fee: "due" },
  { name: "Yusuf A.", mon: true, tue: true, wed: false, thu: true, fri: true, sat: true, fee: "paid" },
  { name: "Priya N.", mon: false, tue: true, wed: true, thu: true, fri: false, sat: true, fee: "due" },
] as const;

const days = ["M", "T", "W", "T", "F", "S"] as const;

const modules = [
  {
    title: "Batches & scheduling",
    body: "Set your weekly availability once. Batches and recurring sessions follow the rule — DST included, so a class never silently shifts an hour.",
  },
  {
    title: "Attendance",
    body: "One tap on “Join” records who showed up. Nothing to reconcile from memory at month-end.",
  },
  {
    title: "Materials & homework",
    body: "Upload a PDF or photo once; students read it offline. Submissions come back the same way, ready to grade.",
  },
  {
    title: "Fee ledger",
    body: "See who's paid this month and who hasn't, at a glance — no more scrolling back through chat history.",
  },
  {
    title: "Announcements",
    body: "One message reaches the whole batch, in the app and as a push notification. No group to mute by mistake.",
  },
] as const;

export default function Home() {
  return (
    <main>
      {/* --- Nav --- */}
      <header className="sticky top-0 z-20 border-b border-white/10 bg-brand-950/90 backdrop-blur supports-[backdrop-filter]:bg-brand-950/70">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <span className="font-display text-xl font-semibold italic text-neutral-50">
            Scholar
          </span>
          <div className="hidden items-center gap-8 text-sm text-neutral-200 sm:flex">
            <a href="#modules" className="transition-colors hover:text-neutral-50">
              For tutors
            </a>
            <a href="#pricing" className="transition-colors hover:text-neutral-50">
              Pricing
            </a>
          </div>
          <a
            href="#pricing"
            className="rounded-md bg-accent-500 px-4 py-2 text-sm font-semibold text-brand-950 shadow-sm transition-colors hover:bg-accent-400"
          >
            Start free trial
          </a>
        </nav>
      </header>

      {/* --- Hero --- */}
      <section className="relative overflow-hidden bg-brand-950">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
            backgroundSize: "28px 28px",
          }}
        />
        <div className="relative mx-auto grid max-w-6xl gap-16 px-6 py-20 sm:py-28 lg:grid-cols-[1.05fr_1fr] lg:items-center">
          <div className="motion-safe:animate-[fade-up_0.6s_ease-out]">
            <p className="mb-5 text-sm font-semibold uppercase tracking-[0.14em] text-accent-400">
              Chennai &amp; Tamil Nadu &middot; built for tutors
            </p>
            <h1 className="font-display text-4xl font-semibold leading-[1.1] text-neutral-50 sm:text-5xl lg:text-[3.4rem]">
              Your batches, your students, your fees —{" "}
              <em className="font-normal italic text-accent-400">off WhatsApp</em> and out
              of the notebook.
            </h1>
            <p className="mt-6 max-w-lg text-lg leading-relaxed text-neutral-300">
              Scholar is where tutors run batches, mark attendance, share materials, and
              track who&apos;s paid — so none of it lives in a group chat anymore.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <a
                href="#pricing"
                className="rounded-md bg-accent-500 px-6 py-3 text-sm font-semibold text-brand-950 shadow-md transition-colors hover:bg-accent-400"
              >
                Start your free 90-day trial
              </a>
              <a
                href="#modules"
                className="text-sm font-semibold text-neutral-200 underline decoration-neutral-500 underline-offset-4 transition-colors hover:text-neutral-50"
              >
                See how it works
              </a>
            </div>
            <p className="mt-5 text-xs text-neutral-400">
              No card required. Full access for 90 days.
            </p>
          </div>

          {/* Signature: the ledger card */}
          <div className="motion-safe:animate-[fade-up_0.6s_ease-out_0.15s_backwards] lg:justify-self-end">
            <div className="relative w-full max-w-md rotate-[-2deg] rounded-lg border border-neutral-200 bg-neutral-50 p-6 shadow-lg sm:p-7">
              <div
                aria-hidden
                className="absolute -right-4 -top-4 flex h-16 w-16 rotate-[10deg] items-center justify-center rounded-full border-2 border-dashed border-error/70 text-center font-display text-[0.55rem] font-semibold uppercase leading-tight tracking-wide text-error/80"
              >
                Verified
                <br />
                Tutor
              </div>

              <div className="mb-4 flex items-baseline justify-between border-b border-neutral-300 pb-3">
                <div>
                  <p className="font-display text-lg font-semibold text-neutral-900">
                    Grade 10 &middot; Physics
                  </p>
                  <p className="text-xs text-neutral-500">Batch B &middot; 5 students</p>
                </div>
                <span className="rounded bg-success-bg px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-wide text-success">
                  This week
                </span>
              </div>

              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-neutral-400">
                    <th className="pb-2 font-medium">Student</th>
                    {days.map((d, i) => (
                      <th key={i} className="pb-2 text-center font-medium">
                        {d}
                      </th>
                    ))}
                    <th className="pb-2 text-right font-medium">Fee</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {students.map((s) => (
                    <tr key={s.name} className="border-t border-dotted border-neutral-300">
                      <td className="py-1.5 pr-2 font-medium text-neutral-800">{s.name}</td>
                      {[s.mon, s.tue, s.wed, s.thu, s.fri, s.sat].map((present, i) => (
                        <td key={i} className="py-1.5 text-center">
                          <span className={present ? "text-brand-600" : "text-neutral-300"}>
                            {present ? "✓" : "–"}
                          </span>
                        </td>
                      ))}
                      <td className="py-1.5 text-right">
                        <span
                          className={
                            s.fee === "paid"
                              ? "font-semibold text-success"
                              : "font-semibold text-warning"
                          }
                        >
                          {s.fee === "paid" ? "Paid" : "Due"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* --- Trial recap preview (honest framing, not a traction claim) --- */}
      <section className="border-b border-neutral-200 bg-neutral-50">
        <div className="mx-auto max-w-6xl px-6 py-10">
          <p className="mb-4 text-center text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500">
            At the end of your 90-day trial, you&apos;ll see a recap like this
          </p>
          <div className="mx-auto flex max-w-2xl flex-col divide-y divide-dotted divide-neutral-300 rounded-md border border-neutral-200 bg-white text-center sm:flex-row sm:divide-x sm:divide-y-0">
            <div className="flex-1 px-6 py-5">
              <p className="font-display text-3xl font-semibold tabular-nums text-brand-700">
                41
              </p>
              <p className="mt-1 text-sm text-neutral-500">classes run</p>
            </div>
            <div className="flex-1 px-6 py-5">
              <p className="font-display text-3xl font-semibold tabular-nums text-brand-700">
                380
              </p>
              <p className="mt-1 text-sm text-neutral-500">attendances marked</p>
            </div>
            <div className="flex-1 px-6 py-5">
              <p className="font-display text-3xl font-semibold tabular-nums text-brand-700">
                &#8377;62,000
              </p>
              <p className="mt-1 text-sm text-neutral-500">in fees tracked</p>
            </div>
          </div>
        </div>
      </section>

      {/* --- Modules --- */}
      <section id="modules" className="bg-white">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="font-display text-3xl font-semibold text-neutral-900">
            Everything a batch needs, nothing it doesn&apos;t.
          </h2>
          <p className="mt-3 max-w-xl text-neutral-600">
            Five things tutors actually do every week — built as five focused tools, not
            one crowded inbox.
          </p>

          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {modules.map((m) => (
              <div
                key={m.title}
                className="overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50 transition-shadow hover:shadow-md"
              >
                <div className="h-1 bg-accent-500" />
                <div className="p-5">
                  <h3 className="font-semibold text-neutral-900">{m.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-neutral-600">{m.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* --- Trust strip --- */}
      <section className="border-y border-neutral-200 bg-neutral-100">
        <div className="mx-auto grid max-w-6xl gap-8 px-6 py-14 sm:grid-cols-3">
          <div>
            <h3 className="font-semibold text-neutral-900">Verified before day one</h3>
            <p className="mt-2 text-sm leading-relaxed text-neutral-600">
              Every tutor&apos;s ID and qualifications are checked by hand before a single
              student can join — typically within 24 hours.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-neutral-900">Sign in with WhatsApp</h3>
            <p className="mt-2 text-sm leading-relaxed text-neutral-600">
              An OTP on WhatsApp gets tutors, students, and parents in — no password to
              forget or reset.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-neutral-900">English &amp; Tamil</h3>
            <p className="mt-2 text-sm leading-relaxed text-neutral-600">
              The app speaks both, so a parent digest reads as naturally in Tamil as it
              does in English.
            </p>
          </div>
        </div>
      </section>

      {/* --- Pricing teaser --- */}
      <section id="pricing" className="bg-brand-950">
        <div className="mx-auto max-w-3xl px-6 py-20 text-center">
          <h2 className="font-display text-3xl font-semibold text-neutral-50">
            Free for 90 days. No card, no catch.
          </h2>
          <p className="mt-4 text-neutral-300">
            After your trial, it&apos;s &#8377;499/month for up to 25 students — the same
            price whether you teach one batch or five.
          </p>
          <a
            href="#"
            className="mt-8 inline-block rounded-md bg-accent-500 px-7 py-3 text-sm font-semibold text-brand-950 shadow-md transition-colors hover:bg-accent-400"
          >
            Start your free trial
          </a>
        </div>
      </section>

      {/* --- Footer --- */}
      <footer className="bg-neutral-950">
        <div className="mx-auto max-w-6xl px-6 py-10 text-sm text-neutral-400">
          <span className="font-display italic text-neutral-200">Scholar</span>
          <span className="mx-2">&middot;</span>
          built for tutors in Chennai &amp; Tamil Nadu.
        </div>
      </footer>
    </main>
  );
}
