// 텍스트 정규화/토큰화 유틸 — 분석기/중복탐지/scraper에서 공용으로 쓴다.

// 한국어 특수문자/공백/한자 제거 정규화
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[\s\u200b]+/g, " ")
    .replace(/[!?！？.,~^_\-"'()\[\]{}<>·•‧]/g, "")
    .trim();
}

// 어절 토큰
export function tokenize(text: string): string[] {
  return normalize(text).split(/\s+/).filter(Boolean);
}

// 자카드 유사도
export function jaccard(a: Set<string> | string[], b: Set<string> | string[]): number {
  const sa = a instanceof Set ? a : new Set(a);
  const sb = b instanceof Set ? b : new Set(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const w of sa) if (sb.has(w)) inter += 1;
  return inter / (sa.size + sb.size - inter);
}

// 길이 버킷 (50자 단위)
export function lengthBucket(text: string): number {
  return Math.floor(text.length / 50);
}

// 앞 N개 토큰 해시 (버킷 키)
export function leadHash(text: string, n = 5): string {
  return tokenize(text).slice(0, n).join("|");
}
