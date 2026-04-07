// 사용자가 직접 붙여넣은 텍스트로부터 리뷰를 파싱한다.
// 이 모드는 100% 신뢰성 있게 동작하므로 실제 분석 경로의 핵심.
//
// 지원 포맷:
// - 빈 줄로 구분된 리뷰 블록
// - 각 블록의 첫 줄에 "★4" / "5점" / "5/5" 같은 평점 표기 (선택)
// - 평점이 없으면 기본 5점 처리
//
// 작성자/날짜는 옵셔널 — 없으면 null.

import type { RawReview } from "@/lib/types";

export interface TextScrapeResult {
  productTitle: string;
  reviews: RawReview[];
}

export function parsePastedReviews(
  rawText: string,
  productTitle = "직접 입력한 상품",
): TextScrapeResult {
  const blocks = rawText
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter((b) => b.length > 0);

  const reviews: RawReview[] = [];
  blocks.forEach((block, idx) => {
    const { rating, text } = extractRating(block);
    if (text.length < 3) return;
    reviews.push({
      id: `text-${idx + 1}`,
      rating,
      text,
      author: null,
      date: null,
      source: "text",
    });
  });

  return { productTitle, reviews };
}

function extractRating(block: string): { rating: number; text: string } {
  const lines = block.split(/\n/).map((l) => l.trim());
  // 첫 줄에 평점 표기가 있는지 확인
  const head = lines[0];
  const m =
    head.match(/^★(\d)/) ||
    head.match(/^(\d)\s*점/) ||
    head.match(/^(\d)\s*\/\s*5/) ||
    head.match(/^rating[:\s]+(\d)/i);
  if (m) {
    const r = Math.max(1, Math.min(5, parseInt(m[1], 10)));
    return { rating: r, text: lines.slice(1).join(" ").trim() || lines.join(" ").trim() };
  }
  return { rating: 5, text: lines.join(" ").trim() };
}
