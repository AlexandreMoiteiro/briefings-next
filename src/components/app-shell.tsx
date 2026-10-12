import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { SiteNavigation } from "@/components/site-navigation";
import { NotamMapAnnouncement } from "@/components/notam-map-announcement";
import { PageOpenTracker } from "@/components/page-open-tracker";

type AppShellProps = {
  children: React.ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-zinc-50 text-zinc-950">
      <header className="sticky top-0 z-50 border-b border-zinc-200/80 bg-white/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-3" aria-label="Briefings home">
            <BrandLogo />
          </Link>
          <SiteNavigation />
        </div>
        <div className="overflow-x-auto border-t border-zinc-100 bg-white lg:hidden">
          <SiteNavigation mobile />
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-9">
        {children}
      </main>

      <PageOpenTracker />
      <NotamMapAnnouncement />

      <footer className="mt-auto border-t border-zinc-200 bg-white">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-5 text-sm text-zinc-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-5">
            <p className="font-medium text-zinc-600">Briefings</p>
            <Link href="/admin" aria-label="Open Admin" title="Admin"
              className="flex h-10 w-10 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500">
              <span aria-hidden="true" className="text-[27px] leading-none">{" \u20DE"}</span>
            </Link>
          </div>
          <Link href="/feedback" className="font-medium text-zinc-700 transition hover:text-zinc-950">
            Suggestions & questions
          </Link>
        </div>
      </footer>
    </div>
  );
}
