// AI 기반 deep review 분석.
//
// 리뷰 수가 적을 때 (≤ AI_FULL_ANALYSIS_MAX_REVIEWS) 규칙 기반 대신
// OpenAI에 전체 리뷰 + 상품명을 통째로 넣어 해석시킨다.
//
// 출력은 JSON으로 강제하고, 스키마는 AiDeepAnalysis와 매칭되도록 프롬프트에 명시.
// 각 플래그에는 반드시 원문의 정확한 substring을 quote로 요구 → 결과 페이지에서 하이라이트.
//
// 실패 시 throw → 상위에서 규칙 기반 fallback.

import { OPENAI_MODEL, OPENAI_TIMEOUT_MS } from "@/lib/config";
import type { AiDeepAnalysis, RawReview } from "@/lib/types";

const SYSTEM_PROMPT = `너는 한국 쇼핑 리뷰의 진정성을 분석하는 전문가야.
주 사용자: 35-50세 여성 쇼핑 유저. 그들이 "이 리뷰 믿어도 되나?"를 빠르게 판단하도록 돕는 게 목적이야.

분석 원칙:
- 리뷰 한 건씩 꼼꼼히 읽고 판정해. 표면 키워드 매칭 금지, 맥락으로 판단해.
- "suspicious"로 분류할 땐 반드시 구체 증거(원문 인용)가 있어야 해. 추측만으로 의심 걸지 마.
- 구어체/오타/이모지/개인 상황 디테일/이전 구매와 비교/솔직한 단점은 진정성 신호야.
- 다음은 의심 신호 예시야 (필요하면 이 label 그대로 써):
  * "AI/대행 의심" — 개인 디테일 없이 카탈로그식 장문, "전반적으로/무엇보다/전체적으로/앞으로도 꾸준히 구매할 계획" 같은 상투적 총평 에세이
  * "제목↔본문 불균형" — 제목 한두 글자("굿", "좋아요")인데 본문 500자 이상
  * "캠페인 사인 블록" — "<도움이 돼요> 클릭해주세요", "'도움돼요' 감사합니다", 반복 이모지 블록(▪️⬇️)으로 같이 끝맺음
  * "홍보문 상투어" — "가성비가 뛰어나며", "자신 있게 추천", "안심하고 구매할 수 있었습니다"
  * "카탈로그 복붙" — 인증명(BRC/kosher/할랄/유기농) / 함량% 등 제품 스펙만 나열하고 실사용 느낌 부재
  * "평점↔본문 불일치" — 별점 낮은데 본문 내용은 칭찬, 또는 반대
- 다음은 trust(진정성) 신호 예시야:
  * "구체 경험 디테일" — 아이 나이/상황, 사용 시점, 구체적 반응
  * "솔직한 단점" — 장점만 나열하지 않고 흠도 짚음
  * "구매 이력 비교" — 이전 제품/이전 구매와 비교
  * "자연스러운 구어체" — 오타, 이모지, 감탄사, 일기 같은 톤
- crossReview(교차 분석)도 꼭 확인해. 두 리뷰 이상이 동일 템플릿/공통 문구를 쓰면 "shared_template" 또는 "near_duplicate"로 묶고 공통 문구를 sharedPhrases에 넣어.
- 모든 설명(reason, oneLiner, why, headline 등)은 **해요체**. 단정 표현("확실히", "100%", "광고다") 금지. "보여요", "같아요", "느껴져요" 처럼 완화.
- quote는 반드시 원문에서 **정확히** 복사해. 요약/편집 금지. 하이라이트에 쓸 거야.
- 판정은 엄격하게. 대부분을 suspicious로 몰지 말고 증거 기반으로.`;

const SCHEMA_HINT = `{
  "headline": "string - 전체 총평 한 문장 (해요체)",
  "pros": ["string", "..."],     // 3개 이내. 리뷰들이 공통으로 말하는 장점
  "cons": ["string", "..."],     // 3개 이내. 리뷰들이 공통으로 말하는 단점
  "cautions": ["string", "..."], // 3개 이내. 의심 정황 요약
  "trustGrade": "good" | "middle" | "caution",
  "trustScore": number,           // 0~100, 높을수록 신뢰
  "crossReview": [
    {
      "type": "near_duplicate" | "shared_template" | "campaign_cluster",
      "reviewIds": ["cp-3", "cp-4"],
      "reason": "string - 왜 묶였는지 해요체 한두 문장",
      "sharedPhrases": ["원문에서 공통으로 발견된 문구들"]
    }
  ],
  "reviews": [
    {
      "id": "string - 입력된 review.id 그대로",
      "verdict": "suspicious" | "neutral" | "trustworthy",
      "confidence": number,       // 0~100
      "oneLiner": "string - 이 리뷰를 한 줄로 (해요체)",
      "suspiciousFlags": [
        {
          "label": "string - 위 예시 label 또는 직접 명명",
          "quote": "string - 원문에서 정확히 복사한 substring (하이라이트용)",
          "why": "string - 왜 문제인지 해요체 한 줄"
        }
      ],
      "trustSignals": [
        {
          "label": "string",
          "quote": "string",
          "why": "string"
        }
      ]
    }
  ]
}`;

