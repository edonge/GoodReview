"use client";

// AI full analysis 결과 전용 섹션들.
// - overall pros/cons/cautions
// - ⚠️ 의심 리뷰 모음 (리뷰별 플래그 + 원문 하이라이트)
// - 🔗 중복/템플릿 클러스터
// - ✅ 진짜 경험 같은 리뷰 모음
//
// 원문에서 AI가 인용한 quote를 <mark>로 하이라이트한다.
// quote가 원문과 정확히 일치하지 않을 수 있으므로 아래 loose matching을 씀:
//   1) 정확 substring match 시도
//   2) 실패 시 quote의 앞 부분 (토큰 단위 fingerprint) 으로 부분 일치
//   3) 그래도 실패 시 하이라이트 없이 원문만

import type {
  AiCrossReview,
  AiDeepAnalysis,
  AiFlag,
  AiReviewAnalysis,
  AnalyzedReview,
} from "@/lib/types";

interface Props {
  deep: AiDeepAnalysis;
  reviews: AnalyzedReview[];
}

export function AiDeepSection({ deep, reviews }: Props) {
  const reviewById = new Map(reviews.map((r) => [r.id, r]));
  const suspicious = deep.reviews.filter((r) => r.verdict === "suspicious");
  const trustworthy = deep.reviews.filter((r) => r.verdict === "trustworthy");

  return (
    <div className="space-y-5">
      {/* Overall pros / cons / cautions */}
      <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-gray-100 sm:p-6">
        <h2 className="text-sm font-semibold text-gray-900">AI 해석 한눈에 보기</h2>
        <p className="mt-1 text-xs text-gray-500">
          리뷰 {deep.reviews.length}개를 한 건씩 읽고 해석한 결과예요
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <OverallBlock
            emoji="👍"
            title="장점"
            tone="emerald"
            items={deep.pros}
            emptyText="공통 장점을 찾지 못했어요."
          />
          <OverallBlock
            emoji="🔻"
            title="단점"
            tone="slate"
            items={deep.cons}
            emptyText="리뷰에서 언급된 단점이 거의 없어요."
          />
          <OverallBlock
            emoji="⚠️"
            title="주의 포인트"
            tone="amber"
            items={deep.cautions}
            emptyText="특별한 주의 정황이 보이지 않아요."
          />
        </div>
      </section>

      {/* Cross review — 중복/템플릿 클러스터 */}
      {deep.crossReview.length > 0 && (
        <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-gray-100 sm:p-6">
          <div className="flex items-center gap-2">
            <span className="text-base">🔗</span>
            <h2 className="text-sm font-semibold text-rose-700">
              중복 · 동일 템플릿 의심 묶음
            </h2>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            여러 리뷰에서 같은 문구가 반복되거나, 서로 거의 똑같은 글이 발견됐어요
          </p>
          <ul className="mt-4 space-y-4">
            {deep.crossReview.map((cr, i) => (
              <CrossReviewBlock key={i} cross={cr} reviewById={reviewById} />
            ))}
          </ul>
        </section>
      )}

      {/* 의심 리뷰 */}
      <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-gray-100 sm:p-6">
        <div className="flex items-center gap-2">
          <span className="text-base">⚠️</span>
          <h2 className="text-sm font-semibold text-rose-700">이런 리뷰들이 걸려요</h2>
          <span className="ml-1 text-[11px] text-gray-400">
            ({suspicious.length}건)
          </span>
        </div>
        {suspicious.length === 0 ? (
          <div className="mt-3 rounded-2xl bg-emerald-50 px-4 py-4 text-sm text-emerald-800 ring-1 ring-emerald-100">
            의심 신호가 없네요! 꽤나 괜찮은 상품인 거 같아요 🎉
          </div>
        ) : (
          <ul className="mt-3 space-y-3">
            {suspicious.map((ai) => (
              <AiReviewBlock
                key={ai.id}
                ai={ai}
                raw={reviewById.get(ai.id)}
                tone="rose"
              />
            ))}
          </ul>
        )}
      </section>

      {/* 진정성 리뷰 */}
      {trustworthy.length > 0 && (
        <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-gray-100 sm:p-6">
          <div className="flex items-center gap-2">
            <span className="text-base">✅</span>
            <h2 className="text-sm font-semibold text-emerald-700">
              진짜 경험 같아요
            </h2>
            <span className="ml-1 text-[11px] text-gray-400">
              ({trustworthy.length}건)
            </span>
          </div>
          <ul className="mt-3 space-y-3">
            {trustworthy.map((ai) => (
              <AiReviewBlock
                key={ai.id}
                ai={ai}
                raw={reviewById.get(ai.id)}
                tone="emerald"
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// ── 서브 컴포넌트 ─────────────────────────────

function OverallBlock({
  emoji,
  title,
  tone,
  items,
  emptyText,
}: {
  emoji: string;
  title: string;
  tone: "emerald" | "slate" | "amber";
  items: string[];
  emptyText: string;
}) {
  const colors = {
    emerald: "bg-emerald-50 text-emerald-900 ring-emerald-100",
    slate: "bg-slate-50 text-slate-800 ring-slate-100",
    amber: "bg-amber-50 text-amber-900 ring-amber-100",
  }[tone];
  return (
    <div className={`rounded-2xl px-4 py-3 ring-1 ${colors}`}>
      <div className="flex items-center gap-1.5 text-xs font-semibold">
        <span>{emoji}</span>
        <span>{title}</span>
      </div>
      {items.length === 0 ? (
        <p className="mt-2 text-[11px] text-gray-500">{emptyText}</p>
      ) : (
        <ul className="mt-2 space-y-1 text-[12px] leading-relaxed">
          {items.map((it, i) => (
            <li key={i} className="flex gap-1.5">
              <span className="shrink-0">·</span>
              <span>{it}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AiReviewBlock({
  ai,
  raw,
  tone,
}: {
  ai: AiReviewAnalysis;
  raw: AnalyzedReview | undefined;
  tone: "rose" | "emerald";
}) {
  const borderColor = tone === "rose" ? "ring-rose-100" : "ring-emerald-100";
  const bgColor = tone === "rose" ? "bg-rose-50/30" : "bg-emerald-50/30";
  const headlineColor = tone === "rose" ? "text-rose-700" : "text-emerald-700";
  const flags = tone === "rose" ? ai.suspiciousFlags : ai.trustSignals;

  // 모든 quote를 모아서 원문 하이라이트용 배열로 만든다.
  const quotes = flags.map((f) => f.quote).filter(Boolean);

  return (
    <li className={`rounded-2xl bg-white px-4 py-3 ring-1 ${borderColor}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-5 items-center rounded-full bg-gray-100 px-2 text-[10px] font-medium text-gray-600">
              ★ {raw?.rating ?? "?"}
            </span>
            <span className="text-[11px] text-gray-400">#{ai.id}</span>
            {typeof ai.confidence === "number" && (
              <span className="text-[10px] text-gray-400">
                확신도 {ai.confidence}
              </span>
            )}
          </div>
          <p className={`mt-1.5 text-sm font-semibold leading-snug ${headlineColor}`}>
            {ai.oneLiner || "(한 줄 총평 없음)"}
          </p>
        </div>
      </div>

      {/* 플래그 뱃지 + why */}
      {flags.length > 0 && (
        <ul className="mt-3 space-y-2">
          {flags.map((f, i) => (
            <FlagItem key={i} flag={f} tone={tone} />
          ))}
        </ul>
      )}

      {/* 원문 (하이라이트 적용) */}
      {raw?.text && (
        <details className={`mt-3 rounded-xl ${bgColor} px-3 py-2 text-[12px] leading-relaxed text-gray-700`}>
          <summary className="cursor-pointer text-[11px] font-medium text-gray-500 hover:text-gray-700">
            원문 보기
          </summary>
          <div className="mt-2 whitespace-pre-wrap">
            <HighlightedText text={raw.text} quotes={quotes} tone={tone} />
          </div>
        </details>
      )}
    </li>
  );
}

function FlagItem({
  flag,
  tone,
}: {
  flag: AiFlag;
  tone: "rose" | "emerald";
}) {
  const badgeColor =
    tone === "rose"
      ? "bg-rose-100 text-rose-800"
      : "bg-emerald-100 text-emerald-800";
  const quoteColor =
    tone === "rose"
      ? "border-rose-200 bg-rose-50 text-rose-900"
      : "border-emerald-200 bg-emerald-50 text-emerald-900";
  return (
    <li className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${badgeColor}`}
        >
          {flag.label}
        </span>
        <span className="text-[12px] text-gray-700">{flag.why}</span>
      </div>
      {flag.quote && (
        <blockquote
          className={`ml-1 border-l-2 ${quoteColor} px-2 py-1 text-[11px] italic leading-relaxed`}
        >
          “{truncate(flag.quote, 120)}”
        </blockquote>
      )}
    </li>
  );
}

function CrossReviewBlock({
  cross,
  reviewById,
}: {
  cross: AiCrossReview;
  reviewById: Map<string, AnalyzedReview>;
}) {
  const typeLabel =
    cross.type === "near_duplicate"
      ? "거의 동일한 리뷰"
      : cross.type === "shared_template"
        ? "동일 템플릿 사용 의심"
        : "캠페인/체험단 클러스터";
  return (
    <li className="rounded-2xl bg-rose-50/50 px-4 py-3 ring-1 ring-rose-100">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center rounded-full bg-rose-200 px-2 py-0.5 text-[10px] font-semibold text-rose-900">
          {typeLabel}
        </span>
        <span className="text-[11px] text-gray-600">
          연관 리뷰: {cross.reviewIds.map((id) => `#${id}`).join(", ")}
        </span>
      </div>
      <p className="mt-2 text-[12px] leading-relaxed text-rose-900">{cross.reason}</p>
      {cross.sharedPhrases.length > 0 && (
        <div className="mt-2">
          <div className="text-[10px] font-semibold text-rose-700">공통 문구</div>
          <ul className="mt-1 space-y-1">
            {cross.sharedPhrases.slice(0, 5).map((p, i) => (
              <li
                key={i}
                className="rounded-md bg-white px-2 py-1 text-[11px] italic text-rose-900 ring-1 ring-rose-100"
              >
                “{truncate(p, 120)}”
              </li>
            ))}
          </ul>
        </div>
      )}
      {/* 해당 리뷰들 원문 요약 */}
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {cross.reviewIds
          .map((id) => reviewById.get(id))
          .filter((r): r is AnalyzedReview => !!r)
          .map((r) => (
            <div
              key={r.id}
              className="rounded-xl bg-white px-3 py-2 text-[11px] leading-relaxed text-gray-700 ring-1 ring-rose-100"
            >
              <div className="mb-1 text-[10px] font-medium text-rose-600">#{r.id}</div>
              <HighlightedText
                text={truncate(r.text, 280)}
                quotes={cross.sharedPhrases}
                tone="rose"
              />
            </div>
          ))}
      </div>
    </li>
  );
}

// ── 하이라이트 로직 ─────────────────────────

function HighlightedText({
  text,
  quotes,
  tone,
}: {
  text: string;
  quotes: string[];
  tone: "rose" | "emerald";
}) {
  const hits = findHighlightRanges(text, quotes);
  if (hits.length === 0) return <>{text}</>;

  const markClass =
    tone === "rose"
      ? "rounded bg-rose-200 px-0.5 text-rose-900"
      : "rounded bg-emerald-200 px-0.5 text-emerald-900";

  const parts: React.ReactNode[] = [];
  let cursor = 0;
  hits.forEach(([start, end], i) => {
    if (start > cursor) parts.push(text.slice(cursor, start));
    parts.push(
      <mark key={i} className={markClass}>
        {text.slice(start, end)}
      </mark>,
    );
    cursor = end;
  });
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
}

// 원문에서 quote들의 위치를 찾는다.
// 1) 정확 substring
// 2) 실패 시 quote의 앞 20자로 부분 일치 (AI가 약간 다듬었을 경우 대비)
// 겹치는 range는 병합.
function findHighlightRanges(text: string, quotes: string[]): [number, number][] {
  const ranges: [number, number][] = [];
  const seenStarts = new Set<number>();

  for (const q of quotes) {
    const trimmed = q.trim();
    if (!trimmed || trimmed.length < 4) continue;

    // 1) 정확 일치
    let idx = text.indexOf(trimmed);
    if (idx === -1) {
      // 2) 앞 20자로 fuzzy
      const head = trimmed.slice(0, 20);
      if (head.length >= 4) {
        idx = text.indexOf(head);
        if (idx !== -1) {
          // 앞 20자 match 시 길이는 quote 길이 또는 원문 남은 길이 중 작은 것
          const end = Math.min(text.length, idx + trimmed.length);
          if (!seenStarts.has(idx)) {
            ranges.push([idx, end]);
            seenStarts.add(idx);
          }
          continue;
        }
      }
    } else {
      if (!seenStarts.has(idx)) {
        ranges.push([idx, idx + trimmed.length]);
        seenStarts.add(idx);
      }
    }
  }

  // 정렬 + 겹침 병합
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [s, e] of ranges) {
    if (merged.length === 0 || s > merged[merged.length - 1][1]) {
      merged.push([s, e]);
    } else {
      merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], e);
    }
  }
  return merged;
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}
