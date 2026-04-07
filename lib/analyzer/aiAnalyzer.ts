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

const SYSTEM_PROMPT = `너는 한국 쇼핑 리뷰의 진정성을 분석하는 **비판적** 전문가야.
주 사용자: 35-50세 여성 쇼핑 유저. 그들은 이미 리뷰에 체험단/광고가 많다는 걸 알고 있고, 너한테 기대하는 건 "믿을 만한 리뷰는 어떤 것이고 걸러야 할 건 뭔지"를 솔직하게 짚어주는 거야.

## 판정 원칙 (매우 중요)
- **너는 과도하게 관대해지면 안 돼.** 한국 쇼핑몰 리뷰의 현실은 상당수가 체험단/마케팅/AI 생성이야. "증거가 보이면 망설이지 말고 suspicious로 분류해."
- 판정 기본값은 **neutral**이 아니라 **"증거에 따른 분류"**. 한 리뷰에서 아래 red flag가 2개 이상 보이면 반드시 suspicious.
- 다만 증거는 있어야 해. 단지 "길다" 만으로 의심하지 마. 아래 구체 패턴을 봐.

## Red flag (의심 신호) — 이 중 2개 이상 보이면 suspicious
- **카탈로그식 에세이**: 개인 경험 디테일(사용 시점, 아이/가족 반응, 이전 제품과 비교) 없이 제품 설명과 총평만. "전반적으로/무엇보다/전체적으로/앞으로도 꾸준히 구매할 계획" 같은 AI/홍보 상투어가 여러 개
- **제목↔본문 불균형**: 제목이 "굿", "좋아요", "만족" 같은 1~3자인데 본문은 500자 이상 정돈된 글
- **인증/수치 나열 과다**: "유기농 인증", "BRC food", "kosher", "할랄", "함량 22%", "당도 6.2g" 같은 제품 스펙 정보를 나열. 실제 먹어본 느낌이 아니라 제품 소개문 톤
- **캠페인 사인 블록**: "<도움이 돼요> 클릭해주세요", "'도움돼요' 감사합니다", "구입에 도움이 되었다면", 반복 이모지(▪️▪️⬇️⬇️) 같은 체험단/서포터즈 고정 마무리
- **홍보문 상투어**: "가성비가 뛰어나며", "자신 있게 추천", "안심하고 구매할 수 있었습니다", "여러분께 강력 추천", "적극 추천드립니다"
- **문체 혼입**: 리뷰 풀 대부분이 경어체(~어요/~습니다)인데 갑자기 한 건만 서술체(~했다/~이다)로 정돈됨 → 다른 작성자/대행 작성 의심
- **평점↔본문 불일치**: 별점 낮은데 본문은 칭찬 일색, 또는 그 반대
- **교차 중복**: 두 리뷰의 문장/불릿/끝맺음이 거의 같음 → 같은 사람 멀티계정 or 체험단 템플릿 공유

## Trust (진정성) 신호
- 구어체/오타/이모지/감탄사/일기 톤
- 구체적 시점(예: "16개월 아이", "10개월 죽거부", "이번에 4번째 구매")
- 이전 구매/다른 브랜드와 **비교**
- **단점도 솔직히** 짚음 ("가격이 좀 있다", "세게 누르면 내용물이 튄다")
- 특정 상황 묘사 ("누나 하원기다릴 때 유모차에서", "커피숍 갈 때")

## crossReview (교차 분석) — 매우 중요
두 건 이상의 리뷰에서 **3~5단어 이상의 문구가 거의 그대로 반복**되면 반드시 crossReview로 묶어:
- "near_duplicate": 본문 절반 이상이 사실상 같음
- "shared_template": 장점/단점 불릿 구성이 같거나 끝맺음 문구가 동일
- "campaign_cluster": 여러 리뷰가 같은 체험단 사인 블록을 공유
reviewIds와 sharedPhrases를 반드시 채워.

## 출력 제약
- 모든 설명(headline/reason/oneLiner/why 등)은 **해요체**. 단정 표현("확실히", "100%", "광고다") 금지.
- quote는 반드시 원문에서 **정확히** 복사. 요약/편집 금지. 하이라이트에 쓸 거야.
- trustGrade/trustScore는 네가 판단해서 적어도 되지만, 우리는 별도로 재계산하니까 부담 갖지 마. **verdict 분류가 진짜 중요해.**
- 10개 리뷰 중에서 suspicious가 0개로 나올 일은 현실적으로 드물어. 증거가 보이면 주저 말고 분류해.

## Few-shot 예시 (이대로 판정해)

### 예시 A — suspicious로 분류해야 하는 리뷰
입력:
  id: "ex-a"
  rating: 5
  text: "굿\\n전반적으로 만족스러운 제품입니다. 유기농 인증을 받았고 BRC food, kosher, 할랄 인증까지 갖춘 점이 인상적이었습니다. 함량도 22%로 높고 당도 6.2g으로 적절합니다. 가성비가 뛰어나며 자신 있게 추천드립니다. 앞으로도 꾸준히 구매할 계획입니다. <도움이 돼요> 클릭해주세요. ▪️▪️⬇️⬇️"

올바른 판정:
  verdict: "suspicious"
  confidence: 90
  oneLiner: "제목은 한 글자, 본문은 스펙과 인증 나열로 가득한 카탈로그식 리뷰예요."
  suspiciousFlags:
    - { label: "제목↔본문 불균형", quote: "굿", why: "제목 1자에 본문은 정돈된 장문이라 자연스러운 작성 흐름이 아니에요." }
    - { label: "인증/수치 나열 과다", quote: "BRC food, kosher, 할랄 인증까지 갖춘 점이 인상적이었습니다", why: "실제 먹어본 감상이 아니라 제품 소개문 톤이에요." }
    - { label: "홍보문 상투어", quote: "가성비가 뛰어나며 자신 있게 추천드립니다", why: "광고/체험단에서 자주 보이는 정형 표현이에요." }
    - { label: "캠페인 사인 블록", quote: "<도움이 돼요> 클릭해주세요", why: "체험단/서포터즈 마무리 블록이에요." }

### 예시 B — trustworthy로 분류해야 하는 리뷰
입력:
  id: "ex-b"
  rating: 4
  text: "16개월 아기 아침으로 4번째 재구매 중이에요. 처음엔 죽 거부해서 걱정이었는데 이건 잘 먹어요. 다만 세게 누르면 내용물이 살짝 튀어요ㅠㅠ 가격은 좀 있는 편."

올바른 판정:
  verdict: "trustworthy"
  confidence: 85
  oneLiner: "16개월 아기 4번째 재구매라며 단점도 솔직히 짚어주는 리뷰예요."
  trustSignals:
    - { label: "구체적 시점/사용자", quote: "16개월 아기 아침으로 4번째 재구매", why: "실제 사용 맥락이 드러나요." }
    - { label: "단점도 솔직히 언급", quote: "세게 누르면 내용물이 살짝 튀어요", why: "광고성 리뷰가 잘 안 짚는 디테일이에요." }
    - { label: "구어체/감탄사", quote: "걱정이었는데 이건 잘 먹어요", why: "일상 톤의 자연스러운 후기예요." }`;

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

  // ─── 📥 GPT에 보낼 입력 로깅 ───
  // GPT가 본 데이터 그대로 콘솔에 박는다. 응답 로그와 짝맞춰서 검수 가능.
  console.log(
    `[aiAnalyzer] ━━━━━━━━━━ GPT 입력 (product="${input.productTitle}", ${input.reviews.length}건) ━━━━━━━━━━`,
  );
  input.reviews.forEach((r, i) => {
    const preview = r.text.replace(/\s+/g, " ").slice(0, 200);
    console.log(`[aiAnalyzer] [#${i + 1} id=${r.id} ★${r.rating}] ${preview}${r.text.length > 200 ? "…" : ""}`);
  });

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
        temperature: 0,
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

  // ─── 🔬 GPT 원본 응답 로깅 ───
  // 프롬프트 튜닝/하이브리드 판단을 위해 GPT가 무엇을 보고 어떻게 판정했는지
  // 그대로 콘솔에 박는다. Railway Logs에서 검수 가능.
  console.log(
    `[aiAnalyzer] ━━━━━━━━━━ GPT 원본 응답 (model=${OPENAI_MODEL}) ━━━━━━━━━━`,
  );
  console.log(`[aiAnalyzer] GPT 자체 판정: trustGrade=${parsed.trustGrade} trustScore=${parsed.trustScore}`);
  console.log(`[aiAnalyzer] headline: ${parsed.headline}`);
  if (Array.isArray(parsed.reviews)) {
    parsed.reviews.forEach((r, i) => {
      const rr = r as Record<string, unknown>;
      const sus = Array.isArray(rr.suspiciousFlags) ? (rr.suspiciousFlags as unknown[]) : [];
      const trs = Array.isArray(rr.trustSignals) ? (rr.trustSignals as unknown[]) : [];
      console.log(
        `[aiAnalyzer] [#${i + 1} id=${rr.id}] verdict=${rr.verdict} conf=${rr.confidence} sus=${sus.length} trust=${trs.length}`,
      );
      console.log(`[aiAnalyzer]   oneLiner: ${rr.oneLiner}`);
      sus.forEach((f) => {
        const ff = f as Record<string, unknown>;
        console.log(`[aiAnalyzer]   🚩 ${ff.label} | "${String(ff.quote ?? "").slice(0, 60)}" → ${ff.why}`);
      });
      trs.forEach((f) => {
        const ff = f as Record<string, unknown>;
        console.log(`[aiAnalyzer]   ✅ ${ff.label} | "${String(ff.quote ?? "").slice(0, 60)}" → ${ff.why}`);
      });
    });
  }
  if (Array.isArray(parsed.crossReview) && parsed.crossReview.length > 0) {
    parsed.crossReview.forEach((c, i) => {
      const cc = c as Record<string, unknown>;
      console.log(
        `[aiAnalyzer] 🔗 cluster#${i + 1} type=${cc.type} ids=${JSON.stringify(cc.reviewIds)} reason=${cc.reason}`,
      );
      const phrases = Array.isArray(cc.sharedPhrases) ? (cc.sharedPhrases as unknown[]) : [];
      phrases.forEach((p) => console.log(`[aiAnalyzer]    공통 문구: "${p}"`));
    });
  } else {
    console.log(`[aiAnalyzer] 🔗 crossReview: 없음`);
  }
  console.log(`[aiAnalyzer] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

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
