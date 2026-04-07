// ScrapingBee 경유 쿠팡 리뷰 스크레이퍼 (v2).
//
// 전략 변경 히스토리:
//  v1) 쿠팡 내부 리뷰 partial 엔드포인트(/vp/product/reviews)를 직접 호출
//      → 2026년 현재 이 엔드포인트가 단순 HTML을 반환하지 않음. ScrapingBee 500 발생.
//  v2) 상품 페이지(/vp/products/{id}) 전체를 premium_proxy + render_js=true로 렌더링
//      → JS 실행 후 리뷰 섹션 DOM을 cheerio로 파싱.
//
// 크레딧:
//  - premium_proxy + render_js: 요청당 약 25~30 크레딧
//  - 1회 호출로 상품 제목 + 리뷰 모두 획득
//  - 무료 1,000 크레딧 → 약 30개 고유 상품 (캐시로 재호출 0)
//
// 실패 모드:
//  - productId 추출 실패 → throw
//  - ScrapingBee 4xx/5xx → throw
//  - 렌더링 결과에서 리뷰 DOM 찾지 못함 → throw
//  → 상위에서 일반 fetch → mock 순으로 fallback

import * as cheerio from "cheerio";
import fs from "node:fs";
import path from "node:path";
import {
  SCRAPINGBEE_API_KEY,
  SCRAPINGBEE_ENDPOINT,
  SCRAPINGBEE_INTERNAL_TIMEOUT_MS,
  SCRAPINGBEE_REVIEW_SELECTOR,
  SCRAPINGBEE_TIMEOUT_MS,
  SCRAPINGBEE_WAIT_MS,
} from "@/lib/config";
import type { RawReview } from "@/lib/types";

// 크레딧 절약용 파일 시스템 캐시.
//
// 두 단계로 읽는다:
//  1) fixtures/scrapingbee/{id}.html  ← git에 커밋된 read-only fixture.
//     Railway 재배포해도 항상 존재 → 과제 시연용 productId는 영구적으로 크레딧 0.
//  2) .scrapingbee-cache/{id}.html    ← 런타임에 새로 받은 HTML 캐시.
//     로컬에서만 살아남고 Railway 재배포 시엔 날아감.
const FIXTURE_DIR = path.join(process.cwd(), "fixtures", "scrapingbee");
const FS_CACHE_DIR = path.join(process.cwd(), ".scrapingbee-cache");

function fsCacheRead(productId: string): { html: string; from: string } | null {
  for (const dir of [FIXTURE_DIR, FS_CACHE_DIR]) {
    try {
      const p = path.join(dir, `${productId}.html`);
      if (!fs.existsSync(p)) continue;
      return { html: fs.readFileSync(p, "utf-8"), from: dir };
    } catch {
      // 다음 후보로
    }
  }
  return null;
}

function fsCacheWrite(productId: string, html: string): void {
  try {
    if (!fs.existsSync(FS_CACHE_DIR)) {
      fs.mkdirSync(FS_CACHE_DIR, { recursive: true });
    }
    fs.writeFileSync(path.join(FS_CACHE_DIR, `${productId}.html`), html);
  } catch (e) {
    console.warn(`[scrapingbee] fs cache write 실패: ${(e as Error).message}`);
  }
}

export interface ScrapingBeeResult {
  productTitle: string;
  reviews: RawReview[];
  creditsUsed?: number;
}

export function isCoupangUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname.includes("coupang.com");
  } catch {
    return false;
  }
}

export function extractCoupangProductId(url: string): string | null {
  const m = url.match(/\/vp\/products\/(\d+)/);
  return m ? m[1] : null;
}

