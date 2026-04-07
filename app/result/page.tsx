"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { AnalysisResult, TrustLabel } from "@/lib/types";
import { TrustGauge } from "@/components/TrustGauge";
import { ReviewCard } from "@/components/ReviewCard";
import { SummaryCard } from "@/components/SummaryCard";
import { AiDeepSection } from "@/components/AiDeepSection";

type FilterKey = "all" | TrustLabel;
type SortKey = "latest" | "suspicion" | "rating";

export default function ResultPage() {
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [sort, setSort] = useState<SortKey>("latest");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("goodreview:lastResult");
      if (raw) setResult(JSON.parse(raw));
    } catch {
      /* ignore */
    }
    setLoaded(true);
  }, []);

  const visibleReviews = useMemo(() => {
    if (!result) return [];
    let arr = result.reviews;
    if (filter !== "all") arr = arr.filter((r) => r.trustLabel === filter);
    const sorted = [...arr];
    if (sort === "latest") {
      sorted.sort((a, b) => {
        const ad = a.date ?? "";
        const bd = b.date ?? "";
        return ad < bd ? 1 : ad > bd ? -1 : 0;
      });
    } else if (sort === "suspicion") {
      sorted.sort((a, b) => b.suspicionScore - a.suspicionScore);
    } else if (sort === "rating") {
      sorted.sort((a, b) => b.rating - a.rating);
    }
    return sorted;
  }, [result, filter, sort]);

  if (!loaded) return <LoadingState />;
  if (!result) return <EmptyState />;

  const gradeStyle = gradeStyles[result.trustGrade];
  const trustworthyRatio =
    result.analyzedReviewCount > 0
      ? result.trustworthyCount / result.analyzedReviewCount
      : 0;
  const suspiciousRatio =
    result.analyzedReviewCount > 0
      ? result.suspiciousCount / result.analyzedReviewCount
      : 0;

  return (
    <main className="space-y-5">
      {/* 헤더 */}
      <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-gray-100 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-base font-semibold text-gray-900 sm:text-lg">
              {result.productTitle}
            </div>
            {result.sourceUrl && (
              <div className="mt-0.5 truncate text-[11px] text-gray-400 sm:text-xs">
                {result.sourceUrl}
              </div>
            )}
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-gray-500">
              <ScraperTag used={result.scraperUsed} />
              {result.wasSampled && (
                <span className="rounded-full bg-gray-100 px-2 py-0.5">
                  샘플링 적용 ({result.analyzedReviewCount}/{result.totalReviewCount})
                </span>
              )}
            </div>
          </div>
          <Link
            href="/"
            className="shrink-0 rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200"
          >
            새 분석
          </Link>
        </div>

        {result.fallbackUsed && (
          <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800 ring-1 ring-amber-100">
            <div className="font-semibold">실제 리뷰 수집에 실패해서 예시 데이터로 분석한 결과예요.</div>
            {result.collectionError && (
              <div className="mt-1 text-[11px] font-normal text-amber-700/80">
                사유: {result.collectionError}
              </div>
            )}
          </div>
        )}
        {result.collectionStatus === "scrapingbee" && (
          <div className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-xs leading-relaxed text-emerald-800 ring-1 ring-emerald-100">
            쿠팡에서 실제 리뷰를 수집해 분석한 결과예요.
          </div>
        )}
      </section>

      {/* 한 줄 요약 + 등급 */}
      <section
        className={`rounded-3xl p-5 shadow-sm ring-1 sm:p-6 ${gradeStyle.bg} ${gradeStyle.ring}`}
      >
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${gradeStyle.badge}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${gradeStyle.dot}`} />
            신뢰도 {result.trustGrade}
          </span>
          <span className="text-[11px] text-gray-500">
            총 {result.totalReviewCount}개 중 {result.analyzedReviewCount}개 리뷰를 살펴봤어요
          </span>
        </div>
        <p
          className={`mt-3 text-base font-semibold leading-relaxed sm:text-lg ${gradeStyle.text}`}
        >
          {result.aiSummary.headline}
        </p>
      </section>

      {/* 핵심 지표 */}
      <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-gray-100 sm:p-6">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <TrustGauge score={result.trustScore} />
          <div className="grid w-full grid-cols-2 gap-2.5 sm:w-auto sm:max-w-xs sm:gap-3">
            <Stat
              label="총 리뷰"
              value={`${result.totalReviewCount}`}
              tone="neutral"
            />
            <Stat
              label="신뢰 가능"
              value={`${Math.round(trustworthyRatio * 100)}%`}
              tone="good"
            />
            <Stat
              label="주의 필요"
              value={`${Math.round(suspiciousRatio * 100)}%`}
              tone="bad"
            />
            <Stat
              label="의심 신호"
              value={`${result.topSignals.length}종`}
              tone="neutral"
            />
          </div>
        </div>
      </section>

      {/* AI full analysis 모드일 땐 전용 섹션, 아니면 기존 요약/신호/대표리뷰 */}
      {result.aiDeepAnalysis ? (
        <AiDeepSection deep={result.aiDeepAnalysis} reviews={result.reviews} />
      ) : (
        <>
          {/* AI 요약 카드 */}
          <SummaryCard summary={result.aiSummary} />

          {/* TOP 신호 */}
          <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-gray-100 sm:p-6">
            <h2 className="text-sm font-semibold text-gray-900">
              자주 보인 의심 신호 TOP 3
            </h2>
            {result.topSignals.length === 0 ? (
              <p className="mt-2 text-sm text-gray-500">눈에 띄는 의심 신호가 없어요.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {result.topSignals.map((s, i) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2.5 text-sm"
                  >
                    <span className="flex items-center gap-2.5">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand-500 text-[11px] font-bold text-white">
                        {i + 1}
                      </span>
                      <span className="font-medium text-gray-800">{s.reason}</span>
                    </span>
                    <span className="text-xs font-medium text-gray-500">{s.count}건</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 대표 리뷰: 도움 / 주의 */}
          {(result.representativeTrust.length > 0 ||
            result.representativeSuspicious.length > 0) && (
            <section className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
                <div className="flex items-center gap-2">
                  <span className="text-base">👍</span>
                  <h2 className="text-sm font-semibold text-emerald-700">
                    대표 도움 리뷰
                  </h2>
                </div>
                {result.representativeTrust.length === 0 ? (
                  <p className="mt-2 text-xs text-gray-500">
                    구체적인 정보가 담긴 리뷰를 찾지 못했어요.
                  </p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {result.representativeTrust.slice(0, 3).map((r) => (
                      <li
                        key={r.id}
                        className="rounded-xl bg-emerald-50 px-3 py-2 text-xs leading-relaxed text-emerald-900"
                      >
                        {truncate(r.text, 120)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
                <div className="flex items-center gap-2">
                  <span className="text-base">⚠️</span>
                  <h2 className="text-sm font-semibold text-rose-700">
                    대표 주의 리뷰
                  </h2>
                </div>
                {result.representativeSuspicious.length === 0 ? (
                  <p className="mt-2 text-xs text-gray-500">
                    특별히 눈에 띄는 주의 리뷰가 없어요.
                  </p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {result.representativeSuspicious.slice(0, 3).map((r) => (
                      <li
                        key={r.id}
                        className="rounded-xl bg-rose-50 px-3 py-2 text-xs leading-relaxed text-rose-900"
                      >
                        {truncate(r.text, 120)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          )}
        </>
      )}

      {/* 리뷰 목록 + 필터/정렬 */}
      <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-gray-100 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-sm font-semibold text-gray-900">
            리뷰 목록 <span className="text-gray-400">({visibleReviews.length})</span>
          </h2>
          <div className="flex items-center gap-2">
            <label className="sr-only" htmlFor="sort">정렬</label>
            <select
              id="sort"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            >
              <option value="latest">최신순</option>
              <option value="suspicion">의심 점수 높은 순</option>
              <option value="rating">평점 높은 순</option>
            </select>
          </div>
        </div>

        {/* 필터 칩 */}
        <div className="-mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {(["all", "신뢰 가능", "보통", "주의"] as const).map((k) => {
            const count =
              k === "all"
                ? result.reviews.length
                : result.reviews.filter((r) => r.trustLabel === k).length;
            const active = filter === k;
            return (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition ${
                  active
                    ? "bg-brand-500 text-white ring-brand-500"
                    : "bg-white text-gray-700 ring-gray-200 hover:bg-gray-50"
                }`}
              >
                {k === "all" ? "전체" : k}
                <span className={`ml-1 ${active ? "text-brand-100" : "text-gray-400"}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-4 grid gap-3">
          {visibleReviews.length === 0 ? (
            <p className="rounded-xl bg-gray-50 px-3 py-8 text-center text-xs text-gray-500">
              해당 조건의 리뷰가 없어요.
            </p>
          ) : (
            visibleReviews.map((r) => <ReviewCard key={r.id} review={r} />)
          )}
        </div>
      </section>

      <div className="rounded-2xl bg-gray-50 px-4 py-3 text-[11px] leading-relaxed text-gray-500 ring-1 ring-gray-100">
        {result.disclaimer}
      </div>
    </main>
  );
}

function ScraperTag({ used }: { used: string }) {
  const label =
    used === "text"
      ? "직접 붙여넣기"
      : used === "scrapingbee"
        ? "쿠팡 실제 수집"
        : used === "fetch"
          ? "실제 수집"
          : used === "mock"
            ? "예시 데이터"
            : used;
  const tone =
    used === "scrapingbee" || used === "fetch"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
      : used === "text"
        ? "bg-brand-50 text-brand-700 ring-brand-100"
        : "bg-amber-50 text-amber-700 ring-amber-100";
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${tone}`}>
      출처: {label}
    </span>
  );
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}

