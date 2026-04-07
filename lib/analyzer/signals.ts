// 카테고리화된 규칙 신호 정의.
// 각 규칙은 RawReview를 받아 발화 시 SignalResult를 반환한다.
// "발화 안 함"은 null 반환.

import type { RawReview, SignalResult } from "@/lib/types";
import { tokenize } from "@/lib/utils/text";

// ────────────────────────────────────────────────
// Lexical (어휘 기반)
// ────────────────────────────────────────────────

const PROMO_KEYWORDS = [
  "체험단",
  "협찬",
  "제공받",
  "제공 받",
  "무상으로",
  "원고료",
  "리뷰어",
  "서포터즈",
  "이벤트 당첨",
  "광고",
];

const POSITIVE_INTENSIFIERS = [
  "최고",
  "강추",
  "짱",
  "완전",
  "대박",
  "굿",
  "너무너무",
  "정말정말",
  "추천",
  "역대급",
  "신세계",
];

export function detectPromoKeywords(r: RawReview): SignalResult | null {
  const hits = PROMO_KEYWORDS.filter((k) => r.text.includes(k));
  if (hits.length === 0) return null;
  return {
    id: "promo_keywords",
    category: "lexical",
    weight: 22,
    reason: "광고·협찬 관련 표현이 보여요",
    positive: false,
  };
}

export function detectExcessivePositive(r: RawReview): SignalResult | null {
  const hits = POSITIVE_INTENSIFIERS.filter((k) => r.text.includes(k)).length;
  if (hits < 3) return null;
  return {
    id: "excessive_positive",
    category: "lexical",
    weight: 14,
    reason: "칭찬 강조 표현이 유난히 많아요",
    positive: false,
  };
}

export function detectBrandRepetition(
  r: RawReview,
  productTitle?: string,
): SignalResult | null {
  if (!productTitle) return null;
  const tokens = productTitle
    .split(/\s+/)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, ""))
    .filter((t) => t.length >= 2)
    .slice(0, 3);
  if (tokens.length === 0) return null;
  const count = tokens.reduce((acc, t) => {
    const re = new RegExp(escapeRegExp(t), "g");
    const m = r.text.match(re);
    return acc + (m ? m.length : 0);
  }, 0);
  if (count < 4) return null;
  return {
    id: "brand_repetition",
    category: "lexical",
    weight: 10,
    reason: "상품명·브랜드명이 지나치게 반복돼요",
    positive: false,
  };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ────────────────────────────────────────────────
// Structure (표면 구조)
// ────────────────────────────────────────────────

export function detectTooShort(r: RawReview): SignalResult | null {
  if (r.text.trim().length >= 15) return null;
  return {
    id: "too_short",
    category: "structure",
    weight: 8,
    reason: "내용이 너무 짧아요",
    positive: false,
  };
}

export function detectExcessiveExclamation(r: RawReview): SignalResult | null {
  const matches = r.text.match(/[!?！？]/g);
  const count = matches ? matches.length : 0;
  if (count < 5 && (r.text.length === 0 || count / r.text.length <= 0.1)) return null;
  return {
    id: "excessive_exclamation",
    category: "structure",
    weight: 7,
    reason: "느낌표·물음표가 유난히 많아요",
    positive: false,
  };
}

export function detectExcessiveEmoji(r: RawReview): SignalResult | null {
  // 기본 다국어 emoji + 한국 자모 반복 (ㅋㅋㅋㅋ, ㅎㅎㅎ)
  const emojiRe = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu;
  const emojiCount = (r.text.match(emojiRe) ?? []).length;
  const jamoBurst = /([ㅋㅎㅠㅜ])\1{3,}/.test(r.text);
  if (emojiCount < 3 && !jamoBurst) return null;
  return {
    id: "excessive_emoji",
    category: "structure",
    weight: 6,
    reason: "이모지·감탄 표현이 과해요",
    positive: false,
  };
}

// ────────────────────────────────────────────────
// Mismatch (평점-텍스트 불일치)
// ────────────────────────────────────────────────

const CON_KEYWORDS = [
  "단점",
  "아쉬",
  "별로",
  "불편",
  "문제",
  "흠집",
  "소음",
  "부족",
  "다만",
  "그러나",
  "하지만",
  "불만",
];