export async function scrapeCoupangViaScrapingBee(
  url: string,
): Promise<ScrapingBeeResult> {
  if (!SCRAPINGBEE_API_KEY) throw new Error("SCRAPINGBEE_API_KEY not set");
  const productId = extractCoupangProductId(url);
  if (!productId) {
    throw new Error("쿠팡 상품 URL에서 productId를 찾지 못했어요.");
  }

  // 크레딧 절약: fixtures(읽기 전용) → 런타임 캐시 순으로 확인.
  const cached = fsCacheRead(productId);
  if (cached) {
    const isFixture = cached.from === FIXTURE_DIR;
    console.log(
      `[scrapingbee] 💾 cache HIT productId=${productId} from=${isFixture ? "fixture" : "fs"} (크레딧 소비 0)`,
    );
    const $c = cheerio.load(cached.html);
    const titleC =
      $c('meta[property="og:title"]').attr("content")?.trim() ||
      $c("title").text().trim() ||
      `쿠팡 상품 #${productId}`;
    const reviewsC = parseReviews($c);
    console.log(`[scrapingbee] (cache) 파싱된 리뷰 수=${reviewsC.length}`);
    if (reviewsC.length > 0) {
      return {
        productTitle: titleC.replace(/\s*\|\s*쿠팡.*$/, "").trim(),
        reviews: reviewsC,
        creditsUsed: 0,
      };
    }
    // 캐시에서 파싱 실패하면 그냥 재호출로 fallthrough하지 말고 명확히 에러.
    // (재호출하면 크레딧 또 나감)
    console.log(`[scrapingbee] (cache) 파싱 0건 → 재호출 생략하고 에러`);
    throw new Error(
      `fs cache HTML 파싱 실패 productId=${productId}. 셀렉터 수정 후 다시 시도하세요. (크레딧 소비 0)`,
    );
  }

  console.log(`[scrapingbee] 상품 페이지 렌더링 시작 productId=${productId}`);
  const startedAt = Date.now();
  // 쿠팡은 Akamai Bot Manager로 보호됨. stealth_proxy + render_js로
  // Akamai 챌린지가 JS로 풀릴 시간을 충분히 준다.
  // return_page_source는 챌린지 도중의 HTML을 돌려주므로 빼야 함.
  const html = await scrapingBeeFetch(url, {
    stealth_proxy: true,
    country_code: "kr",
    render_js: true,
    wait: 6000, // Akamai JS 챌린지 해결 시간 확보
    wait_for: SCRAPINGBEE_REVIEW_SELECTOR,
    block_resources: false,
    timeout: SCRAPINGBEE_INTERNAL_TIMEOUT_MS,
  });
  console.log(
    `[scrapingbee] 응답 HTML 길이=${html.length} 소요=${Date.now() - startedAt}ms`,
  );

  // Akamai 챌린지 페이지 감지. 상품 페이지는 최소 수십 KB.
  if (html.length < 20000 || /sec-if-cpt-container|Powered and protected by Privacy/i.test(html)) {
    throw new Error(
      `쿠팡 Akamai 챌린지 페이지가 반환됨 (html_len=${html.length}). stealth_proxy로 우회 실패.`,
    );
  }

  // 정상 HTML을 받았으면 디스크에 저장. 다음부터는 크레딧 0으로 파싱 튜닝 가능.
  fsCacheWrite(productId, html);
  console.log(`[scrapingbee] 💾 fs cache 저장 완료 productId=${productId}`);

  const $ = cheerio.load(html);
  const productTitle =
    $('meta[property="og:title"]').attr("content")?.trim() ||
    $("title").text().trim() ||
    `쿠팡 상품 #${productId}`;

  const reviews = parseReviews($);
  console.log(`[scrapingbee] 파싱된 리뷰 수=${reviews.length}`);

  if (reviews.length === 0) {
    // 진단용: 받은 HTML의 앞부분과 title/og:title, body 텍스트 일부를 찍는다.
    const titleText = $("title").text().trim();
    const bodyText = $("body").text().replace(/\s+/g, " ").trim().slice(0, 300);
    console.log(`[scrapingbee] title="${titleText}"`);
    console.log(`[scrapingbee] body(앞300)="${bodyText}"`);
    console.log(`[scrapingbee] html(앞500)=${html.slice(0, 500)}`);
    throw new Error(
      `쿠팡 상품 페이지에서 리뷰 DOM을 찾지 못했어요. (html_len=${html.length}, title="${titleText.slice(0, 80)}")`,
    );
  }

  return {
    productTitle: productTitle.replace(/\s*\|\s*쿠팡.*$/, "").trim(),
    reviews,
    creditsUsed: 30,
  };
}

