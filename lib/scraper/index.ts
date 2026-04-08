// Scraper orchestrator.
// 입력 형태에 따라 적합한 scraper를 시도하고, 실패 시 mock으로 fallback한다.
//
// 우선순위:
//  1) text  : 사용자가 직접 붙여넣은 리뷰 텍스트 → parsePastedReviews (무과금, 100% 신뢰)
//  2) scrapingbee : 쿠팡 URL인 경우 ScrapingBee premium_proxy 경유 (USE_SCRAPINGBEE일 때만)
//  3) fetch : 일반 URL → fetch + cheerio + JSON-LD (일부 블로그/소형 쇼핑몰만 성공)
//  4) mock  : 마지막 fallback, 항상 동작
//
// 모든 경로가 실패하면 mock + collectionStatus="fallback"이 부여된다.

import type { RawReview } from "@/lib/types";
import { USE_SCRAPINGBEE } from "@/lib/config";
import { fetchAndParse } from "./fetch";
import { parsePastedReviews } from "./text";
import { getMockResult } from "./mock";
import { isCoupangUrl, scrapeCoupangViaScrapingBee } from "./scrapingbee";
import { normalizeInputUrl } from "./normalize";

export interface ScraperRequest {
  url?: string;
  reviewText?: string;
}

export type CollectionStatus =
  | "text"              // 직접 붙여넣기 성공
  | "scrapingbee"       // 쿠팡 실제 수집 성공
  | "fetch"             // 일반 fetch 성공
  | "fallback";         // 전부 실패 → mock

export interface ScraperResult {
  productTitle: string;
  sourceUrl: string;
  reviews: RawReview[];
  scraperUsed: string;
  fallbackUsed: boolean;
  collectionStatus: CollectionStatus;
  collectionError?: string; // 실패 원인 (fallback일 때)
}

export async function collectReviews(req: ScraperRequest): Promise<ScraperResult> {
  // 1) 텍스트 입력 우선
  if (req.reviewText && req.reviewText.trim().length > 0) {
    const parsed = parsePastedReviews(req.reviewText);
    if (parsed.reviews.length > 0) {
      return {
        productTitle: parsed.productTitle,
        sourceUrl: req.url ?? "",
        reviews: parsed.reviews,
        scraperUsed: "text",
        fallbackUsed: false,
        collectionStatus: "text",
      };
    }
  }

  // URL 정규화: 공유 텍스트에서 URL 만 뽑아내고, 쿠팡 단축 링크는 실제 URL 로 풀어둠.
  if (req.url) {
    const normalized = await normalizeInputUrl(req.url);
    if (normalized && normalized !== req.url) {
      console.log(`[scraper] URL 정규화: ${req.url} → ${normalized}`);
      req = { ...req, url: normalized };
    }
  }

  const collectionErrors: string[] = [];

  // 2) 쿠팡 URL + ScrapingBee 키 있으면 premium proxy 경유
  if (req.url && isCoupangUrl(req.url)) {
    console.log(
      `[scraper] coupang URL 감지. USE_SCRAPINGBEE=${USE_SCRAPINGBEE}`,
    );
  }
  if (req.url && isCoupangUrl(req.url) && USE_SCRAPINGBEE) {
    try {
      const result = await scrapeCoupangViaScrapingBee(req.url);
      if (result.reviews.length > 0) {
        return {
          productTitle: result.productTitle,
          sourceUrl: req.url,
          reviews: result.reviews,
          scraperUsed: "scrapingbee",
          fallbackUsed: false,
          collectionStatus: "scrapingbee",
        };
      }
    } catch (err) {
      const msg = (err as Error).message;
      console.warn("[scraper:scrapingbee] 실패 →", msg);
      collectionErrors.push(`scrapingbee: ${msg}`);
    }
  }

  // 3) 일반 fetch + cheerio
  if (req.url && req.url.trim().length > 0) {
    try {
      const result = await fetchAndParse(req.url);
      if (result.reviews.length > 0) {
        return {
          productTitle: result.productTitle,
          sourceUrl: req.url,
          reviews: result.reviews,
          scraperUsed: "fetch",
          fallbackUsed: false,
          collectionStatus: "fetch",
        };
      }
    } catch (err) {
      const msg = (err as Error).message;
      console.warn("[scraper:fetch] 실패 →", msg);
      collectionErrors.push(`fetch: ${msg}`);
    }
  }

  // 4) Mock fallback
  const mock = getMockResult(req.url);
  return {
    productTitle: mock.productTitle,
    sourceUrl: req.url ?? "",
    reviews: mock.reviews,
    scraperUsed: "mock",
    fallbackUsed: true,
    collectionStatus: "fallback",
    collectionError:
      collectionErrors.length > 0 ? collectionErrors.join(" | ") : undefined,
  };
}
