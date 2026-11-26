import Link from "next/link";
import { navigationItems } from "@/lib/navigation";

type NavItem = (typeof navigationItems)[number];

function ToolCard({ item, index, featured = false }: { item: NavItem; index?: number; featured?: boolean }) {
  return (
    <Link
      href={item.href}
      className={[
        "briefings-tile group h-full p-6 sm:p-7",
        featured
          ? "briefings-tile-primary min-h-52"
          : "",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            {typeof index === "number" ? (
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#edf5ff] text-xs font-semibold text-[#0066cc]">
                {index}
              </span>
            ) : null}
            <p className="text-xs font-semibold text-zinc-500">
              {item.eyebrow}
            </p>
          </div>
          <h2 className={"mt-3 font-semibold tracking-tight text-zinc-950 " + (featured ? "text-2xl sm:text-3xl" : "text-xl")}>
            {item.title}
          </h2>
        </div>
        <span className="text-xl text-[#0066cc]">
          ↗
        </span>
      </div>
      <p className="mt-3 text-sm leading-6 text-zinc-600">{item.description}</p>
      <div className="mt-auto flex flex-wrap gap-2 pt-6">
        {item.details.map((detail) => (
          <span
            key={detail}
            className="rounded-full bg-[#f5f5f7] px-2.5 py-1 text-xs font-medium text-zinc-600"
          >
            {detail}
          </span>
        ))}
      </div>
    </Link>
  );
}

export default function HomePage() {
  const flightTools = navigationItems.filter((item) => item.group === "workflow");
  const mapTools = navigationItems.filter((item) => item.group === "utility" && item.href !== "/meteorology");
  const meteorology = navigationItems.find((item) => item.href === "/meteorology");

  return (
    <div className="space-y-10">
      <header className="max-w-3xl pt-3 pb-2 md:pt-8">
        <p className="text-sm font-semibold text-[#0066cc]">Flight preparation</p>
        <h1 className="briefings-home-title mt-3">
          Briefings.
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-600 sm:text-lg">
          Briefing, navigation, aircraft performance and map tools.
        </p>
      </header>

      <section>
        <div className="mb-4">
          <p className="text-sm font-semibold text-zinc-600">
            Flight workflow
          </p>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {flightTools.map((item, index) => (
            <ToolCard key={item.href} item={item} index={index + 1} />
          ))}
        </div>
      </section>

      <section>
        <div className="mb-4">
          <p className="text-sm font-semibold text-zinc-600">
            Maps &amp; tools
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {mapTools.map((item) => (
            <ToolCard key={item.href} item={item} />
          ))}
          {meteorology ? (
            <div className="md:col-span-2">
              <ToolCard item={meteorology} featured />
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