// 렌더링된 상품 페이지 HTML에서 리뷰 항목들을 추출한다.
//
// 2026년 쿠팡 PDP는 Tailwind JIT 기반으로 리뷰 DOM이 다음과 같은 구조:
//   div.sdp-review
//     article.twc-border-b-[1px]...      ← 리뷰 1개
//       div.twc-font-bold.twc-text-bluegray-900       ← 리뷰 제목
//       div.twc-text-[14px]/[19px].twc-break-all       ← 리뷰 본문 (span[translate=no] 포함)
//         span[translate="no"]                         ← 실제 본문 텍스트
//       (평점/작성자/날짜는 article 내 별도 영역)
function parseReviews($: cheerio.CheerioAPI): RawReview[] {
  const out: RawReview[] = [];

  // 최신 DOM 우선, 구 DOM fallback.
  const candidates = [
    "div.sdp-review article",
    "div.product-review article",
    "article.sdp-review__article__list",
    "article.js_reviewArticleReviewList",
    "[data-review-id]",
  ];

  let articles: cheerio.Cheerio<any> = $();
  let matchedSelector = "";
  for (const sel of candidates) {
    const found = $(sel);
    if (found.length > 0) {
      articles = found;
      matchedSelector = sel;
      console.log(`[scrapingbee] selector 매칭: "${sel}" → ${found.length}건`);
      break;
    }
  }

  articles.each((idx, el) => {
    const $el = $(el);

    // 1) 최신 DOM: span[translate="no"] 또는 div.twc-break-all
    let text = "";
    const spanTranslate = $el.find('span[translate="no"]');
    if (spanTranslate.length > 0) {
      text = spanTranslate
        .map((_, s) => $(s).text())
        .get()
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
    }
    if (!text) {
      text = pickText($el, [
        "div.twc-break-all",
        "div[class*='break-all']",
        ".sdp-review__article__list__review__content",
        ".js_reviewArticleContent",
      ]);
    }
    if (!text || text.length < 5) return;

    // 리뷰 제목
    const headline = pickText($el, [
      "div.twc-font-bold.twc-text-bluegray-900",
      "div[class*='font-bold'][class*='bluegray-900']",
      ".sdp-review__article__list__headline",
    ]);
    if (headline && !text.startsWith(headline)) {
      text = `${headline}\n${text}`;
    }

    const rating = pickRating($el);
    const author =
      pickText($el, [
        "div[class*='user__name']",
        ".sdp-review__article__list__info__user__name",
        "span[class*='user-name']",
      ]) || null;
    const date =
      pickText($el, [
        "div[class*='reg-date']",
        ".sdp-review__article__list__info__product-info__reg-date",
        "span[class*='date']",
      ]) || null;

    out.push({
      id: `cp-${idx + 1}`,
      rating,
      text,
      author,
      date,
      source: "scrapingbee",
    });
  });

  if (out.length > 0) {
    console.log(
      `[scrapingbee] 파싱 성공 selector="${matchedSelector}" 리뷰=${out.length}건`,
    );
  }
  return out;
}

function pickText($el: cheerio.Cheerio<any>, selectors: string[]): string {
  for (const sel of selectors) {
    const t = $el.find(sel).first().text().trim();
    if (t) return t.replace(/\s+/g, " ");
  }
  return "";
}

function pickRating($el: cheerio.Cheerio<any>): number {
  const dataAttr = $el.find("[data-rating]").first().attr("data-rating");
  if (dataAttr) {
    const r = parseInt(dataAttr, 10);
    if (r >= 1 && r <= 5) return r;
  }
  const starEl = $el
    .find(".sdp-review__article__list__info__product-info__star-orange")
    .first();
  if (starEl.length) {
    const style = starEl.attr("style") ?? "";
    const m = style.match(/width:\s*(\d+)%/);
    if (m) {
      const pct = parseInt(m[1], 10);
      const r = Math.round((pct / 100) * 5);
      if (r >= 1 && r <= 5) return r;
    }
  }
  return 5;
}

interface ScrapingBeeOpts {
  premium_proxy?: boolean;
  stealth_proxy?: boolean;
  country_code?: string;
  render_js?: boolean;
  wait?: number;
  wait_for?: string;
  wait_browser?: string;
  block_resources?: boolean;
  js_scenario?: string;
  timeout?: number;
  return_page_source?: boolean;
}

async function scrapingBeeFetch(
  targetUrl: string,
  opts: ScrapingBeeOpts = {},
): Promise<string> {
  const params = new URLSearchParams({
    api_key: SCRAPINGBEE_API_KEY,
    url: targetUrl,
    render_js: opts.render_js ? "true" : "false",
  });
  if (opts.premium_proxy) params.set("premium_proxy", "true");
  if (opts.stealth_proxy) params.set("stealth_proxy", "true");
  if (opts.country_code) params.set("country_code", opts.country_code);
  if (opts.wait) params.set("wait", String(opts.wait));
  if (opts.wait_for) params.set("wait_for", opts.wait_for);
  if (opts.wait_browser) params.set("wait_browser", opts.wait_browser);
  if (opts.block_resources !== undefined) {
    params.set("block_resources", String(opts.block_resources));
  }
  if (opts.js_scenario) params.set("js_scenario", opts.js_scenario);
  if (opts.timeout) params.set("timeout", String(opts.timeout));
  if (opts.return_page_source) params.set("return_page_source", "true");

  const apiUrl = `${SCRAPINGBEE_ENDPOINT}?${params.toString()}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SCRAPINGBEE_TIMEOUT_MS);
  try {
    const res = await fetch(apiUrl, {
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ScrapingBee ${res.status}: ${body.slice(0, 300)}`);
    }
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}
