// Summary service 입력 페이로드.
// LLM에 던질 정보만 엄선해서 담는다 (전체 리뷰 X).

import type { AiSummary, AnalyzedReview, SignalSummary } from "@/lib/types";

export interface SummaryInput {
  productTitle: string;
  totalReviewCount: number;
  analyzedReviewCount: number;
  trustScore: number;
  trustGrade: "좋음" | "보통" | "주의";
  trustworthyCount: number;
  middleCount: number;
  suspiciousCount: number;
  topSignals: SignalSummary[];
  trustSamples: AnalyzedReview[];        // 대표 신뢰 리뷰
  suspiciousSamples: AnalyzedReview[];   // 대표 주의 리뷰
}

export type { AiSummary };
