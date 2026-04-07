// OpenAI 호출을 직접 fetch로 처리한다 (SDK 의존성 추가 안 함).
// 실패 시 throw → 상위에서 mock으로 fallback.

import { OPENAI_MODEL, OPENAI_TIMEOUT_MS } from "@/lib/config";
import type { AiSummary } from "@/lib/types";
import type { SummaryInput } from "./types";

const SYSTEM_PROMPT = `너는 한국 쇼핑 사용자(35-50세 여성)에게 상품 리뷰를 친근하게 요약해주는 어시스턴트야.
규칙:
- 모든 문장은 해요체로 작성해.
- "광고다", "확실히", "100%" 같은 단정적 표현 절대 금지.
- 모르는 수치는 추측하지 말고 입력으로 제공된 통계만 활용해.
- 출력은 반드시 JSON. 설명/마크다운 금지.
- pros/cons/caution 각 항목은 50자 이내로 짧게.`;

const SCHEMA_HINT = `{
  "headline": "한 줄 결론 (해요체, 단정 금지)",
  "pros": ["장점1", "장점2", "장점3"],
  "cons": ["단점/주의1", "단점/주의2", "단점/주의3"],
  "caution": ["체크포인트1", "체크포인트2"]
}`;

export async function callOpenAI(input: SummaryInput): Promise<AiSummary> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");

  const userPayload = {
    product: input.productTitle,
    stats: {
      total: input.totalReviewCount,
      analyzed: input.analyzedReviewCount,
      trust_score: input.trustScore,
      grade: input.trustGrade,
      trustworthy: input.trustworthyCount,
      middle: input.middleCount,
      suspicious: input.suspiciousCount,
    },
    top_signals: input.topSignals.map((s) => ({ reason: s.reason, count: s.count })),
    trust_samples: input.trustSamples.slice(0, 8).map((r) => ({
      rating: r.rating,
      text: r.text.slice(0, 280),
    })),
    suspicious_samples: input.suspiciousSamples.slice(0, 8).map((r) => ({
      rating: r.rating,
      text: r.text.slice(0, 280),
      reasons: r.suspicionReasons,
    })),
  };

  const userPrompt = `다음 통계와 대표 리뷰를 보고 아래 JSON 스키마로 응답해.\n\n스키마:\n${SCHEMA_HINT}\n\n데이터:\n${JSON.stringify(
    userPayload,
    null,
    2,
  )}`;

  // AbortController로 무한 대기 방지. OpenAI가 먹통일 때 서버리스 함수가 통째로 질질 끌리는 걸 막는다.
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
        temperature: 0.3,
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
    throw new Error(`OpenAI API ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  const content: string | undefined = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI response missing content");

  const parsed = JSON.parse(content);
  // 후처리: 단정 표현 정규식 제거
  const sanitize = (s: string) =>
    s.replace(/(광고다|확실해|확실히|틀림없|100%)/g, "").trim();
  const sanitizeArr = (arr: unknown): string[] =>
    Array.isArray(arr) ? arr.map((x) => sanitize(String(x))).filter(Boolean).slice(0, 3) : [];

  return {
    headline: sanitize(String(parsed.headline ?? "")) || "리뷰 요약을 만들었어요.",
    pros: sanitizeArr(parsed.pros),
    cons: sanitizeArr(parsed.cons),
    caution: sanitizeArr(parsed.caution),
    summaryNote:
      "이 결과는 광고 여부를 확정 판정하지 않으며, 텍스트 패턴 기반의 참고용 분석이에요.",
    source: "openai",
  };
}