export function detectHighRatingLowContent(r: RawReview): SignalResult | null {
  if (!(r.rating >= 5 && r.text.trim().length < 25)) return null;
  return {
    id: "high_rating_low_content",
    category: "mismatch",
    weight: 16,
    reason: "5점인데 내용이 빈약해요",
    positive: false,
  };
}

export function detectNoConsMention(r: RawReview): SignalResult | null {
  // 평점 4~5점에서만 의미 있음
  if (r.rating <= 3) return null;
  // 짧은 리뷰는 단점 부재가 별 의미 없음 (이미 too_short로 잡힘)
  if (r.text.trim().length < 40) return null;
  if (CON_KEYWORDS.some((k) => r.text.includes(k))) return null;
  return {
    id: "no_cons_mention",
    category: "mismatch",
    weight: 9,
    reason: "단점 언급이 전혀 없어요",
    positive: false,
  };
}

// ────────────────────────────────────────────────
// Specificity (양의 신호)
// ────────────────────────────────────────────────

const ATTRIBUTE_HINTS =
  /(배터리|무게|크기|색상|포장|설치|사용법|마감|코드|버튼|소재|냄새|두께|밝기|소음|발열|화면|디자인|사이즈|길이|두께|향)/;

const TIME_HINTS = /(첫날|일주일|한 ?달|두 ?달|반 ?년|매일|주말|아침|저녁|밤|새벽|시간 ?째)/;

const NUMBER_UNIT = /\d+\s*(일|주|개월|달|시간|분|개|번|회|cm|mm|kg|g|ml|L|인치)/;

const COMPARE_HINTS = /(전에 쓰던|예전 거|이전 모델|다른 제품|타사|보다|비교)/;

export function detectNumberUnit(r: RawReview): SignalResult | null {
  if (!NUMBER_UNIT.test(r.text)) return null;
  return {
    id: "number_unit",
    category: "specificity",
    weight: 9,
    reason: "구체적인 수치·단위가 들어가요",
    positive: true,
  };
}

export function detectTimeContext(r: RawReview): SignalResult | null {
  if (!TIME_HINTS.test(r.text)) return null;
  return {
    id: "time_context",
    category: "specificity",
    weight: 8,
    reason: "사용 기간·맥락을 언급해요",
    positive: true,
  };
}

export function detectAttributes(r: RawReview): SignalResult | null {
  const matches = r.text.match(new RegExp(ATTRIBUTE_HINTS, "g"));
  if (!matches || matches.length < 2) return null;
  return {
    id: "attributes",
    category: "specificity",
    weight: 8,
    reason: "구체적인 사용 경험이 담겨 있어요",
    positive: true,
  };
}

export function detectComparison(r: RawReview): SignalResult | null {
  if (!COMPARE_HINTS.test(r.text)) return null;
  return {
    id: "comparison",
    category: "specificity",
    weight: 7,
    reason: "다른 제품과의 비교가 들어가요",
    positive: true,
  };
}

export function detectConsMentioned(r: RawReview): SignalResult | null {
  if (r.text.trim().length < 30) return null;
  if (!CON_KEYWORDS.some((k) => r.text.includes(k))) return null;
  return {
    id: "cons_mentioned",
    category: "specificity",
    weight: 8,
    reason: "단점·아쉬운 점도 함께 언급해요",
    positive: true,
  };
}

// ────────────────────────────────────────────────
// 모든 규칙 실행 (duplication은 별도)
// ────────────────────────────────────────────────

export function runIntrinsicSignals(
  r: RawReview,
  ctx: { productTitle?: string },
): SignalResult[] {
  const signals: (SignalResult | null)[] = [
    detectPromoKeywords(r),
    detectExcessivePositive(r),
    detectBrandRepetition(r, ctx.productTitle),
    detectTooShort(r),
    detectExcessiveExclamation(r),
    detectExcessiveEmoji(r),
    detectHighRatingLowContent(r),
    detectNoConsMention(r),
    detectNumberUnit(r),
    detectTimeContext(r),
    detectAttributes(r),
    detectComparison(r),
    detectConsMentioned(r),
  ];
  return signals.filter((s): s is SignalResult => s !== null);
}

// 토큰 길이를 외부에서 쓸 수 있게 export
export { tokenize };
