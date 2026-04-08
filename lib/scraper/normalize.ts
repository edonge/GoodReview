// 사용자 입력 URL 정규화.
//
// 케이스 1) 쿠팡 앱 공유 텍스트 통째로 붙여넣기
//   "쿠팡을 추천합니다!\n햇반 발아현미밥\nhttps://link.coupang.com/a/ekv2vU"
//   → 첫 번째 http(s) URL 만 뽑아낸다.
//
// 케이스 2) 단축 링크 (link.coupang.com/a/XXX)
//   → 302 리다이렉트를 따라가 실제 vp/products/{id} URL을 얻는다.
//   → ScrapingBee 호출 전에 풀어둬야 하는 이유: ScrapingBee 가 단축 링크를
//     렌더링하면 redirect 된 페이지의 HTML 을 받지만, productId 추출 정규식
//     `\/vp\/products\/(\d+)` 가 매칭 안 돼서 fs cache 키가 깨짐.

const URL_RE = /(https?:\/\/[^\s<>"')]+)/i;

export function extractFirstUrl(text: string): string | null {
  const m = text.match(URL_RE);
  return m ? m[1] : null;
}

function isCoupangShortLink(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname === "link.coupang.com";
  } catch {
    return false;
  }
}

// 단축 링크 → 실제 URL. 실패하면 입력 그대로 돌려줌.
async function resolveCoupangShortLink(url: string): Promise<string> {
  try {
    // redirect: 'manual' 로 첫 Location 헤더만 읽으면 ScrapingBee 안 거치고 빠르다.
    // link.coupang.com 은 단순 302 라 Akamai 챌린지 없음.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(url, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
        },
      });
      const loc = res.headers.get("location");
      if (loc) {
        // 일부 단축 링크는 한 번 더 리다이렉트 함. 한 번 더 따라간다.
        if (isCoupangShortLink(loc)) {
          return await resolveCoupangShortLink(loc);
        }
        console.log(`[normalize] 단축링크 해석: ${url} → ${loc}`);
        return loc;
      }
      // Location 헤더 없으면 redirect: 'follow' 로 한 번 더 시도해 res.url 사용
      const res2 = await fetch(url, {
        method: "GET",
        redirect: "follow",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
        },
      });
      if (res2.url && res2.url !== url) {
        console.log(`[normalize] 단축링크 해석(follow): ${url} → ${res2.url}`);
        return res2.url;
      }
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    console.warn(`[normalize] 단축링크 해석 실패: ${(e as Error).message}`);
  }
  return url;
}

// 사용자 입력을 깨끗한 URL 한 줄로 만든다.
// 1) 텍스트 안에 URL 이 섞여 있으면 첫 URL 만 추출
// 2) 쿠팡 단축 링크면 실제 vp/products URL 로 해석
export async function normalizeInputUrl(rawInput: string): Promise<string> {
  const input = rawInput.trim();
  if (!input) return "";

  // 줄바꿈/공백이 섞여 있으면 URL 만 뽑아냄
  const extracted = extractFirstUrl(input) ?? input;

  if (isCoupangShortLink(extracted)) {
    return await resolveCoupangShortLink(extracted);
  }
  return extracted;
}
