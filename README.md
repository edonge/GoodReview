# GoodReview — 상품 리뷰 신뢰도 분석 (MVP)

상품 링크나 리뷰 텍스트를 넣으면, 광고처럼 보이는 리뷰와 실제로 도움이 되는 리뷰를
한눈에 정리해 보여주는 웹 서비스입니다.

> ⚠️ 본 서비스는 **광고 여부를 확정 판정하지 않습니다.** 텍스트 패턴 기반의 참고용 신호
> 분석만 제공하며, 결과에 사용되는 표현은 모두 "의심", "주의", "참고용" 수준입니다.

---

## 주요 기능

- **두 가지 입력 모드**
  - 상품 URL 입력 → 자동 수집 시도 → 실패 시 예시 데이터 fallback
  - 리뷰 텍스트 직접 붙여넣기 (가장 신뢰성 있는 경로)
- **규칙 기반 신호 분석**
  - 카테고리: 어휘 / 구조 / 중복 / 불일치 / 구체성(양의 신호)
  - 카테고리별 상한(cap) + 다양성 보너스 + 양의 신호 차감 + 유사 리뷰 페널티
  - 리뷰별 `suspicionScore(0~100)` + `trustLabel("신뢰 가능"|"보통"|"주의")` 부여
- **버킷 기반 근접 중복 탐지**
  - 길이 버킷 + 앞 토큰 해시로 후보를 좁힌 뒤 자카드 유사도로 클러스터링 (Union-Find)
- **별점 계층 샘플링**
  - 300건 초과 시 별점 분포를 보존하며 300건으로 축소, 그룹 내에서는 길이 균등 추출
- **AI 요약 서비스 레이어**
  - `OPENAI_API_KEY` 설정 시 OpenAI `gpt-4o-mini` 호출 (JSON 스키마 강제 + 해요체 프롬프트)
  - 미설정/실패 시 결정적 mock summary로 자동 fallback
  - 단정 표현(`광고다`, `100%` 등) 후처리 필터
- **결과 화면**
  - 신뢰 등급 + 한 줄 요약(AI) + 게이지 + 핵심 지표
  - AI 요약 카드(좋은 점 / 아쉬운 점 / 주의할 점 + 출처 태그)
  - TOP3 의심 신호, 대표 도움/주의 리뷰, 리뷰 목록 필터/정렬

---

## 빠른 시작

```bash
npm install
npm run dev          # http://localhost:3000
```

선택: OpenAI 요약 켜기

```bash
export OPENAI_API_KEY=sk-...
export OPENAI_MODEL=gpt-4o-mini   # 선택, 기본 gpt-4o-mini
npm run dev
```

테스트 / 빌드 / 타입체크:

```bash
npm test
npm run build
npx tsc --noEmit
```

> 어떤 URL을 입력해도 수집이 실패하면 자동으로 예시(mock) 데이터로 fallback 되므로, 첫 실행부터 전체 UI 흐름을 확인할 수 있습니다. 가장 신뢰성 있는 경로는 **"리뷰 직접 붙여넣기"** 모드입니다.

---

## 디렉토리 구조

