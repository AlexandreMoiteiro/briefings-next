import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
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
            <BrandLogo />
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {navigationItems.map((item, index) => {
              const startsUtilities =
                item.group === "utility" &&
                navigationItems[index - 1]?.group !== "utility";

              return (
                <div
                  key={item.href}
                  className={startsUtilities ? "ml-2 border-l border-zinc-200 pl-2" : ""}
                >
                  <Link
                    href={item.href}
                    className="rounded-lg px-3 py-2 text-sm text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-950"
                  >
                    {item.title}
                  </Link>
                </div>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-6 py-10">
        {children}
      </main>
    </div>
  );
}
