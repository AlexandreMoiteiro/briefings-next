"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navigationItems } from "@/lib/navigation";

export function SiteNavigation({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main navigation"
      className={
        mobile
          ? "flex min-w-max items-center gap-1 px-4 py-2 sm:px-6 lg:hidden"
          : "hidden items-center gap-1 lg:flex"
      }
    >
      {navigationItems.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={[
              "rounded-xl px-3 py-2 text-sm font-medium transition",
              active
                ? "bg-zinc-950 text-white"
                : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950",
            ].join(" ")}
          >
            {item.title}
          </Link>
        );
      })}
    </nav>
  );
}
