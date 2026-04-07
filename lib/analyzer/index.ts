// 분석 파이프라인 orchestrator.
// 1) (옵션) 샘플링
// 2) 중복 탐지
// 3) 리뷰별 신호 → 점수 → 라벨
// 4) 집계 (count, top signals, 대표 리뷰)
// 5) AI 요약

import {
  AI_FULL_ANALYSIS_MAX_REVIEWS,
  TRUST_GRADE_THRESHOLDS,
  USE_OPENAI,
  SUMMARY_REPRESENTATIVE_COUNT,
} from "@/lib/config";
import { runIntrinsicSignals } from "./signals";
import { analyzeReviewsDeepWithAI } from "./aiAnalyzer";
import { detectDuplicates } from "@/lib/scoring/dedupe";
import { maybeSample } from "@/lib/scoring/sampling";
import { scoreReview } from "@/lib/scoring";
import { generateSummary } from "@/lib/summary";
import type {
  AiDeepAnalysis,
  AiSummary,
  AnalysisResult,
  AnalyzedReview,
  CollectionStatus,
  RawReview,
  SignalCategory,
  SignalSummary,
  TrustLabel,
} from "@/lib/types";

export interface AnalyzeContext {
  productTitle: string;
  sourceUrl: string;
  scraperUsed: string;
  fallbackUsed: boolean;
  collectionStatus: CollectionStatus;
  collectionError?: string;
}

export async function analyzeReviews(
  rawReviews: RawReview[],
  ctx: AnalyzeContext,
): Promise<AnalysisResult> {
  const totalReviewCount = rawReviews.length;

  // ───────── AI full analysis 경로 ─────────
  // 리뷰 수가 적고 OpenAI가 활성이면 규칙 기반 대신 AI에 통째로 해석 맡김.
  // 실패 시 규칙 기반으로 떨어짐.
  if (
    USE_OPENAI &&
    rawReviews.length > 0 &&
    rawReviews.length <= AI_FULL_ANALYSIS_MAX_REVIEWS
  ) {
    try {
      console.log(
        `[analyzer] AI full analysis 모드 (리뷰=${rawReviews.length} <= ${AI_FULL_ANALYSIS_MAX_REVIEWS})`,
      );
      return await runAiFullAnalysis(rawReviews, ctx);
    } catch (err) {
      console.warn(
        `[analyzer] AI full analysis 실패 → 규칙 기반 fallback: ${(err as Error).message}`,
      );
    }
  }

  // 1) 샘플링
  const { reviews: sampled, wasSampled } = maybeSample(rawReviews);
  const analyzedReviewCount = sampled.length;

  // 2) 중복 탐지 (샘플링 후)
  const dedupe = detectDuplicates(sampled);

  // 3) 리뷰별 분석
  const allSignals: { id: string; reason: string; category: SignalCategory }[] = [];
  const analyzed: AnalyzedReview[] = sampled.map((r) => {
    const signals = runIntrinsicSignals(r, { productTitle: ctx.productTitle });
    const similarCount = dedupe.similarCountByReviewId.get(r.id) ?? 0;
    const score = scoreReview({ signals, similarCount });

    // 집계용 (negative만)
    for (const s of signals) {
      if (!s.positive) {
        allSignals.push({ id: s.id, reason: s.reason, category: s.category });
      }
    }
    if (similarCount > 0) {
      allSignals.push({
        id: "duplicate_cluster",
        reason: "비슷한 리뷰가 여러 건 보여요",
        category: "duplication",
      });
    }

    return {
      ...r,
      suspicionScore: score.suspicionScore,
      trustLabel: score.trustLabel,
      suspicionReasons: score.suspicionReasons,
      positiveSignals: score.positiveSignals,
      signalIds: signals.map((s) => s.id),
      similarCount,
      clusterId: dedupe.clusterIdByReviewId.get(r.id) ?? null,
    };
  });

  // 4) 집계
  const trustworthyCount = analyzed.filter((r) => r.trustLabel === "신뢰 가능").length;
  const middleCount = analyzed.filter((r) => r.trustLabel === "보통").length;
  const suspiciousCount = analyzed.filter((r) => r.trustLabel === "주의").length;

  const avgSuspicion =
    analyzed.length === 0
      ? 0
      : analyzed.reduce((acc, r) => acc + r.suspicionScore, 0) / analyzed.length;
  const trustScore = Math.max(0, Math.min(100, Math.round(100 - avgSuspicion)));

  const trustGrade: AnalysisResult["trustGrade"] =
    trustScore >= TRUST_GRADE_THRESHOLDS.good
      ? "좋음"
      : trustScore >= TRUST_GRADE_THRESHOLDS.middle
        ? "보통"
        : "주의";

  // top signals (id별 카운트)
  const counter = new Map<string, SignalSummary>();
  for (const s of allSignals) {
    const cur = counter.get(s.id);
    if (cur) cur.count += 1;
    else counter.set(s.id, { id: s.id, reason: s.reason, category: s.category, count: 1 });
  }
  const topSignals = [...counter.values()].sort((a, b) => b.count - a.count).slice(0, 3);

  // 대표 리뷰
  const representativeTrust = analyzed
    .filter((r) => r.trustLabel === "신뢰 가능" && r.text.length >= 30)
    .sort((a, b) => b.positiveSignals.length - a.positiveSignals.length || b.text.length - a.text.length)
    .slice(0, SUMMARY_REPRESENTATIVE_COUNT.trust);

  const representativeSuspicious = analyzed
    .filter((r) => r.trustLabel === "주의")
    .sort((a, b) => b.suspicionScore - a.suspicionScore)
    .slice(0, SUMMARY_REPRESENTATIVE_COUNT.suspicious);

  // 5) AI 요약
  const aiSummary = await generateSummary({
    productTitle: ctx.productTitle,
    totalReviewCount,
    analyzedReviewCount,
    trustScore,
    trustGrade,
    trustworthyCount,
    middleCount,
    suspiciousCount,
    topSignals,
    trustSamples: representativeTrust,
    suspiciousSamples: representativeSuspicious,
  });

  return {
    productTitle: ctx.productTitle,
    sourceUrl: ctx.sourceUrl,
    scraperUsed: ctx.scraperUsed,
    fallbackUsed: ctx.fallbackUsed,
    collectionStatus: ctx.collectionStatus,
    collectionError: ctx.collectionError,
    totalReviewCount,
    analyzedReviewCount,
    wasSampled,
    trustScore,
    trustGrade,
    trustworthyCount,
    middleCount,
    suspiciousCount,
    topSignals,
    representativeTrust,
    representativeSuspicious,
    reviews: analyzed,
    aiSummary,
    disclaimer:
      "이 결과는 광고 여부를 확정 판정하지 않으며, 텍스트 패턴 기반의 참고용 분석이에요.",
  };
}

