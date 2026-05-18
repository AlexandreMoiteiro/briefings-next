import Link from "next/link";
import { navigationItems } from "@/lib/navigation";

type AppShellProps = {
  children: React.ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-950">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-950 text-sm font-bold text-white">
              B
            </div>

            <div>
              <div className="text-sm font-semibold tracking-tight">
                Briefings
              </div>
              <div className="text-xs text-zinc-500">
                Flight preparation
              </div>
            </div>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {navigationItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-lg px-3 py-2 text-sm text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-950"
              >
                {item.title}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-6 py-10">
        {children}
      </main>
    </div>
  );
}
