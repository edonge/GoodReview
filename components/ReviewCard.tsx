import type { AnalyzedReview } from "@/lib/types";
import { SignalBadge, TrustBadge } from "./TrustBadge";

export function ReviewCard({ review }: { review: AnalyzedReview }) {
  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-gray-100">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          {review.author && (
            <span className="font-semibold text-gray-800">{review.author}</span>
          )}
          <span className="leading-none">
            <span className="text-amber-500">{"★".repeat(review.rating)}</span>
            <span className="text-gray-200">{"★".repeat(5 - review.rating)}</span>
          </span>
          {review.date && (
            <span className="text-[11px] text-gray-400">· {review.date}</span>
          )}
          {review.similarCount > 0 && (
            <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
              비슷한 리뷰 {review.similarCount}건
            </span>
          )}
        </div>
        <TrustBadge label={review.trustLabel} />
      </div>

      <p className="mt-2 text-sm leading-relaxed text-gray-800">{review.text}</p>

      {review.suspicionReasons.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {review.suspicionReasons.map((r) => (
            <SignalBadge key={`n-${r}`}>{r}</SignalBadge>
          ))}
        </div>
      )}

      {review.positiveSignals.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {review.positiveSignals.map((r) => (
            <span
              key={`p-${r}`}
              className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-100"
            >
              {r}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
