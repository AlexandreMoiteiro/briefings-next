"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandLogo } from "@/components/brand-logo";
import { SiteNavigation } from "@/components/site-navigation";
import { NotamMapAnnouncement } from "@/components/notam-map-announcement";
import { NavlogAccountAnnouncement } from "@/components/navlog-account-announcement";
import { PageOpenTracker } from "@/components/page-open-tracker";

type AppShellProps = {
  children: React.ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  if (pathname === "/meteorology/share") {
    return <main className="mx-auto min-h-dvh w-full max-w-[1600px] bg-zinc-50 px-4 py-5 text-zinc-950 sm:px-6 sm:py-8">{children}</main>;
  }

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
      <NavlogAccountAnnouncement />

      <footer className="mt-auto border-t border-zinc-200 bg-white">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-5 text-sm text-zinc-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-3">
            <p className="font-medium text-zinc-600">Briefings</p>
            <span aria-hidden="true" className="text-zinc-300">·</span>
            <Link href="/admin" aria-label="Open Admin" title="Admin"
              className="rounded-sm text-xs font-normal text-zinc-400 transition hover:text-zinc-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500">
              Admin
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
