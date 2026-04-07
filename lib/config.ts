// 모든 임계치/캡/플래그를 한 곳에서 관리.
// 운영하면서 튜닝할 값들은 전부 여기 모아둔다.

export const SUSPICION_THRESHOLDS = {
  // 리뷰 단위 최종 점수 → 라벨
  trustworthy: 30,   // < 30 = 신뢰 가능
  middle: 60,        // 30~59 = 보통, >= 60 = 주의
} as const;

// 카테고리별 cap (한 카테고리에서 누적될 수 있는 최대 의심 점수)
// 같은 종류 신호가 5개 떠도 cap 이상은 가산되지 않는다.
export const CATEGORY_CAPS = {
  lexical: 30,
  duplication: 40,
  mismatch: 25,
  structure: 15,
} as const;

// 신뢰 보강 신호의 카테고리 cap (음수 가산)
export const POSITIVE_CAP = 30;

// 카테고리 간 다양성 보너스 (서로 다른 카테고리 2개 이상 동시 발화)
export const DIVERSITY_BONUS_PER_EXTRA_CATEGORY = 5;

// 샘플링
export const SAMPLING_THRESHOLD = 300;        // 이 개수 초과 시 샘플링
export const SAMPLING_TARGET = 300;           // 샘플링했을 때 목표 분석 개수

// AI 요약에 넣을 대표 리뷰 수
export const SUMMARY_REPRESENTATIVE_COUNT = {
  trust: 8,
  suspicious: 8,
} as const;

// AI/LLM
export const USE_OPENAI = !!process.env.OPENAI_API_KEY;
export const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
// 이 이하로는 규칙 기반 대신 AI full analysis로 해석한다.
// (10개 = $0.005 정도. 20개까진 여유.)
export const AI_FULL_ANALYSIS_MAX_REVIEWS = 20;
// OpenAI 호출 전체 timeout. deep analysis는 3~8초, summary는 2~4초 걸려서 25초면 충분.
// 무한 대기 방지용 안전장치.
export const OPENAI_TIMEOUT_MS = 25000;

// scraper
export const FETCH_TIMEOUT_MS = 8000;
export const FETCH_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// ScrapingBee (쿠팡 같은 안티봇 사이트 우회용)
export const SCRAPINGBEE_API_KEY = process.env.SCRAPINGBEE_API_KEY ?? "";
export const USE_SCRAPINGBEE = !!SCRAPINGBEE_API_KEY;
export const SCRAPINGBEE_ENDPOINT = "https://app.scrapingbee.com/api/v1/";
// 우리쪽 AbortController timeout. Vercel 60s 한도 + ScrapingBee 내부 timeout 위에 마진.
export const SCRAPINGBEE_TIMEOUT_MS = 50000;
// ScrapingBee 내부 browser timeout. 이게 기본값 140000ms라 반드시 낮춰야 함.
export const SCRAPINGBEE_INTERNAL_TIMEOUT_MS = 40000;
// js_scenario 안의 fallback 대기 (ms).
export const SCRAPINGBEE_WAIT_MS = 1200;
// 쿠팡 상품 페이지에서 리뷰 article이 뜨기를 기다릴 셀렉터.
export const SCRAPINGBEE_REVIEW_SELECTOR = "article.sdp-review__article__list";

// 결과 캐시 (in-memory, 인스턴스 단위)
export const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24시간

// 결과 페이지 등급
export const TRUST_GRADE_THRESHOLDS = {
  good: 70,    // >= 70 → 좋음
  middle: 45,  // 45~69 → 보통, < 45 → 주의
} as const;