interface AiAnalyzerInput {
  productTitle: string;
  reviews: RawReview[];
}

// 내부 JSON (raw) — trustGrade/Score도 AI에서 받아오므로 별도 타입.
interface RawAiJson {
  headline?: string;
  pros?: unknown;
  cons?: unknown;
  cautions?: unknown;
  trustGrade?: string;
  trustScore?: number;
  crossReview?: unknown;
  reviews?: unknown;
}

export interface AiAnalyzerOutput {
  deep: AiDeepAnalysis;
  trustGrade: "good" | "middle" | "caution";
  trustScore: number;
}

export async function analyzeReviewsDeepWithAI(
  input: AiAnalyzerInput,
): Promise<AiAnalyzerOutput> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");

  const userPayload = {
    product: input.productTitle,
    reviews: input.reviews.map((r) => ({
      id: r.id,
      rating: r.rating,
      // 본문은 너무 길면 잘라 토큰 아낌. 2000자면 충분.
      text: r.text.slice(0, 2000),
    })),
  };

  const userPrompt = `아래 상품의 리뷰 ${input.reviews.length}개를 분석해서 정확히 아래 JSON 스키마로 응답해.

스키마:
${SCHEMA_HINT}

데이터:
${JSON.stringify(userPayload, null, 2)}`;

  // AbortController로 무한 대기 방지.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    throw new Error(`OpenAI deep API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const data = await res.json();
  const content: string | undefined = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI deep response missing content");

  const parsed: RawAiJson = JSON.parse(content);

  const sanitize = (s: string) =>
    s
      .replace(/(광고다|확실해|확실히|틀림없|100%)/g, "")
      .replace(/\s+/g, " ")
      .trim();

  const asStrArr = (x: unknown, max = 3): string[] =>
    Array.isArray(x)
      ? x
          .map((v) => sanitize(String(v ?? "")))
          .filter(Boolean)
          .slice(0, max)
      : [];

  // reviews 후처리: verdict/confidence/flags 정규화
  const validVerdicts = new Set(["suspicious", "neutral", "trustworthy"]);
  const reviewsOut = Array.isArray(parsed.reviews)
    ? parsed.reviews.map((r: Record<string, unknown>) => {
        const id = String(r.id ?? "");
        const verdict = validVerdicts.has(String(r.verdict))
          ? (r.verdict as "suspicious" | "neutral" | "trustworthy")
          : "neutral";
        const confidence = clampNumber(r.confidence, 0, 100, 50);

        const normalizeFlags = (arr: unknown) =>
          Array.isArray(arr)
            ? arr
                .map((f: Record<string, unknown>) => ({
                  label: sanitize(String(f?.label ?? "")),
                  quote: String(f?.quote ?? "").trim(),
                  why: sanitize(String(f?.why ?? "")),
                }))
                .filter((f) => f.label && f.why)
            : [];

        return {
          id,
          verdict,
          confidence,
          oneLiner: sanitize(String(r.oneLiner ?? "")),
          suspiciousFlags: normalizeFlags(r.suspiciousFlags),
          trustSignals: normalizeFlags(r.trustSignals),
        };
      })
    : [];

  // crossReview 후처리
  const validCrossTypes = new Set([
    "near_duplicate",
    "shared_template",
    "campaign_cluster",
  ]);
  const crossOut = Array.isArray(parsed.crossReview)
    ? parsed.crossReview
        .map((c: Record<string, unknown>) => ({
          type: validCrossTypes.has(String(c?.type))
            ? (c.type as "near_duplicate" | "shared_template" | "campaign_cluster")
            : "shared_template",
          reviewIds: Array.isArray(c?.reviewIds)
            ? (c.reviewIds as unknown[]).map((x) => String(x))
            : [],
          reason: sanitize(String(c?.reason ?? "")),
          sharedPhrases: Array.isArray(c?.sharedPhrases)
            ? (c.sharedPhrases as unknown[]).map((x) => String(x).trim()).filter(Boolean)
            : [],
        }))
        .filter((c) => c.reviewIds.length >= 2)
    : [];

  const trustScore = clampNumber(parsed.trustScore, 0, 100, 50);
  const trustGrade =
    parsed.trustGrade === "good"
      ? "good"
      : parsed.trustGrade === "caution"
        ? "caution"
        : "middle";

  return {
    deep: {
      mode: "ai_full",
      headline: sanitize(String(parsed.headline ?? "")) || "리뷰를 해석해봤어요.",
      pros: asStrArr(parsed.pros),
      cons: asStrArr(parsed.cons),
      cautions: asStrArr(parsed.cautions),
      reviews: reviewsOut,
      crossReview: crossOut,
    },
    trustGrade,
    trustScore,
  };
}

function clampNumber(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}
