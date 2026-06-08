import Link from "next/link";

type ModulePlaceholderProps = {
  title: string;
  eyebrow: string;
  description: string;
  nextStep: string;
};

export function ModulePlaceholder({
  title,
  eyebrow,
  description,
  nextStep,
}: ModulePlaceholderProps) {
  return (
    <div className="space-y-8">
      <section className="border-b border-zinc-200 pb-8">
        <p className="mb-3 text-sm font-medium text-zinc-500">{eyebrow}</p>

        <h1 className="text-4xl font-semibold tracking-tight text-zinc-950 md:text-5xl">
          {title}
        </h1>

        <p className="mt-5 max-w-3xl text-lg leading-8 text-zinc-600">
          {description}
        </p>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-6">
        <p className="text-sm font-semibold text-zinc-950">Next step</p>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">
          {nextStep}
        </p>
      </section>

      <Link
        href="/"
        className="inline-flex rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 hover:text-zinc-950"
      >
        ← Back to home
      </Link>
    </div>
  );
}
