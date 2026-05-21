import Link from "next/link";

const modules = [
  {
    title: "Briefing",
    description: "Criar e organizar o briefing de voo.",
    href: "/briefing",
  },
  {
    title: "NavLog",
    description: "Planeamento de rota, fuel, ETE e export NAVLOG.",
    href: "/navlog",
  },
  {
    title: "Performance & M&B",
    description: "Cálculos de performance e massa & centragem.",
    href: "/performance",
  },
  {
    title: "Aviation Map",
    description: "Mapa com OpenAIP, AD, VFR, IFR e VOR.",
    href: "/vfr-map",
  },
  {
    title: "Tools",
    description: "Ferramentas auxiliares de preparação.",
    href: "/tools",
  },
];

export default function HomePage() {
  return (
    <div className="space-y-10">
      <section className="border-b border-zinc-200 pb-8">
        <p className="mb-3 text-sm font-medium text-zinc-500">
          Flight planning
        </p>

        <h1 className="text-4xl font-semibold tracking-tight text-zinc-950 md:text-6xl">
          Briefings
        </h1>

        <p className="mt-5 max-w-2xl text-lg leading-8 text-zinc-600">
          Ferramentas de preparação de voo numa estrutura simples e rápida.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {modules.map((module) => (
          <Link
            key={module.href}
            href={module.href}
            className="group rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-md"
          >
            <div className="flex h-full flex-col justify-between gap-8">
              <div>
                <h2 className="text-xl font-semibold tracking-tight text-zinc-950">
                  {module.title}
                </h2>

                <p className="mt-3 text-sm leading-6 text-zinc-500">
                  {module.description}
                </p>
              </div>

              <p className="text-sm font-medium text-zinc-950 transition group-hover:translate-x-1">
                Abrir →
              </p>
            </div>
          </Link>
        ))}
      </section>
    </div>
  );
}
