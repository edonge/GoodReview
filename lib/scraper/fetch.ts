// Generic HTML fetch + cheerio 기반 scraper.
// 전략:
//  1) URL을 fetch (UA/타임아웃 설정)
//  2) HTML 내 JSON-LD <script type="application/ld+json"> 안의 Review/AggregateRating 파싱
//  3) productTitle은 <title> 또는 og:title에서 추출
//  4) 추출 실패 시 throw → 상위에서 fallback
//
// 한계:
//  - 대형 쇼핑몰(쿠팡 등)은 안티봇으로 거의 실패한다 (정상)
//  - 일부 사이트(개인 블로그, 작은 쇼핑몰)는 JSON-LD가 있어 작동한다
//  - 자바스크립트 렌더링이 필요한 사이트는 작동 안 한다 (Playwright 필요)

import * as cheerio from "cheerio";
import { FETCH_TIMEOUT_MS, FETCH_USER_AGENT } from "@/lib/config";
import type { RawReview } from "@/lib/types";

export interface FetchScrapeResult {
  productTitle: string;
  reviews: RawReview[];
}

export async function fetchAndParse(url: string): Promise<FetchScrapeResult> {
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);

  const productTitle = extractTitle($);
  const reviews = extractReviewsFromJsonLd($);

  if (reviews.length === 0) {
    throw new Error("No reviews found via JSON-LD");
  }
  return { productTitle, reviews };
}

async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": FETCH_USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
      },
      signal: controller.signal,
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function extractTitle($: cheerio.CheerioAPI): string {
  const og = $('meta[property="og:title"]').attr("content");
  if (og) return og.trim();
  const title = $("title").first().text();
  return title?.trim() || "상품";
}

interface JsonLdReview {
  reviewBody?: string;
  description?: string;
  reviewRating?: { ratingValue?: number | string };
  author?: { name?: string } | string;
  datePublished?: string;
}

function extractReviewsFromJsonLd($: cheerio.CheerioAPI): RawReview[] {
  const out: RawReview[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text();
    if (!raw) return;
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return;
    }
    const items = Array.isArray(json) ? json : [json];
    for (const item of items) walk(item, out);
  });
  return out;
}

function walk(node: unknown, out: RawReview[]): void {
  if (!node || typeof node !== "object") return;
  const obj = node as Record<string, unknown>;
  const type = obj["@type"];
  if (type === "Review" || (Array.isArray(type) && type.includes("Review"))) {
    const r = parseReview(obj as JsonLdReview, out.length);
    if (r) out.push(r);
  }
  // 상품 노드 안의 review[] 처리
  const reviewField = obj["review"];
  if (Array.isArray(reviewField)) {
    for (const r of reviewField) walk(r, out);
  } else if (reviewField && typeof reviewField === "object") {
    walk(reviewField, out);
  }
  // 중첩 객체 탐색 (제한적)
  for (const k of ["@graph", "itemListElement"]) {
    const v = obj[k];
    if (Array.isArray(v)) for (const child of v) walk(child, out);
  }
}

function parseReview(r: JsonLdReview, idx: number): RawReview | null {
  const text = (r.reviewBody ?? r.description ?? "").trim();
  if (text.length < 3) return null;
  const ratingRaw = r.reviewRating?.ratingValue;
  const rating =
    typeof ratingRaw === "number"
      ? ratingRaw
      : typeof ratingRaw === "string"
        ? parseFloat(ratingRaw)
        : 5;
  const author =
    typeof r.author === "string"
      ? r.author
      : (r.author && typeof r.author === "object" && r.author.name) || null;
  return {
    id: `fetch-${idx + 1}`,
    rating: Math.max(1, Math.min(5, Math.round(rating))),
    text,
    author: author ?? null,
    date: r.datePublished ?? null,
    source: "fetch",
  };
}