const gradeStyles: Record<
  AnalysisResult["trustGrade"],
  { bg: string; ring: string; badge: string; dot: string; text: string }
> = {
  좋음: {
    bg: "bg-emerald-50",
    ring: "ring-emerald-100",
    badge: "bg-white text-emerald-700 ring-1 ring-emerald-200",
    dot: "bg-emerald-500",
    text: "text-emerald-900",
  },
  보통: {
    bg: "bg-amber-50",
    ring: "ring-amber-100",
    badge: "bg-white text-amber-700 ring-1 ring-amber-200",
    dot: "bg-amber-500",
    text: "text-amber-900",
  },
  주의: {
    bg: "bg-rose-50",
    ring: "ring-rose-100",
    badge: "bg-white text-rose-700 ring-1 ring-rose-200",
    dot: "bg-rose-500",
    text: "text-rose-900",
  },
};

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "good" | "bad" | "neutral";
}) {
  const color =
    tone === "good"
      ? "text-emerald-600"
      : tone === "bad"
        ? "text-rose-600"
        : "text-gray-900";
  return (
    <div className="rounded-xl bg-gray-50 px-3 py-2.5">
      <div className="text-[11px] font-medium text-gray-500">{label}</div>
      <div className={`mt-0.5 text-lg font-bold ${color}`}>{value}</div>
    </div>
  );
}

function LoadingState() {
  return (
    <main className="rounded-3xl bg-white p-10 text-center shadow-sm ring-1 ring-gray-100">
      <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      <p className="mt-3 text-sm text-gray-600">결과를 불러오고 있어요...</p>
    </main>
  );
}

function EmptyState() {
  return (
    <main className="rounded-3xl bg-white p-10 text-center shadow-sm ring-1 ring-gray-100">
      <h2 className="text-base font-semibold text-gray-900">보여드릴 결과가 없어요</h2>
      <p className="mt-1 text-sm text-gray-500">
        먼저 상품 링크를 입력해 분석을 시작해 주세요.
      </p>
      <Link
        href="/"
        className="mt-4 inline-block rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600"
      >
        분석 시작하기
      </Link>
    </main>
  );
}
