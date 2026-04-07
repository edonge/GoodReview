import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GoodReview — 상품 리뷰 신뢰도 분석",
  description:
    "상품 링크를 입력하면 리뷰의 광고성/저신뢰 의심 패턴을 분석해 드립니다. (참고용)",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="min-h-screen">
        <div className="mx-auto max-w-3xl px-4 py-6 sm:px-5 sm:py-10">
          <header className="mb-8">
            <a href="/" className="inline-flex items-center gap-2">
              <span className="inline-block h-7 w-7 rounded-lg bg-brand-500" />
              <span className="text-lg font-semibold tracking-tight">GoodReview</span>
            </a>
          </header>
          {children}
          <footer className="mt-16 border-t pt-6 text-xs leading-relaxed text-gray-500">
            본 서비스는 광고 여부를 확정 판정하지 않으며, 텍스트 패턴 기반의 참고용 분석을 제공합니다.
          </footer>
        </div>
      </body>
    </html>
  );
}
