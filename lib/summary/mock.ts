// 결정적(deterministic) mock summary generator.
// OPENAI_API_KEY가 없을 때 동일 입력 → 동일 출력으로 동작하도록 단순 규칙 기반.

import type { AiSummary } from "@/lib/types";
import type { SummaryInput } from "./types";

export function buildMockSummary(input: SummaryInput): AiSummary {
  const headline = buildHeadline(input);
  const pros = extractPros(input);
  const cons = extractCons(input);
  const caution = buildCaution(input);
  return {
    headline,
    pros,
    cons,
    caution,
    summaryNote:
      "이 결과는 광고 여부를 확정 판정하지 않으며, 텍스트 패턴 기반의 참고용 분석이에요.",
    source: "mock",
  };
}

function buildHeadline(input: SummaryInput): string {
  const { trustGrade, trustworthyCount, suspiciousCount, totalReviewCount, topSignals } = input;
  if (totalReviewCount === 0) return "분석할 리뷰가 없어요.";
  const top = topSignals[0]?.reason;
  if (trustGrade === "좋음") {
    return `구체적인 사용 경험이 담긴 리뷰가 ${trustworthyCount}건 있어 비교적 믿고 볼 만해요.`;
  }
  if (trustGrade === "보통") {
    return top
      ? `${top} 신호가 일부 보여서 한 번 더 살펴보면 좋아요.`
      : "일부 주의가 필요하지만 참고할 만한 리뷰도 있어요.";
  }
  return top
    ? `${top} 신호가 두드러지고, 의심 리뷰가 ${suspiciousCount}건 있어 주의가 필요해요.`
    : "광고처럼 보이는 리뷰가 섞여 있어서 신뢰에 주의가 필요해요.";
}

function extractPros(input: SummaryInput): string[] {
  // 신뢰 리뷰에서 짧은 핵심 문장(첫 어절~30자) 추출
  const pros: string[] = [];
  for (const r of input.trustSamples) {
    const snippet = pickSnippet(r.text, "pros");
    if (snippet && !pros.includes(snippet)) pros.push(snippet);
    if (pros.length >= 3) break;
  }
  while (pros.length < 3 && input.trustSamples.length === 0) {
    pros.push("도움이 되는 구체적인 후기를 찾기 어려웠어요.");
    break;
  }
  return pros.slice(0, 3);
}

function extractCons(input: SummaryInput): string[] {
  const cons: string[] = [];
  // 신뢰 리뷰 안에서 단점 언급 부분 추출
  for (const r of input.trustSamples) {
    const snippet = pickSnippet(r.text, "cons");
    if (snippet && !cons.includes(snippet)) cons.push(snippet);
    if (cons.length >= 3) break;
  }
  if (cons.length === 0) {
    cons.push("리뷰 안에서 구체적인 단점 언급을 찾기 어려웠어요.");
  }
  return cons.slice(0, 3);
}

function buildCaution(input: SummaryInput): string[] {
  const out: string[] = [];
  if (input.suspiciousCount > 0) {
    out.push(
      `의심 신호가 있는 리뷰가 ${input.suspiciousCount}건 있으니 본문을 한 번 더 확인해 보세요.`,
    );
  }
  const top = input.topSignals[0];
  if (top) out.push(`가장 자주 보인 신호: ${top.reason}.`);
  if (input.totalReviewCount < 10) {
    out.push("리뷰 수가 적어 판정 확신도가 낮아요. 참고용으로만 활용해 주세요.");
  }
  if (out.length === 0) {
    out.push("특별히 두드러진 주의 신호는 없었어요. 그래도 본인 기준으로 한 번 더 확인해 보세요.");
  }
  return out.slice(0, 3);
}

const CON_KEYWORDS = ["다만", "아쉬", "단점", "그러나", "하지만", "별로", "불편"];

function pickSnippet(text: string, mode: "pros" | "cons"): string | null {
  // 문장 단위로 분리 후 mode에 맞는 첫 문장 선택
  const sentences = text.split(/(?<=[.!?。])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
  if (sentences.length === 0) return null;

  if (mode === "cons") {
    const conSentence = sentences.find((s) => CON_KEYWORDS.some((k) => s.includes(k)));
    if (!conSentence) return null;
    return truncate(conSentence, 60);
  }

  // pros: 단점 키워드 없는 첫 문장
  const proSentence =
    sentences.find((s) => !CON_KEYWORDS.some((k) => s.includes(k))) ?? sentences[0];
  return truncate(proSentence, 60);
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}
