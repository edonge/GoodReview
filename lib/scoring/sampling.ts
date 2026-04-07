// Stratified sampling: 별점 분포를 보존하면서 길이가 극단으로 쏠리지 않게 추출.

import type { RawReview } from "@/lib/types";
import { SAMPLING_TARGET, SAMPLING_THRESHOLD } from "@/lib/config";

export interface SamplingResult {
  reviews: RawReview[];
  wasSampled: boolean;
}

export function maybeSample(reviews: RawReview[]): SamplingResult {
  if (reviews.length <= SAMPLING_THRESHOLD) {
    return { reviews, wasSampled: false };
  }

  // 1) 별점별 그룹
  const byRating = new Map<number, RawReview[]>();
  for (const r of reviews) {
    const arr = byRating.get(r.rating) ?? [];
    arr.push(r);
    byRating.set(r.rating, arr);
  }

  // 2) 별점별 비율에 맞춰 목표 개수 분배
  const result: RawReview[] = [];
  for (const [rating, group] of byRating.entries()) {
    const ratio = group.length / reviews.length;
    const targetForGroup = Math.max(1, Math.round(SAMPLING_TARGET * ratio));
    result.push(...sampleByLength(group, targetForGroup));
  }

  return { reviews: result, wasSampled: true };
}

// 그룹 안에서 길이 분위수 보존하며 균등 추출
function sampleByLength(group: RawReview[], target: number): RawReview[] {
  if (group.length <= target) return group;
  const sorted = [...group].sort((a, b) => a.text.length - b.text.length);
  // 균등 인덱스로 추출 (정렬된 배열에서 일정 간격으로)
  const step = sorted.length / target;
  const out: RawReview[] = [];
  for (let i = 0; i < target; i++) {
    const idx = Math.min(sorted.length - 1, Math.floor(i * step));
    out.push(sorted[idx]);
  }
  return out;
}
