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
          ? "grid grid-cols-3 items-center gap-1 px-3 py-2 sm:grid-cols-6 sm:px-6 lg:hidden"
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
                  ? ""
                  : "ml-2 border-l border-zinc-200 pl-2"
                : ""
            }
          >
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={[
                "block rounded-lg px-2.5 py-2 text-center text-xs font-medium transition sm:text-sm",
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
