import type { TrustLabel } from "@/lib/types";

export function TrustBadge({ label }: { label: TrustLabel }) {
  const styles: Record<TrustLabel, string> = {
    "신뢰 가능": "bg-emerald-50 text-emerald-700 ring-emerald-200",
    보통: "bg-amber-50 text-amber-700 ring-amber-200",
    주의: "bg-rose-50 text-rose-700 ring-rose-200",
  };
  const dot: Record<TrustLabel, string> = {
    "신뢰 가능": "bg-emerald-500",
    보통: "bg-amber-500",
    주의: "bg-rose-500",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${styles[label]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot[label]}`} />
      {label}
    </span>
  );
}

export function SignalBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-700">
      {children}
    </span>
  );
}