// ──────────────────────────────────────────────────────────
// AI full analysis 경로
//
// AI가 돌려준 per-review verdict / overall 을 AnalysisResult 형태로 매핑한다.
// 기존 결과 페이지 구성과 호환되도록 scoredReviews 등 기존 필드도 모두 채우고,
// 추가로 aiDeepAnalysis 를 붙여서 결과 페이지가 rich UI를 그릴 수 있게 한다.
// ──────────────────────────────────────────────────────────

async function runAiFullAnalysis(
  rawReviews: RawReview[],
  ctx: AnalyzeContext,
): Promise<AnalysisResult> {
  const totalReviewCount = rawReviews.length;
  const analyzedReviewCount = rawReviews.length;

  const { deep } = await analyzeReviewsDeepWithAI({
    productTitle: ctx.productTitle,
    reviews: rawReviews,
  });

  // AI가 준 verdict가 없거나 id 매칭 실패하면 neutral로 간주한다.
  const verdictById = new Map(deep.reviews.map((r) => [r.id, r]));

  // ─── trustScore 결정론적 재계산 ───
  // AI가 돌려준 trustScore는 편향(대체로 관대)이 심해서 무시하고,
  // verdict 분포 + crossReview 수로 우리가 직접 산정한다.
  //
  //   base = 100
  //     - suspicious 수 × 12
  //     - crossReview(중복/템플릿 클러스터) 수 × 10
  //     + trustworthy 수 × 2 (최대 +15)
  //
  // 예상:
  //   suspicious 0, trust 7 → 100 (clamp) "좋음"
  //   suspicious 2 → 76              "좋음"
  //   suspicious 4 + cluster 1 → 52  "보통"
  //   suspicious 6 + cluster 1 → 28  "주의"
  const susCount = deep.reviews.filter((r) => r.verdict === "suspicious").length;
  const trustCount = deep.reviews.filter((r) => r.verdict === "trustworthy").length;
  const clusterCount = deep.crossReview.length;
  const trustBonus = Math.min(15, trustCount * 2);
  const rawScore = 100 - susCount * 12 - clusterCount * 10 + trustBonus;
  const trustScore = Math.max(0, Math.min(100, Math.round(rawScore)));

  // trustGrade도 우리가 점수 기준으로 재산정
  const aiGrade: "good" | "middle" | "caution" =
    trustScore >= 75 ? "good" : trustScore >= 50 ? "middle" : "caution";
  console.log(
    `[analyzer] AI verdict 분포: suspicious=${susCount} trust=${trustCount} cluster=${clusterCount} → trustScore=${trustScore}`,
  );

  const verdictToTrustLabel = (v: "suspicious" | "neutral" | "trustworthy"): TrustLabel => {
    if (v === "suspicious") return "주의";
    if (v === "trustworthy") return "신뢰 가능";
    return "보통";
  };
  const verdictToSuspicionScore = (
    v: "suspicious" | "neutral" | "trustworthy",
    confidence: number,
  ): number => {
    // suspicious일수록 점수 높게 (0~100, 높을수록 의심).
    if (v === "suspicious") return Math.max(60, Math.min(95, 50 + confidence / 2));
    if (v === "trustworthy") return Math.max(5, Math.min(25, 30 - confidence / 4));
    return 45;
  };

  const analyzed: AnalyzedReview[] = rawReviews.map((r) => {
    const ai = verdictById.get(r.id);
    if (!ai) {
      return {
        ...r,
        suspicionScore: 45,
        trustLabel: "보통",
        suspicionReasons: [],
        positiveSignals: [],
        signalIds: [],
        similarCount: 0,
        clusterId: null,
      };
    }
    return {
      ...r,
      suspicionScore: Math.round(verdictToSuspicionScore(ai.verdict, ai.confidence)),
      trustLabel: verdictToTrustLabel(ai.verdict),
      suspicionReasons: ai.suspiciousFlags.map((f) => f.why).slice(0, 5),
      positiveSignals: ai.trustSignals.map((f) => f.why).slice(0, 5),
      signalIds: [
        ...ai.suspiciousFlags.map((f) => `ai:${f.label}`),
        ...ai.trustSignals.map((f) => `ai+:${f.label}`),
      ],
      similarCount: 0, // crossReview가 따로 있음
      clusterId: null,
    };
  });

  const trustworthyCount = analyzed.filter((r) => r.trustLabel === "신뢰 가능").length;
  const middleCount = analyzed.filter((r) => r.trustLabel === "보통").length;
  const suspiciousCount = analyzed.filter((r) => r.trustLabel === "주의").length;

  const trustGrade: AnalysisResult["trustGrade"] =
    aiGrade === "good" ? "좋음" : aiGrade === "caution" ? "주의" : "보통";

  // top signals: AI 플래그 label별 집계
  const counter = new Map<string, SignalSummary>();
  for (const ai of deep.reviews) {
    for (const f of ai.suspiciousFlags) {
      const id = `ai:${f.label}`;
      const cur = counter.get(id);
      if (cur) cur.count += 1;
      else
        counter.set(id, {
          id,
          reason: f.label,
          category: "lexical" as SignalCategory,
          count: 1,
        });
    }
  }
  // crossReview는 duplication 카테고리로 집계에 포함
  for (const cr of deep.crossReview) {
    const id = `ai:${cr.type}`;
    const cur = counter.get(id);
    const label =
      cr.type === "near_duplicate"
        ? "거의 동일한 리뷰 발견"
        : cr.type === "shared_template"
          ? "동일 템플릿 사용 의심"
          : "캠페인/체험단 클러스터 의심";
    if (cur) cur.count += cr.reviewIds.length;
    else
      counter.set(id, {
        id,
        reason: label,
        category: "duplication" as SignalCategory,
        count: cr.reviewIds.length,
      });
  }
  const topSignals = [...counter.values()].sort((a, b) => b.count - a.count).slice(0, 3);

  const representativeTrust = analyzed
    .filter((r) => r.trustLabel === "신뢰 가능")
    .slice(0, SUMMARY_REPRESENTATIVE_COUNT.trust);
  const representativeSuspicious = analyzed
    .filter((r) => r.trustLabel === "주의")
    .slice(0, SUMMARY_REPRESENTATIVE_COUNT.suspicious);

  // aiSummary도 deep 결과에서 바로 만듦 (generateSummary 재호출 안 함 — 토큰 절약)
  const aiSummary: AiSummary = {
    headline: deep.headline,
    pros: deep.pros,
    cons: deep.cons,
    caution: deep.cautions,
    summaryNote:
      "이 결과는 광고 여부를 확정 판정하지 않으며, 텍스트 패턴 기반의 참고용 분석이에요.",
    source: "openai",
  };

  return {
    productTitle: ctx.productTitle,
    sourceUrl: ctx.sourceUrl,
    scraperUsed: ctx.scraperUsed,
    fallbackUsed: ctx.fallbackUsed,
    collectionStatus: ctx.collectionStatus,
    collectionError: ctx.collectionError,
    totalReviewCount,
    analyzedReviewCount,
    wasSampled: false,
    trustScore,
    trustGrade,
    trustworthyCount,
    middleCount,
    suspiciousCount,
    topSignals,
    representativeTrust,
    representativeSuspicious,
    reviews: analyzed,
    aiSummary,
    aiDeepAnalysis: deep satisfies AiDeepAnalysis,
    disclaimer:
      "이 결과는 광고 여부를 확정 판정하지 않으며, 텍스트 패턴 기반의 참고용 분석이에요.",
  };
}
