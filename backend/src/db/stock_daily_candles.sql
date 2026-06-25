-- jp: 일봉 캔들 테이블 (10년치 이상 저장)
-- jp: minute_candles와 동일한 구조, 주봉/월봉/년봉도 여기서 집계
-- jp: candle_date: YYYYMMDD 정수 (예: 20240621)
-- jp: period: 'D'=일봉, 'W'=주봉, 'M'=월봉, 'Y'=년봉

CREATE TABLE IF NOT EXISTS stock_daily_candles (
  stock_code   VARCHAR(10)  NOT NULL,
  candle_date  INTEGER      NOT NULL,  -- jp: YYYYMMDD
  period       CHAR(1)      NOT NULL DEFAULT 'D',
  open         INTEGER      NOT NULL,
  high         INTEGER      NOT NULL,
  low          INTEGER      NOT NULL,
  close        INTEGER      NOT NULL,
  volume       BIGINT       DEFAULT 0,
  trade_value  BIGINT       DEFAULT 0,  -- jp: 거래대금 (원)
  created_at   TIMESTAMPTZ  DEFAULT now(),
  updated_at   TIMESTAMPTZ  DEFAULT now(),
  PRIMARY KEY (stock_code, candle_date, period)
);

-- jp: 조회 성능 인덱스
CREATE INDEX IF NOT EXISTS idx_daily_candles_code_date
  ON stock_daily_candles (stock_code, candle_date DESC);

CREATE INDEX IF NOT EXISTS idx_daily_candles_code_period_date
  ON stock_daily_candles (stock_code, period, candle_date DESC);
