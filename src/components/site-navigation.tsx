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
      {navigationItems.map((item, index) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const startsUtilities =
          item.group === "utility" &&
          navigationItems[index - 1]?.group !== "utility";

        return (
          <div
            key={item.href}
            className={
              startsUtilities
                ? mobile
                  ? "ml-2 border-l border-zinc-200 pl-2"
                  : "ml-2 border-l border-zinc-200 pl-2"
                : ""
            }
          >
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={[
                "block rounded-xl px-3 py-2 text-sm font-medium transition",
                active
                  ? "bg-zinc-950 text-white"
                  : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950",
              ].join(" ")}
            >
              {item.title}
            </Link>
          </div>
        );
      })}
    </nav>
  );
}
