import { describe, expect, it } from "vitest";
import {
  detectPromoKeywords,
  detectExcessivePositive,
  detectTooShort,
  detectHighRatingLowContent,
  detectConsMentioned,
  detectNumberUnit,
} from "../lib/analyzer/signals";
import { analyzeReviews } from "../lib/analyzer";
import { scoreReview } from "../lib/scoring";
import { detectDuplicates } from "../lib/scoring/dedupe";
import type { RawReview } from "../lib/types";

const make = (over: Partial<RawReview>): RawReview => ({
  id: "x",
  author: "tester",
  rating: 5,
  text: "",
  date: "2026-01-01",
  source: "test",
  ...over,
});

describe("signals", () => {
  it("협찬/체험단 키워드 탐지", () => {
    expect(
      detectPromoKeywords(make({ text: "체험단으로 받았습니다 솔직히 적습니다" })),
    ).not.toBeNull();
    expect(
      detectPromoKeywords(make({ text: "잘 쓰고 있습니다 만족스럽네요" })),
    ).toBeNull();
  });

  it("과도한 긍정 표현 탐지", () => {
    expect(
      detectExcessivePositive(make({ text: "최고 강추 짱 완전 굿" })),
    ).not.toBeNull();
    expect(detectExcessivePositive(make({ text: "괜찮습니다." }))).toBeNull();
  });

  it("너무 짧은 리뷰 탐지", () => {
    expect(detectTooShort(make({ text: "좋아요" }))).not.toBeNull();
    expect(
      detectTooShort(make({ text: "한 달 사용 후기인데 배터리가 하루 정도 갑니다." })),
    ).toBeNull();
  });

  it("고평점 대비 빈약 리뷰 탐지", () => {
    expect(detectHighRatingLowContent(make({ rating: 5, text: "굿" }))).not.toBeNull();
    expect(
      detectHighRatingLowContent(
        make({
          rating: 5,
          text: "배터리가 하루 정도 가고 무게도 가벼워서 만족합니다. 오래 써봐야 알겠어요.",
        }),
      ),
    ).toBeNull();
  });

  it("양의 신호: 단점 언급 + 수치 포함", () => {
    const r = make({
      text: "2달 정도 썼는데 배터리가 8시간 정도 가요. 다만 코드가 짧은 점이 아쉬워요.",
    });
    expect(detectConsMentioned(r)).not.toBeNull();
    expect(detectNumberUnit(r)).not.toBeNull();
  });
});

describe("scoreReview", () => {
  it("양의 신호가 많으면 신뢰 라벨을 부여", () => {
    const out = scoreReview({
      signals: [
        { id: "cons_mentioned", category: "specificity", weight: 8, reason: "단점 언급", positive: true },
        { id: "number_unit", category: "specificity", weight: 9, reason: "수치", positive: true },
        { id: "time_context", category: "specificity", weight: 8, reason: "기간", positive: true },
      ],
      similarCount: 0,
    });
    expect(out.trustLabel).toBe("신뢰 가능");
    expect(out.suspicionScore).toBe(0);
  });

  it("여러 카테고리의 부정 신호는 다양성 보너스로 점수가 더 올라감", () => {
    const baseline = scoreReview({
      signals: [
        { id: "promo_keywords", category: "lexical", weight: 22, reason: "광고", positive: false },
      ],
      similarCount: 0,
    });
    const diverse = scoreReview({
      signals: [
        { id: "promo_keywords", category: "lexical", weight: 22, reason: "광고", positive: false },
        { id: "too_short", category: "structure", weight: 8, reason: "짧음", positive: false },
      ],
      similarCount: 0,
    });
    expect(diverse.suspicionScore).toBeGreaterThan(baseline.suspicionScore);
  });
});

describe("detectDuplicates", () => {
  it("완전 동일한 텍스트를 같은 클러스터로 묶음", () => {
    const reviews: RawReview[] = [
      make({ id: "a", text: "정말 좋아요 강력 추천합니다 최고예요" }),
      make({ id: "b", text: "정말 좋아요 강력 추천합니다 최고예요" }),
      make({ id: "c", text: "두 달 정도 잘 사용 중이에요. 배터리가 하루 갑니다." }),
    ];
    const out = detectDuplicates(reviews);
    expect(out.similarCountByReviewId.get("a")).toBeGreaterThanOrEqual(1);
    expect(out.similarCountByReviewId.get("b")).toBeGreaterThanOrEqual(1);
    expect(out.clusterIdByReviewId.get("a")).toBe(out.clusterIdByReviewId.get("b"));
  });
});

describe("analyzeReviews", () => {
  it("리뷰 세트를 받아 결과를 산출한다", async () => {
    const reviews: RawReview[] = [
      make({ id: "1", text: "최고예요 강추 짱 완전 굿 대박 최고", rating: 5 }),
      make({
        id: "2",
        text: "체험단으로 받아 사용했습니다. 만족합니다 추천해요.",
        rating: 5,
      }),
      make({
        id: "3",
        text: "두 달 정도 사용 중인데 무게도 가볍고 색상도 사진과 동일합니다. 다만 코드가 짧은 점이 아쉬워요.",
        rating: 4,
      }),
    ];
    const result = await analyzeReviews(reviews, {
      productTitle: "테스트 상품",
      sourceUrl: "https://example.com/p/1",
      scraperUsed: "test",
      fallbackUsed: false,
      collectionStatus: "text",
    });

    expect(result.totalReviewCount).toBe(3);
    expect(result.analyzedReviewCount).toBe(3);
    expect(result.trustScore).toBeGreaterThanOrEqual(0);
    expect(result.trustScore).toBeLessThanOrEqual(100);
    expect(result.reviews).toHaveLength(3);

    const r3 = result.reviews.find((r) => r.id === "3")!;
    expect(r3.trustLabel).toBe("신뢰 가능");

    const r2 = result.reviews.find((r) => r.id === "2")!;
    expect(r2.suspicionReasons.some((s) => s.includes("광고"))).toBe(true);
  });

  it("결과에 등급과 AI 요약이 포함된다", async () => {
    const result = await analyzeReviews(
      [
        make({
          id: "h1",
          text: "두 달 사용 후기예요. 무게가 가볍고 색상도 사진과 동일합니다. 다만 코드가 짧아 멀티탭이 필요했어요.",
          rating: 5,
        }),
      ],
      {
        productTitle: "t",
        sourceUrl: "https://example.com",
        scraperUsed: "test",
        fallbackUsed: false,
        collectionStatus: "text",
      },
    );
    expect(result.aiSummary.headline.length).toBeGreaterThan(0);
    expect(["좋음", "보통", "주의"]).toContain(result.trustGrade);
    // 해요체 톤 유지 확인
    expect(result.aiSummary.headline).toMatch(/요\.?$/);
    expect(["openai", "mock"]).toContain(result.aiSummary.source);
  });
});
