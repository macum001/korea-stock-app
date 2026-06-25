-- market_briefings: 시황 브리핑 저장 테이블
-- 매일 06:00 자동 생성, 1일 1건 (date 기준 UNIQUE)

CREATE TABLE IF NOT EXISTS market_briefings (
  id            SERIAL PRIMARY KEY,
  date          DATE NOT NULL UNIQUE,          -- 브리핑 날짜 (KST 기준)

  -- 수집된 원본 데이터 (JSON)
  raw_data      JSONB NOT NULL DEFAULT '{}',   -- 수집된 모든 지수/환율/원자재 숫자

  -- AI 생성 브리핑 (2단계에서 채워짐)
  summary       TEXT,                          -- 한 줄 요약
  analysis      JSONB,                         -- 섹션별 분석 JSON
  ai_model      VARCHAR(50),                   -- 사용한 AI 모델명
  ai_tokens     INTEGER,                       -- 사용 토큰 수

  -- 상태
  status        VARCHAR(20) NOT NULL DEFAULT 'collecting',
  -- collecting: 데이터 수집 중
  -- collected:  데이터 수집 완료, AI 분석 대기
  -- completed:  AI 분석까지 완료
  -- failed:     수집/분석 실패

  error_message TEXT,                          -- 실패 시 에러 메시지
  collected_at  TIMESTAMPTZ,                   -- 데이터 수집 완료 시각
  analyzed_at   TIMESTAMPTZ,                   -- AI 분석 완료 시각
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 날짜 기준 조회 (최신 브리핑, 특정 날짜 조회)
CREATE INDEX IF NOT EXISTS idx_market_briefings_date ON market_briefings(date DESC);

-- 상태 기준 조회 (collected 상태인 것만 AI 분석 대상)
CREATE INDEX IF NOT EXISTS idx_market_briefings_status ON market_briefings(status);
