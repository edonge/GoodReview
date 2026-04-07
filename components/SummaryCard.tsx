import type { AiSummary } from "@/lib/types";

export function SummaryCard({ summary }: { summary: AiSummary }) {
  return (
    <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-gray-100 sm:p-6">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-base">✨</span>
          <h2 className="text-sm font-semibold text-gray-900">AI 요약</h2>
        </div>
        <SourceTag source={summary.source} />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Block
          title="좋은 점"
          items={summary.pros}
          emptyText="눈에 띄는 장점을 찾지 못했어요."
          tone="good"
        />
        <Block
          title="아쉬운 점"
          items={summary.cons}
          emptyText="구체적인 단점 언급을 찾기 어려웠어요."
          tone="warn"
        />
      </div>

      {summary.caution.length > 0 && (
        <div className="mt-3 rounded-2xl bg-rose-50 px-4 py-3 ring-1 ring-rose-100">
          <div className="text-xs font-semibold text-rose-700">주의할 점</div>
          <ul className="mt-1.5 space-y-1 text-xs leading-relaxed text-rose-900">
            {summary.caution.map((c, i) => (
              <li key={i}>• {c}</li>
            ))}
          </ul>
        </div>
      )}

      {summary.summaryNote && (
        <p className="mt-3 text-[11px] leading-relaxed text-gray-400">
          {summary.summaryNote}
        </p>
      )}
    </section>
  );
}

function Block({
  title,
  items,
  emptyText,
  tone,
}: {
  title: string;
  items: string[];
  emptyText: string;
  tone: "good" | "warn";
}) {
  const styles =
    tone === "good"
      ? { head: "text-emerald-700", bg: "bg-emerald-50", text: "text-emerald-900" }
      : { head: "text-amber-700", bg: "bg-amber-50", text: "text-amber-900" };
  return (
    <div>
      <div className={`text-xs font-semibold ${styles.head}`}>{title}</div>
      {items.length === 0 ? (
        <p className="mt-1.5 text-xs text-gray-500">{emptyText}</p>
      ) : (
        <ul className="mt-1.5 space-y-1.5">
          {items.map((it, i) => (
            <li
              key={i}
              className={`rounded-xl px-3 py-2 text-xs leading-relaxed ${styles.bg} ${styles.text}`}
            >
              {it}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SourceTag({ source }: { source: "openai" | "mock" }) {
  const label = source === "openai" ? "OpenAI" : "기본 요약기";
  const cls =
    source === "openai"
      ? "bg-brand-50 text-brand-700 ring-brand-100"
      : "bg-gray-100 text-gray-600 ring-gray-200";
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${cls}`}
    >
      {label}
    </span>
  );
}
