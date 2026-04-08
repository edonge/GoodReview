# GoodReview — 쿠팡 리뷰 신뢰도 분석 (MVP)

쿠팡 상품 링크 한 줄을 넣으면, GPT 가 리뷰를 한 건씩 직접 읽고
"광고/체험단처럼 보이는 후기"와 "진짜 도움이 되는 후기"를 가려서 보여주는 웹 서비스.

> ⚠️ 본 서비스는 **광고 여부를 단정하지 않습니다.** 텍스트와 GPT 판단을 조합한
> 참고용 신호 분석이며, 표현은 모두 "의심", "주의", "참고용" 수준으로 통일했습니다.

---

## 주요 기능

- **유연한 입력**
  - 쿠팡 상품 URL (`coupang.com/vp/products/...`)
  - 쿠팡 단축 링크 (`link.coupang.com/a/XXX`) — 자동으로 실제 URL 로 해석
  - 쿠팡 앱 "공유하기" 텍스트 통째로 — 안에 섞인 URL 만 자동 추출
  - 리뷰 텍스트 직접 붙여넣기 (가장 신뢰성 있는 경로)
- **AI 우선 + 규칙 기반 fallback 하이브리드 분석**
  - 리뷰 ≤ 20건이면 GPT 가 리뷰 한 건씩 정독, verdict / flags / quote / 교차중복 클러스터 산출
  - 21건 이상이면 규칙 기반 신호 분석으로 자동 전환 (성능/비용 보호)
  - GPT 호출 실패 / timeout 시에도 규칙 기반으로 fallback
- **Coupang 스크레이핑**
  - ScrapingBee `stealth_proxy` 경유로 Akamai Bot Manager 우회
  - 한 번 받은 HTML 은 디스크 캐시 → 같은 productId 재호출은 크레딧 0
  - 데모용 productId 는 `fixtures/scrapingbee/` 에 커밋되어 영구 캐시
- **결정론적 trustScore 산정**
  - `100 - suspicious×12 - cluster×10 - neutral×2 + min(15, trustworthy×2)`
  - GPT 가 자체 점수를 매겨도 우리가 verdict 분포로 다시 계산 (자기 가산점 방지)
- **GPT 입출력 풀 로깅**
  - 모든 호출에서 입력 리뷰 / GPT 응답 / 점수 산정식을 콘솔에 박아 운영 중 검수 가능
- **결과 화면**
  - AI 모드: 종합(좋은 점/아쉬운 점/주의), 교차 중복 클러스터, 리뷰별 verdict + quote 하이라이트
  - 규칙 모드: 신뢰 등급 + 게이지, TOP 의심 신호, 대표 리뷰

---

## 빠른 시작

```bash
npm install
cp .env.example .env.local   # 키 입력
npm run dev                  # http://localhost:3000
```

`.env.local` 예시:

```
SCRAPINGBEE_API_KEY=...     # 쿠팡 수집 (필수)
OPENAI_API_KEY=sk-...       # AI 분석 (선택, 없으면 규칙 기반만)
OPENAI_MODEL=gpt-4o-mini    # 선택, 기본 gpt-4o-mini. 더 정확한 판정엔 gpt-4o
```

키가 모두 없어도 mock fallback 으로 UI 전체 흐름은 작동합니다.

테스트 / 빌드 / 타입체크:

```bash
npm test
npm run build
npx tsc --noEmit
```

---

## 디렉토리 구조

```
.
├── app/
│   ├── page.tsx                       # 메인 (URL / 텍스트 입력)
│   ├── result/page.tsx                # 결과 페이지
│   ├── api/analyze/route.ts           # POST /api/analyze
│   ├── layout.tsx
│   └── globals.css
│
├── components/
│   ├── AiDeepSection.tsx              # AI 모드 전용 결과 UI (verdict + quote 하이라이트)
│   ├── ReviewCard.tsx                 # 규칙 모드 리뷰 카드
│   ├── SummaryCard.tsx                # 요약 카드
│   ├── TrustBadge.tsx
│   └── TrustGauge.tsx
│
├── lib/
│   ├── config.ts                      # 임계값/플래그/타임아웃 중앙집중
│   ├── types/index.ts                 # 도메인 타입 (AiDeepAnalysis 등)
│   │
│   ├── scraper/
│   │   ├── index.ts                   # 오케스트레이터 (text → scrapingbee → fetch → mock)
│   │   ├── normalize.ts               # 공유 텍스트/단축링크 정규화
│   │   ├── scrapingbee.ts             # 쿠팡 stealth_proxy 수집 + fixture/fs cache
│   │   ├── text.ts                    # 붙여넣기 텍스트 파서
│   │   ├── fetch.ts                   # 일반 fetch + cheerio + JSON-LD
│   │   └── mock.ts                    # 예시 데이터 fallback
│   │
│   ├── analyzer/
│   │   ├── index.ts                   # AI 분기 + 규칙 기반 파이프라인
│   │   ├── aiAnalyzer.ts              # OpenAI deep analyzer (few-shot 프롬프트)
│   │   └── signals.ts                 # 카테고리별 신호 탐지
│   │
│   ├── scoring/
│   │   ├── index.ts                   # scoreReview (cap + 다양성 + 양의 신호)
│   │   ├── dedupe.ts                  # 버킷 기반 근접 중복 탐지
│   │   └── sampling.ts                # 별점 계층 샘플링
│   │
│   ├── summary/
│   │   ├── index.ts                   # generateSummary (openai → mock fallback)
│   │   ├── openai.ts                  # OpenAI fetch 호출
│   │   ├── mock.ts                    # 결정적 기본 요약기
│   │   └── types.ts
│   │
│   ├── cache/                         # in-memory 결과 캐시
│   └── mock/sampleReviews.ts
│
├── fixtures/scrapingbee/              # git 커밋된 쿠팡 HTML 스냅샷 (재배포해도 살아남음)
├── tests/analyzer.test.ts             # Vitest 단위 테스트
├── vitest.config.ts
└── README.md
```

