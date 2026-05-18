import Link from "next/link";
import { navigationItems, workflowSteps } from "@/lib/navigation";

const statusLabels = {
  ready: "Disponível",
  next: "A seguir",
  planned: "Planeado",
};

export default function HomePage() {
  return (
    <div className="space-y-10">
      <section className="border-b border-zinc-200 pb-10">
        <div className="max-w-3xl">
          <p className="mb-3 text-sm font-medium text-zinc-500">
            Nova versão · Next.js · Vercel · Supabase
          </p>

          <h1 className="text-4xl font-semibold tracking-tight text-zinc-950 md:text-6xl">
            Briefings de voo numa estrutura mais simples.
          </h1>

          <p className="mt-5 text-lg leading-8 text-zinc-600">
            A app vai ser reconstruída por módulos claros: primeiro o briefing
            principal, depois o NavLog baseado na versão de teste, seguido de
            Performance & Mass Balance, mapa VFR e ferramentas auxiliares.
          </p>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.75fr_1.25fr]">
        <div className="rounded-2xl border border-zinc-200 bg-white p-6">
          <div className="mb-5">
            <h2 className="text-lg font-semibold tracking-tight">
              Fluxo principal
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              Ordem lógica do briefing final.
            </p>
          </div>

          <div className="space-y-2">
            {workflowSteps.map((step, index) => (
              <div
                key={step}
                className="flex items-center gap-3 rounded-xl border border-zinc-100 bg-zinc-50 px-4 py-3"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-xs font-semibold text-zinc-500 ring-1 ring-zinc-200">
                  {index + 1}
                </div>
                <span className="text-sm font-medium text-zinc-800">
                  {step}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {navigationItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="group rounded-2xl border border-zinc-200 bg-white p-6 transition hover:border-zinc-300 hover:shadow-sm"
            >
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                    {item.eyebrow}
                  </p>
                  <h2 className="mt-1 text-xl font-semibold tracking-tight text-zinc-950">
                    {item.title}
                  </h2>
                </div>

                <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600">
                  {statusLabels[item.status]}
                </span>
              </div>

              <p className="text-sm leading-6 text-zinc-600">
                {item.description}
              </p>

              <div className="mt-5 flex items-center justify-between border-t border-zinc-100 pt-4">
                <span className="text-xs font-medium text-zinc-400">
                  {item.phase}
                </span>
                <span className="text-sm font-medium text-zinc-950 transition group-hover:translate-x-0.5">
                  Abrir →
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-6">
        <h2 className="text-lg font-semibold tracking-tight">
          Decisões da migração
        </h2>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <div>
            <p className="text-sm font-semibold text-zinc-950">NavLog</p>
            <p className="mt-1 text-sm leading-6 text-zinc-600">
              A versão oficial será baseada no antigo ficheiro teste.py.
            </p>
          </div>

          <div>
            <p className="text-sm font-semibold text-zinc-950">
              Performance & M&B
            </p>
            <p className="mt-1 text-sm leading-6 text-zinc-600">
              Tecnam e PA-28 ficam numa só página com seletor de aeronave.
            </p>
          </div>

          <div>
            <p className="text-sm font-semibold text-zinc-950">Supabase</p>
            <p className="mt-1 text-sm leading-6 text-zinc-600">
              O que estava em Gist será migrado para tabelas próprias.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
