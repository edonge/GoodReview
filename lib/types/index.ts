// 도메인 타입 정의

export type SignalCategory =
  | "lexical"        // 어휘 기반 (광고/협찬, 강조어 등)
  | "specificity"    // 구체성 (양의 신호 전용)
  | "duplication"    // 중복/유사
  | "mismatch"       // 평점-텍스트 불일치
  | "structure";     // 표면 구조 (길이, 느낌표 등)

export type TrustLabel = "신뢰 가능" | "보통" | "주의";

export interface SignalResult {
  id: string;            // 내부 식별자 (예: "promo_keywords")
  category: SignalCategory;
  weight: number;        // cap 안에서 누적될 가중치
  reason: string;        // 사용자 노출용 한 줄 (해요체)
  positive: boolean;     // 신뢰 보강 신호인가
}

export interface RawReview {
  id: string;
  rating: number;        // 1~5
  text: string;
  author: string | null;
  date: string | null;   // ISO 또는 null
  source: string;        // "fetch" | "text" | "mock" 등
}

export interface AnalyzedReview extends RawReview {
  suspicionScore: number;          // 0~100
  trustLabel: TrustLabel;
  suspicionReasons: string[];      // 의심 신호 reason 목록
  positiveSignals: string[];       // 양의 신호 reason 목록
  signalIds: string[];             // 집계용
  similarCount: number;            // 비슷한 리뷰 개수 (자기 자신 제외)
  clusterId: number | null;        // 같은 클러스터끼리는 같은 id
}

export interface SignalSummary {
  id: string;
  reason: string;
  category: SignalCategory;
  count: number;
}

export interface AiSummary {
  headline: string;
  pros: string[];
  cons: string[];
  caution: string[];
  summaryNote: string;
  source: "openai" | "mock";
}

export type CollectionStatus = "text" | "scrapingbee" | "fetch" | "fallback";

// --- AI deep analysis (리뷰 수가 적을 때 OpenAI에 전체 해석 위임) ---

export type ReviewVerdict = "suspicious" | "neutral" | "trustworthy";

// AI가 특정 문구를 인용하면서 남기는 플래그 한 개.
export interface AiFlag {
  label: string;       // 예: "AI/대행 의심", "제목↔본문 불균형"
  quote: string;       // 원문에서 인용한 문구 (하이라이트용)
  why: string;         // 왜 걸렸는지 해요체 한 줄
}

// 리뷰 한 개에 대한 AI 판정.
export interface AiReviewAnalysis {
  id: string;                      // RawReview.id 와 매칭
  verdict: ReviewVerdict;
  confidence: number;              // 0~100
  oneLiner: string;                // 한 줄 총평 (해요체)
  suspiciousFlags: AiFlag[];
  trustSignals: AiFlag[];
}

// 리뷰 교차 비교 (중복/템플릿/캠페인 클러스터 등)
export interface AiCrossReview {
  type: "near_duplicate" | "shared_template" | "campaign_cluster";
  reviewIds: string[];
  reason: string;                  // 해요체 한 문단
  sharedPhrases: string[];         // 공통으로 발견된 문구 (하이라이트용)
}

// 전체 deep 분석 결과 덩어리.
export interface AiDeepAnalysis {
  mode: "ai_full";
  headline: string;                // 최상단 한 줄 총평
  pros: string[];
  cons: string[];
  cautions: string[];
  reviews: AiReviewAnalysis[];
  crossReview: AiCrossReview[];
}

export interface AnalysisResult {
  // 메타
  productTitle: string;
  sourceUrl: string;
  scraperUsed: string;
  fallbackUsed: boolean;
  collectionStatus: CollectionStatus;
  collectionError?: string;

  // 수량
  totalReviewCount: number;
  analyzedReviewCount: number;
  wasSampled: boolean;

  // 집계
  trustScore: number;              // 0~100 (높을수록 신뢰)
  trustGrade: "좋음" | "보통" | "주의";
  trustworthyCount: number;
  middleCount: number;
  suspiciousCount: number;
  topSignals: SignalSummary[];     // top 3

  // 대표 리뷰
  representativeTrust: AnalyzedReview[];
  representativeSuspicious: AnalyzedReview[];

  // 전체 분석된 리뷰
  reviews: AnalyzedReview[];

  // AI 요약
  aiSummary: AiSummary;

  // AI deep analysis (리뷰가 적고 OpenAI가 활성일 때만 채워짐)
  aiDeepAnalysis?: AiDeepAnalysis;

  disclaimer: string;
}
