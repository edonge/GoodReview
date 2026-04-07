// Mock scraper — 항상 동작하는 마지막 fallback.
// sampleReviews를 그대로 반환한다.

import type { RawReview } from "@/lib/types";
import { sampleReviews } from "@/lib/mock/sampleReviews";

export interface MockScrapeResult {
  productTitle: string;
  reviews: RawReview[];
}

export function getMockResult(url?: string): MockScrapeResult {
  const productTitle = inferTitle(url) ?? "예시 상품 (Mock 데이터)";
  return { productTitle, reviews: sampleReviews };
}

function inferTitle(url?: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname.includes("coupang")) return "쿠팡 상품 (Mock 데이터로 분석)";
    return `${u.hostname} 상품 (Mock 데이터로 분석)`;
  } catch {
    return null;
  }
}
