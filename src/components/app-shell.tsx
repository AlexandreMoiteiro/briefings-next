import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { SiteNavigation } from "@/components/site-navigation";

type AppShellProps = {
  children: React.ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-950">
      <header className="sticky top-0 z-50 border-b border-zinc-200/80 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-3" aria-label="Briefings home">
            <BrandLogo />
          </Link>
          <SiteNavigation />
        </div>
        <div className="overflow-x-auto border-t border-zinc-100 bg-white lg:hidden">
          <SiteNavigation mobile />
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-9">
        {children}
      </main>

      <footer className="border-t border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-6 text-sm text-zinc-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>Briefings · flight preparation tools</p>
          <div className="flex items-center gap-4">
            <Link href="/feedback" className="font-medium text-zinc-700 hover:text-zinc-950">
              Suggestions & questions
            </Link>
            <Link href="/admin" className="text-zinc-400 hover:text-zinc-700">
              Admin
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
