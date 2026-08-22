import { ArrowRight, BookOpen, MessageCircle, FileSpreadsheet } from 'lucide-react';

export function ChaosToClaritySection() {
  return (
    <section className="bg-white dark:bg-neutral-900">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-center font-display text-3xl font-semibold text-neutral-900 dark:text-neutral-50">
          From scattered to organised.
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-neutral-600 dark:text-neutral-400">
          Tuition today is often spread across a notebook, a chat app and a spreadsheet. Scholar
          brings it into one place.
        </p>

        <div className="mt-14 flex flex-col items-center gap-8 sm:flex-row sm:items-center sm:justify-center sm:gap-6">
          <div className="flex shrink-0 flex-col gap-3">
            <div className="flex -rotate-3 items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-100 px-4 py-2.5 text-sm text-neutral-500 dark:border-neutral-800 dark:bg-neutral-800/60">
              <BookOpen className="h-4 w-4" aria-hidden />
              Attendance notebook
            </div>
            <div className="ml-4 flex rotate-2 items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-100 px-4 py-2.5 text-sm text-neutral-500 dark:border-neutral-800 dark:bg-neutral-800/60">
              <MessageCircle className="h-4 w-4" aria-hidden />
              Fee reminders on chat
            </div>
            <div className="flex -rotate-2 items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-100 px-4 py-2.5 text-sm text-neutral-500 dark:border-neutral-800 dark:bg-neutral-800/60">
              <FileSpreadsheet className="h-4 w-4" aria-hidden />
              A spreadsheet somewhere
            </div>
          </div>

          <ArrowRight
            className="h-6 w-6 shrink-0 rotate-90 text-neutral-300 dark:text-neutral-700 sm:rotate-0"
            aria-hidden
          />

          <div className="w-full max-w-xs shrink-0 rounded-xl border border-neutral-200 bg-neutral-50 p-5 shadow-md dark:border-neutral-800 dark:bg-neutral-950/60">
            <p className="font-display text-base font-semibold text-neutral-900 dark:text-neutral-50">
              Scholar
            </p>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              Batches, attendance, materials and fees — one organised platform.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
