import { Menu } from 'lucide-react';
import {
  buttonVariants,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui';
import { cn } from '@/lib/cn';

const AUDIENCE_LINKS = [
  { href: '#audience-teacher', label: 'For Teachers' },
  { href: '#audience-student', label: 'For Students' },
  { href: '#audience-parent', label: 'For Parents' },
  { href: '#audience-academy', label: 'For Academies' },
] as const;

export function LandingNav() {
  return (
    <header className="sticky top-0 z-20 border-b border-white/10 bg-brand-950/90 backdrop-blur supports-[backdrop-filter]:bg-brand-950/70">
      <nav className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
        <a href="#" className="font-display text-xl font-semibold italic text-neutral-50">
          Scholar
        </a>

        <div className="hidden items-center gap-5 text-sm text-neutral-300 lg:flex">
          <a href="#capabilities" className="transition-colors hover:text-neutral-50">
            Features
          </a>
          {AUDIENCE_LINKS.map((link) => (
            <a key={link.href} href={link.href} className="transition-colors hover:text-neutral-50">
              {link.label}
            </a>
          ))}
          <a href="/discover" className="text-neutral-400 transition-colors hover:text-neutral-50">
            Find a tutor
          </a>
        </div>

        <div className="flex items-center gap-2">
          <a
            href="/login"
            className="hidden text-sm font-semibold text-neutral-300 transition-colors hover:text-neutral-50 sm:inline-flex"
          >
            Sign in
          </a>
          <a
            href="#trial"
            className={cn(buttonVariants({ variant: 'accent', size: 'md' }), 'hidden sm:inline-flex')}
          >
            Start free trial
          </a>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label="Open menu"
                className="rounded-md p-2 text-neutral-200 hover:bg-white/10 lg:hidden"
              >
                <Menu className="h-5 w-5" aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[13rem]">
              <DropdownMenuItem asChild>
                <a href="#capabilities">Features</a>
              </DropdownMenuItem>
              {AUDIENCE_LINKS.map((link) => (
                <DropdownMenuItem key={link.href} asChild>
                  <a href={link.href}>{link.label}</a>
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem asChild>
                <a href="/discover">Find a tutor</a>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <a href="/login">Sign in</a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href="#trial" className="font-semibold text-brand-600 dark:text-brand-300">
                  Start free trial
                </a>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </nav>
    </header>
  );
}
