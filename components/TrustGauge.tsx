export function TrustGauge({ score }: { score: number }) {
  const safe = Math.max(0, Math.min(100, score));
  const color =
    safe >= 70 ? "text-emerald-600" : safe >= 45 ? "text-amber-600" : "text-rose-600";
  const ring =
    safe >= 70 ? "stroke-emerald-500" : safe >= 45 ? "stroke-amber-500" : "stroke-rose-500";

  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (safe / 100) * circumference;

  return (
    <div className="flex items-center gap-5">
      <div className="relative h-32 w-32">
        <svg viewBox="0 0 120 120" className="h-32 w-32 -rotate-90">
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            strokeWidth="10"
            className="stroke-gray-100"
          />
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            strokeWidth="10"
            strokeLinecap="round"
            className={ring}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className={`text-3xl font-bold ${color}`}>{safe}</div>
          <div className="text-[10px] font-medium text-gray-500">/ 100</div>
        </div>
      </div>
      <div>
        <div className="text-sm font-semibold text-gray-900">전체 리뷰 신뢰도</div>
        <div className="mt-0.5 text-xs text-gray-500">
          텍스트 패턴 기반 참고용 점수입니다.
        </div>
      </div>
    </div>
  );
}
