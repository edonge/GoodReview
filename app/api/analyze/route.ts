import { NextResponse } from "next/server";
import { collectReviews } from "@/lib/scraper";
import { analyzeReviews } from "@/lib/analyzer";
import { cacheGet, cacheSet, makeCacheKey } from "@/lib/cache";
import { USE_OPENAI, USE_SCRAPINGBEE } from "@/lib/config";

export const runtime = "nodejs";
export const maxDuration = 60;

interface AnalyzeBody {
  url?: string;
  reviewText?: string;
}

export async function POST(req: Request) {
  console.log(
    `[/api/analyze] USE_SCRAPINGBEE=${USE_SCRAPINGBEE} USE_OPENAI=${USE_OPENAI} ` +
      `SB_KEY_LEN=${(process.env.SCRAPINGBEE_API_KEY ?? "").length} ` +
      `OAI_KEY_LEN=${(process.env.OPENAI_API_KEY ?? "").length}`,
  );
  let body: AnalyzeBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 형식이에요." }, { status: 400 });
  }

  const url = (body.url ?? "").trim();
  const reviewText = (body.reviewText ?? "").trim();

  if (!url && !reviewText) {
    return NextResponse.json(
      { error: "상품 링크나 리뷰 텍스트를 입력해주세요." },
      { status: 400 },
    );
  }

  if (url) {
    // 멀티라인 공유 텍스트도 허용 — 안에 http(s) URL 한 줄만 있으면 OK.
    // 실제 정규화/단축링크 해석은 collectReviews 에서 수행.
    if (!/https?:\/\//i.test(url)) {
      return NextResponse.json(
        { error: "링크가 포함되지 않았어요. https:// 로 시작하는 주소를 넣어주세요." },
        { status: 400 },
      );
    }
  }

  // 캐시 조회 (크레딧/LLM 재호출 방지)
  const cacheKey = makeCacheKey({ url, reviewText });
  const cached = cacheGet(cacheKey);
  if (cached) {
    return NextResponse.json({ result: cached, cached: true });
  }

  try {
    const scraped = await collectReviews({ url, reviewText });
    const result = await analyzeReviews(scraped.reviews, {
      productTitle: scraped.productTitle,
      sourceUrl: scraped.sourceUrl,
      scraperUsed: scraped.scraperUsed,
      fallbackUsed: scraped.fallbackUsed,
      collectionStatus: scraped.collectionStatus,
      collectionError: scraped.collectionError,
    });
    cacheSet(cacheKey, result);
    return NextResponse.json({ result, cached: false });
  } catch (err) {
    console.error("[/api/analyze] failed", err);
    return NextResponse.json(
      { error: "분석 중 문제가 생겼어요. 잠시 후 다시 시도해주세요." },
      { status: 500 },
    );
  }
}
