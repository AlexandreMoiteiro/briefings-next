import Image from "next/image";

type BrandLogoProps = {
  compact?: boolean;
};

export function BrandLogo({ compact = false }: BrandLogoProps) {
  return (
    <span className="flex items-center gap-2">
      <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-xl ring-1 ring-zinc-200">
        <Image
          src="/logo.png"
          alt="Briefings"
          fill
          sizes="36px"
          priority
          className="object-cover"
        />
      </span>

      {!compact ? (
        <span className="leading-tight">
          <span className="block text-sm font-semibold tracking-tight text-zinc-950">
            Briefings
          </span>
          <span className="hidden text-[11px] font-medium text-zinc-500 sm:block">
            Flight preparation
          </span>
        </span>
      ) : null}
    </span>
  );
}