### 분석 파이프라인

```
POST /api/analyze
      │
      ▼
[ scraper ]
  ① normalizeInputUrl   ← 공유 텍스트/단축링크 풀기
  ② text → scrapingbee → fetch → mock fallback
      │
      ▼
[ analyzer ]
  if (USE_OPENAI && reviews ≤ 20):
      ├─ aiAnalyzer.deep()     ← few-shot 프롬프트, JSON mode, temperature 0
      ├─ verdict 분포로 trustScore 결정론적 재계산
      └─ 실패 시 규칙 기반으로 fallback
  else:
      ├─ maybeSample (300+일 때만)
      ├─ detectDuplicates (버킷 + 자카드 + Union-Find)
      ├─ runIntrinsicSignals × 리뷰
      ├─ scoreReview (cap + 다양성 + 양의 신호)
      └─ generateSummary
      │
      ▼
AnalysisResult JSON → result page
```

---

## 설계 원칙

- **레이어 분리.** scraper / analyzer / summary 각각 순수하고 교체 가능.
- **항상 동작.** 어떤 레이어가 실패해도 fallback 이 있어 UI 흐름이 깨지지 않음.
- **"판정"이 아니라 "신호 기반 참고".** GPT 의 자체 점수도 우리 식으로 재계산해서
  자기 가산점 / 일관성 부족을 막음.
- **운영 중 검수 가능.** 모든 GPT 호출의 입출력과 점수 산정 근거를 콘솔에 박아둠.
- **크레딧 보존.** ScrapingBee 호출은 fixture / fs cache / in-memory 3단으로 차단.

---

## 현재 할 수 있는 것 / 못 하는 것

### 할 수 있는 것
- 쿠팡 상품 페이지의 리뷰 10건 안팎을 안정적으로 수집 + 분석
- 쿠팡 앱 공유 텍스트와 단축링크 모두 자동 처리
- GPT 가 리뷰를 한 건씩 정독해 카탈로그식 / 체험단 사인 / 인증 나열 등을 quote 와 함께 지적
- 두 리뷰가 거의 동일한 템플릿이면 교차 중복 클러스터로 묶음
- 직접 붙여넣은 리뷰 텍스트는 어떤 사이트든 100% 분석

### 못 하는 것 (알려진 한계)
- **쿠팡 외 안티봇 + JS 렌더링 사이트** (네이버 스마트스토어 등): scrapingbee 셀렉터 별도 필요
- **20건 초과 리뷰**: 비용/속도 보호로 GPT 정독 대신 규칙 기반 분석으로 자동 전환
- **반어 / 풍자 / 짧은 리뷰의 진정성**: GPT 도 한국어 미묘한 톤은 종종 놓침
- **사이트 구조 변경**: 쿠팡 PDP DOM 이 바뀌면 셀렉터 손봐야 함

---

## 환경 변수 레퍼런스

| 키 | 기본값 | 설명 |
|---|---|---|
| `SCRAPINGBEE_API_KEY` | — | 쿠팡 수집용. 비면 mock fallback. |
| `OPENAI_API_KEY` | — | AI 분석/요약용. 비면 규칙 기반 + mock 요약. |
| `OPENAI_MODEL` | `gpt-4o-mini` | `gpt-4o` 로 올리면 판정 정확도 ↑ / 비용 ↑ |
| `OPENAI_TIMEOUT_MS` | `50000` | OpenAI 호출 timeout. Vercel/Railway maxDuration 한도 안 |
| `SCRAPINGBEE_TIMEOUT_MS` | `50000` | ScrapingBee fetch timeout |

---

## 향후 TODO

- 네이버 스마트스토어 / 11번가 셀렉터 추가
- 하이브리드 강제 분류 (suspiciousFlags ≥ 2 → verdict 강제 suspicious)
- 결과 공유용 카드 이미지 export
- LLM 기반 의미적 중복 탐지 (embedding 비교)
- 리뷰 캐시를 productId 단위로 영속화

---

## 면책

본 서비스가 제공하는 "저신뢰 의심 신호"는 텍스트 패턴과 LLM 판단을 조합한 통계적
단서입니다. 특정 리뷰가 광고/협찬임을 단정하지 않으며, 어떤 법적·계약적 효력도 갖지
않습니다.
