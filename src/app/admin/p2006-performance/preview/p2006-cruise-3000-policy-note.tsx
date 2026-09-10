export function P2006TCruise3000PolicyNote() {
  return (
    <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-800">
        Cruise 3000 ft · aircraft-specific row policy
      </p>
      <h2 className="mt-1 text-xl font-semibold text-zinc-950">
        Mapper com 15 linhas; motor protegido por matrícula
      </h2>
      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <div className="rounded-2xl border border-amber-200 bg-white p-4">
          <p className="text-sm font-semibold text-zinc-950">CS-EAQ</p>
          <p className="mt-1 text-sm leading-6 text-zinc-600">
            A página publicada tem 15 linhas utilizáveis. O motor não inclui a
            combinação 1900 RPM / 20 inHg a 3000 ft.
          </p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-white p-4">
          <p className="text-sm font-semibold text-zinc-950">CS-EBX e D-GSEV</p>
          <p className="mt-1 text-sm leading-6 text-zinc-600">
            A página contém uma 16.ª linha, 1900 RPM / 20 inHg. Essa linha fica fora
            do mapper porque não é usada no planeamento atual, mas permanece na
            tabela numérica do motor.
          </p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-white p-4">
          <p className="text-sm font-semibold text-zinc-950">Proteção do cálculo</p>
          <p className="mt-1 text-sm leading-6 text-zinc-600">
            O motor seleciona as linhas pelo RPM e interpola pela potência publicada;
            não usa o número visual da linha do mapper. Omitir a última linha do
            audit não desloca os valores usados no cálculo.
          </p>
        </div>
      </div>
    </section>
  );
}
