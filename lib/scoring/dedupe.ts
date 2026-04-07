// 버킷 기반 near-duplicate 탐지.
// O(n²) 전수 비교 대신 길이 버킷 + 앞 토큰 해시로 후보를 좁힌 뒤
// 후보군 안에서만 자카드 유사도를 계산한다.
//
// 결과로 각 리뷰에 clusterId와 similarCount를 부여한다.
// 같은 cluster 안의 리뷰들은 서로 유사하다는 뜻.

import type { RawReview } from "@/lib/types";
import { jaccard, leadHash, lengthBucket, normalize, tokenize } from "@/lib/utils/text";

const SIM_THRESHOLD = 0.6;

export interface DedupeOutput {
  clusterIdByReviewId: Map<string, number>;
  similarCountByReviewId: Map<string, number>;
}

export function detectDuplicates(reviews: RawReview[]): DedupeOutput {
  const clusterIdByReviewId = new Map<string, number>();
  const similarCountByReviewId = new Map<string, number>();
  let nextClusterId = 0;

  // 1) exact duplicate (정규화 후 동일)
  const exactBuckets = new Map<string, RawReview[]>();
  for (const r of reviews) {
    const key = normalize(r.text);
    if (!key) continue;
    const arr = exactBuckets.get(key) ?? [];
    arr.push(r);
    exactBuckets.set(key, arr);
  }
  for (const arr of exactBuckets.values()) {
    if (arr.length < 2) continue;
    const cid = nextClusterId++;
    for (const r of arr) {
      clusterIdByReviewId.set(r.id, cid);
      similarCountByReviewId.set(r.id, arr.length - 1);
    }
  }

  // 2) near-duplicate (길이 버킷 + 앞 5토큰 해시 같은 후보군 안에서만 비교)
  const nearBuckets = new Map<string, RawReview[]>();
  for (const r of reviews) {
    if (clusterIdByReviewId.has(r.id)) continue; // exact dup이면 패스
    if (r.text.trim().length < 10) continue;
    const key = `${lengthBucket(r.text)}|${leadHash(r.text, 5)}`;
    const arr = nearBuckets.get(key) ?? [];
    arr.push(r);
    nearBuckets.set(key, arr);
  }

  // 후보군 안에서 자카드 비교 → 클러스터링 (Union-Find 단순 버전)
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let p = parent.get(x) ?? x;
    if (p === x) return x;
    p = find(p);
    parent.set(x, p);
    return p;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  const tokenCache = new Map<string, Set<string>>();
  const getTokens = (r: RawReview): Set<string> => {
    let s = tokenCache.get(r.id);
    if (!s) {
      s = new Set(tokenize(r.text));
      tokenCache.set(r.id, s);
    }
    return s;
  };

  for (const arr of nearBuckets.values()) {
    if (arr.length < 2) continue;
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const sim = jaccard(getTokens(arr[i]), getTokens(arr[j]));
        if (sim >= SIM_THRESHOLD) {
          union(arr[i].id, arr[j].id);
        }
      }
    }
  }

  // Union-Find 결과를 클러스터로 정리
  const groups = new Map<string, string[]>();
  for (const r of reviews) {
    if (clusterIdByReviewId.has(r.id)) continue;
    if (!parent.has(r.id)) continue;
    const root = find(r.id);
    const arr = groups.get(root) ?? [];
    arr.push(r.id);
    groups.set(root, arr);
  }
  for (const ids of groups.values()) {
    if (ids.length < 2) continue;
    const cid = nextClusterId++;
    for (const id of ids) {
      clusterIdByReviewId.set(id, cid);
      similarCountByReviewId.set(id, ids.length - 1);
    }
  }

  // 모든 리뷰에 기본값 채우기
  for (const r of reviews) {
    if (!similarCountByReviewId.has(r.id)) {
      similarCountByReviewId.set(r.id, 0);
    }
  }

  return { clusterIdByReviewId, similarCountByReviewId };
}
