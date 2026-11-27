"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navigationItems } from "@/lib/navigation";

export function SiteNavigation({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname();
  const groups = [
    { label: "Prepare", items: navigationItems.filter(item => item.group === "workflow") },
    { label: "Reference", items: navigationItems.filter(item => item.group === "utility") },
  ];
  return (
    <nav aria-label={mobile ? "Mobile main navigation" : "Main navigation"} className={mobile ? "grid grid-cols-2 gap-2 px-3 py-2 sm:px-6 lg:hidden" : "hidden items-center gap-4 lg:flex"}>
      {groups.map(group => (
        <div key={group.label} className={mobile ? "min-w-0" : "flex items-center gap-1 border-l border-slate-200 pl-3"}>
          {mobile ? <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{group.label}</p> : null}
          <div className={mobile ? "grid gap-0.5 sm:grid-cols-3" : "flex items-center gap-1"}>
            {group.items.map(item => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={"block whitespace-nowrap rounded-lg px-2.5 py-2 text-xs font-semibold transition-colors sm:text-sm " + (active ? "bg-sky-100 text-sky-950" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950")}>{item.title}</Link>;
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
