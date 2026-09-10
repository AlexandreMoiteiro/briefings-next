import Link from "next/link";

export function AdminC152IndexLink() {
  return (
    <Link
      href="/admin/c152-performance"
      className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-800 transition hover:bg-sky-100"
    >
      C152 PDF mapper
    </Link>
  );
}
