// 카테고리별 cap + 양의 신호 차감 + 다양성 보너스 기반 점수 계산.

import {
  CATEGORY_CAPS,
  DIVERSITY_BONUS_PER_EXTRA_CATEGORY,
  POSITIVE_CAP,
  SUSPICION_THRESHOLDS,
} from "@/lib/config";
import type { SignalCategory, SignalResult, TrustLabel } from "@/lib/types";

export interface ScoringInput {
  signals: SignalResult[];
  similarCount: number; // dedupe 단계에서 미리 계산해 주입
}

export interface ScoringOutput {
  suspicionScore: number;
  trustLabel: TrustLabel;
  suspicionReasons: string[];
  positiveSignals: string[];
}

export function scoreReview(input: ScoringInput): ScoringOutput {
  const negative = input.signals.filter((s) => !s.positive);
  const positive = input.signals.filter((s) => s.positive);

  // 카테고리별 가중치 누적 (cap 적용)
  const byCat: Partial<Record<SignalCategory, number>> = {};
  for (const s of negative) {
    byCat[s.category] = (byCat[s.category] ?? 0) + s.weight;
  }
  let negativeTotal = 0;
  const activeCategories = new Set<SignalCategory>();
  for (const [cat, raw] of Object.entries(byCat) as [SignalCategory, number][]) {
    if (cat === "specificity") continue; // 음수쪽에는 specificity 없음
    const cap = CATEGORY_CAPS[cat as keyof typeof CATEGORY_CAPS] ?? 20;
    const capped = Math.min(cap, raw);
    if (capped > 0) {
      negativeTotal += capped;
      activeCategories.add(cat);
    }
  }

  // 카테고리 다양성 보너스
  if (activeCategories.size >= 2) {
    negativeTotal += (activeCategories.size - 1) * DIVERSITY_BONUS_PER_EXTRA_CATEGORY;
  }

  // 중복 페널티 (dedupe 결과 활용)
  if (input.similarCount > 0) {
    // 비슷한 리뷰가 있으면 duplication 카테고리에 가산
    const dupBonus = Math.min(CATEGORY_CAPS.duplication, 18 + input.similarCount * 4);
    negativeTotal += dupBonus;
  }

  // 양의 신호 차감
  let positiveTotal = 0;
  for (const s of positive) positiveTotal += s.weight;
  positiveTotal = Math.min(POSITIVE_CAP, positiveTotal);

  const raw = negativeTotal - positiveTotal;
  const suspicionScore = Math.max(0, Math.min(100, Math.round(raw)));

  const trustLabel: TrustLabel =
    suspicionScore >= SUSPICION_THRESHOLDS.middle
      ? "주의"
      : suspicionScore >= SUSPICION_THRESHOLDS.trustworthy
        ? "보통"
        : "신뢰 가능";

  return {
    suspicionScore,
    trustLabel,
    suspicionReasons: negative.map((s) => s.reason),
    positiveSignals: positive.map((s) => s.reason),
  };
}
