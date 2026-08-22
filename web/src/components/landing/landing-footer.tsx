export function LandingFooter() {
  return (
    <footer className="bg-neutral-950">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-10 text-sm text-neutral-400 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="font-display italic text-neutral-200">Scholar</span>
          <span className="mx-2">&middot;</span>
          built for tutors in Chennai &amp; Tamil Nadu.
        </div>
        <div className="flex gap-6">
          <a href="/discover" className="transition-colors hover:text-neutral-200">
            Find a tutor
          </a>
          <a href="/login" className="transition-colors hover:text-neutral-200">
            Sign in
          </a>
        </div>
      </div>
    </footer>
  );
}
