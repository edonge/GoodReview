"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AnalysisResult } from "@/lib/types";

const EXAMPLE_TEXT = `★5
정말 만족해요!! 강추합니다 짱짱!!!

★4
한 달 정도 사용했는데 무게가 가볍고 색상도 사진과 동일해요. 다만 코드가 짧은 점이 아쉬워요.

★5
체험단으로 받았습니다. 만족합니다 추천해요.`;

type Mode = "url" | "text";

export default function HomePage() {
  const [mode, setMode] = useState<Mode>("url");
  const [url, setUrl] = useState("");
  const [reviewText, setReviewText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (mode === "url" && !url.trim()) {
      setError("상품 링크를 입력해주세요.");
      return;
    }
    if (mode === "text" && !reviewText.trim()) {
      setError("분석할 리뷰 텍스트를 붙여 넣어주세요.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "url"
            ? { url: url.trim() }
            : { reviewText: reviewText.trim() },
        ),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "분석에 실패했어요.");
      const result = data.result as AnalysisResult;
      sessionStorage.setItem("goodreview:lastResult", JSON.stringify(result));
      router.push("/result");
    } catch (err: any) {
      setError(err?.message ?? "알 수 없는 오류가 생겼어요.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-100 sm:p-8">
        <span className="inline-flex items-center rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-semibold text-brand-700">
          상품 리뷰 신뢰도 분석
        </span>
        <h1 className="mt-3 text-[22px] font-bold leading-snug text-gray-900 sm:text-3xl">
          이 상품 리뷰, <span className="text-brand-600">믿어도 될까요?</span>
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-gray-600 sm:text-base">
          링크 한 줄이면 충분해요. 광고 같은 리뷰와 진짜 후기를
          <br className="hidden sm:block" />
          {" "}AI 가 한눈에 가려서 보여드려요.
        </p>

        <div className="mt-5 inline-flex rounded-xl bg-gray-100 p-1 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setMode("url")}
            className={`rounded-lg px-3 py-1.5 transition ${
              mode === "url" ? "bg-white text-brand-700 shadow-sm" : "text-gray-500"
            }`}
            disabled={loading}
          >
            상품 링크
          </button>
          <button
            type="button"
            onClick={() => setMode("text")}
            className={`rounded-lg px-3 py-1.5 transition ${
              mode === "text" ? "bg-white text-brand-700 shadow-sm" : "text-gray-500"
            }`}
            disabled={loading}
          >
            리뷰 직접 붙여넣기
          </button>
        </div>

        <form onSubmit={onSubmit} className="mt-4 space-y-3">
          {mode === "url" ? (
            <>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700">상품 링크</span>
                <input
                  type="text"
                  inputMode="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="예: https://www.coupang.com/vp/products/..."
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base outline-none transition focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-100"
                  disabled={loading}
                />
              </label>
              <p className="text-[11px] leading-relaxed text-gray-400">
                ※ 리뷰 수집과 AI 분석에 20~40초 정도 걸려요. 페이지를 닫지 말고 잠시만 기다려주세요.
              </p>
            </>
          ) : (
            <>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700">
                  리뷰 텍스트 (빈 줄로 구분)
                </span>
                <textarea
                  value={reviewText}
                  onChange={(e) => setReviewText(e.target.value)}
                  placeholder={EXAMPLE_TEXT}
                  rows={10}
                  className="w-full resize-y rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-100"
                  disabled={loading}
                />
              </label>
              <button
                type="button"
                onClick={() => setReviewText(EXAMPLE_TEXT)}
                className="rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200"
                disabled={loading}
              >
                예시 텍스트 채우기
              </button>
              <p className="text-[11px] leading-relaxed text-gray-400">
                각 리뷰를 빈 줄로 구분해주세요. 첫 줄에 ★4, 5점, 5/5 같은 평점 표기가
                있으면 자동 인식해요. 없으면 5점으로 처리해요.
              </p>
            </>
          )}

          {error && (
            <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-100">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-brand-500 px-4 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "리뷰 분석 중..." : "분석하기"}
          </button>
        </form>
      </section>

      <section className="mt-6 grid gap-3 sm:grid-cols-3">
        <InfoCard step="1" title="입력" body="상품 링크나 리뷰 텍스트를 입력해요." />
        <InfoCard step="2" title="자동 분석" body="규칙 기반으로 의심·신뢰 신호를 살펴봐요." />
        <InfoCard step="3" title="요약" body="AI 또는 기본 요약기로 핵심을 정리해드려요." />
      </section>

      <p className="mt-5 px-1 text-[11px] leading-relaxed text-gray-400">
        본 서비스는 광고 여부를 단정하지 않으며, 텍스트 패턴 기반의 참고용 분석을 제공해요.
      </p>
    </main>
  );
}

function InfoCard({
  step,
  title,
  body,
}: {
  step: string;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-gray-100">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand-500 text-[10px] font-semibold text-white">
          {step}
        </span>
        <div className="text-sm font-semibold text-gray-900">{title}</div>
      </div>
      <div className="mt-1.5 text-xs leading-relaxed text-gray-600">{body}</div>
    </div>
  );
}
