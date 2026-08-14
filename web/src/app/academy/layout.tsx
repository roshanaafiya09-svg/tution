import { AcademyShell } from '@/components/academy-shell';

export default function AcademyLayout({ children }: { children: React.ReactNode }) {
  return <AcademyShell>{children}</AcademyShell>;
}