```
.
├── app/
│   ├── page.tsx                       # 메인 (URL / 텍스트 입력 모드)
│   ├── result/page.tsx                # 결과 페이지
│   ├── api/analyze/route.ts           # POST /api/analyze
│   ├── layout.tsx
│   └── globals.css
│
├── components/
│   ├── ReviewCard.tsx                 # 개별 리뷰 카드 (+양의 신호 뱃지)
│   ├── SummaryCard.tsx                # AI 요약 카드
│   ├── TrustBadge.tsx                 # 신뢰도/신호 배지
│   └── TrustGauge.tsx                 # 신뢰도 게이지
│
├── lib/
│   ├── config.ts                      # 임계값/cap/플래그 중앙집중
│   ├── types/index.ts                 # 도메인 타입
│   ├── utils/text.ts                  # 정규화/토큰화/자카드/버킷 유틸
│   │
│   ├── scraper/
│   │   ├── index.ts                   # 오케스트레이터 (text → fetch → mock)
│   │   ├── text.ts                    # 붙여넣기 텍스트 파서 (★/점/5 감지)
│   │   ├── fetch.ts                   # fetch + cheerio + JSON-LD 파서
│   │   └── mock.ts                    # 예시 데이터 fallback
│   │
│   ├── analyzer/
│   │   ├── signals.ts                 # 카테고리별 신호 탐지 (순수함수)
│   │   └── index.ts                   # analyzeReviews 파이프라인
│   │
│   ├── scoring/
│   │   ├── index.ts                   # scoreReview (cap + 다양성 + 양의 신호)
│   │   ├── dedupe.ts                  # 버킷 기반 근접 중복 탐지
│   │   └── sampling.ts                # 별점 계층 샘플링
│   │
│   ├── summary/
│   │   ├── index.ts                   # generateSummary (openai → mock fallback)
│   │   ├── openai.ts                  # OpenAI fetch 호출 (raw)
│   │   ├── mock.ts                    # 결정적 기본 요약기
│   │   └── types.ts                   # SummaryInput
│   │
│   └── mock/sampleReviews.ts
│
├── tests/analyzer.test.ts             # Vitest 단위 테스트
├── vitest.config.ts                   # @ alias 설정
└── README.md
```

### 분석 파이프라인

```
POST /api/analyze
      │
      ▼
[ scraper ]  text → fetch → mock fallback
      │
      ▼
[ analyzer ]
  ① maybeSample (300+일 때만 계층 샘플링)
  ② detectDuplicates (버킷 + 자카드 + Union-Find)
  ③ runIntrinsicSignals × 리뷰
  ④ scoreReview (cap + 다양성 + 양의 신호 + 유사 페널티)
  ⑤ 집계 → TOP 신호, 대표 리뷰
  ⑥ generateSummary (OpenAI → mock fallback)
      │
      ▼
AnalysisResult JSON → result page
```

---

## 설계 원칙

- **레이어 분리.** scraper / analyzer / scoring / summary 각각은 순수하고 교체 가능.
- **항상 동작.** 어떤 레이어가 실패해도 fallback이 있어 UI 전체 흐름이 깨지지 않음.
- **"판정"이 아니라 "신호 빈도 기반 참고".** 카테고리 cap으로 한 카테고리에 과도하게
  쏠리는 점수를 막고, 양의 신호(구체성)로 감점해 균형을 맞춤.
- **LLM은 선택 사항.** 키 없이도 전체가 작동하도록 결정적 mock summary를 제공.

---

## 현재 할 수 있는 것 / 못 하는 것

### 할 수 있는 것
- 사용자가 붙여넣은 리뷰 텍스트 100% 분석 (★평점 추출, 빈 줄 구분)
- JSON-LD `Review` 스키마를 노출하는 일부 사이트(블로그/소형 쇼핑몰) URL 직접 수집
- 300건 초과 시 샘플링, 중복 리뷰 클러스터링, 양·음의 신호 혼합 스코어링
- OpenAI 연결 시 JSON 스키마 강제 요약, 미연결 시 mock 요약

### 못 하는 것 (알려진 한계)
- **쿠팡/네이버 스마트스토어 등 안티봇 + JS 렌더링 사이트**: fetch+cheerio로는 거의 실패.
  이 경우 자동으로 mock fallback 됩니다. 실제 분석이 필요하면 "직접 붙여넣기" 모드 사용.
- **규칙 기반 한계**: 문맥·반어·풍자 판정 불가. 숏 리뷰의 진정성 판정 한계.
- **실시간 수집 안정성 보장 불가**: 사이트 구조/안티봇 정책 변경에 취약.

---

## 향후 TODO

- Playwright headless 기반 scraper 추가 (쿠팡/스마트스토어 대응)
- 리뷰 캐싱 (URL → AnalysisResult)
- 카테고리/가격대별 가중치 튜닝
- 결과 공유용 카드 이미지 export
- LLM 기반 의미적 중복 탐지 (embedding 비교)

---

## 면책

본 서비스가 제공하는 "저신뢰 의심 신호"는 어디까지나 텍스트 패턴 기반의 통계적 단서입니다. 특정 리뷰가 광고/협찬임을 단정하지 않으며, 어떤 법적·계약적 효력도 갖지 않습니다.
