// In-memory 결과 캐시.
// Vercel serverless에서는 인스턴스 단위로만 유지되지만,
// 연속된 요청·데모 시연 중 같은 URL 재분석을 크레딧 없이 돌리는 데 충분하다.

import { CACHE_TTL_MS } from "./config";
import type { AnalysisResult } from "./types";

interface Entry {
  value: AnalysisResult;
  expiresAt: number;
}

const store = new Map<string, Entry>();

export function cacheGet(key: string): AnalysisResult | null {
  const e = store.get(key);
  if (!e) return null;
  if (Date.now() > e.expiresAt) {
    store.delete(key);
    return null;
  }
  return e.value;
}

export function cacheSet(key: string, value: AnalysisResult): void {
  store.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

export function cacheSize(): number {
  return store.size;
}

// 단순한 determin 키 생성기.
// URL 입력은 URL 자체가 키, 텍스트 입력은 내용 해시.
export function makeCacheKey(input: { url?: string; reviewText?: string }): string {
  const url = input.url?.trim();
  if (url) return `url:${url}`;
  const text = input.reviewText?.trim() ?? "";
  if (!text) return "empty";
  return `text:${hashString(text)}`;
}

function hashString(s: string): string {
  // 간단 32bit FNV-1a
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16);
}
