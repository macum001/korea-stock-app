-- jp: 주식앱 PostgreSQL 스키마 v2 - 공시 시스템 포함

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- jp: 사용자 (인증)
CREATE TABLE IF NOT EXISTS users (
  id            VARCHAR(50)  PRIMARY KEY DEFAULT gen_random_uuid()::text,
  email         VARCHAR(255) UNIQUE NOT NULL,
  nickname      VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

-- jp: DART 기업 코드 매핑 - corp_code ↔ stock_code
CREATE TABLE IF NOT EXISTS dart_companies (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  corp_code  VARCHAR(20)  NOT NULL UNIQUE,
  stock_code VARCHAR(10),
  corp_name  VARCHAR(200) NOT NULL,
  corp_cls   VARCHAR(10),
  modify_date VARCHAR(20),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- jp: 기존 테이블 마이그레이션 (CREATE IF NOT EXISTS는 기존 테이블 변경 안 하므로 ALTER 필요)
-- jp: modify_date 컬럼이 없던 구버전 테이블에 추가
ALTER TABLE dart_companies ADD COLUMN IF NOT EXISTS modify_date VARCHAR(20);
-- jp: corp_code UNIQUE 제약 (ON CONFLICT 작동용). 없으면 추가
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dart_companies_corp_code_key'
  ) THEN
    -- jp: 중복 제거 후 UNIQUE 추가 (혹시 메모리시절 중복 있으면 정리)
    DELETE FROM dart_companies a USING dart_companies b
      WHERE a.id < b.id AND a.corp_code = b.corp_code;
    ALTER TABLE dart_companies ADD CONSTRAINT dart_companies_corp_code_key UNIQUE (corp_code);
  END IF;
END $$;

-- jp: 공시
CREATE TABLE IF NOT EXISTS disclosures (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_code       VARCHAR(10),
  stock_name       VARCHAR(200),
  corp_code        VARCHAR(20),
  receipt_no       VARCHAR(50)  NOT NULL,
  report_name      VARCHAR(500) NOT NULL,
  disclosure_type  VARCHAR(100),
  importance       VARCHAR(20)  DEFAULT 'normal',
  sentiment        VARCHAR(20)  DEFAULT 'neutral',
  positive_score   INT          DEFAULT 0,
  negative_score   INT          DEFAULT 0,
  caution_score    INT          DEFAULT 0,
  matched_keywords TEXT[],
  summary          TEXT,
  original_url     TEXT,
  disclosed_at     TIMESTAMPTZ NOT NULL,
  collected_at     TIMESTAMPTZ DEFAULT NOW(),
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- jp: 기존 테이블에도 점수 컬럼 보강 (이미 생성된 DB 대비)
ALTER TABLE disclosures ADD COLUMN IF NOT EXISTS positive_score   INT DEFAULT 0;
ALTER TABLE disclosures ADD COLUMN IF NOT EXISTS negative_score   INT DEFAULT 0;
ALTER TABLE disclosures ADD COLUMN IF NOT EXISTS caution_score    INT DEFAULT 0;
ALTER TABLE disclosures ADD COLUMN IF NOT EXISTS matched_keywords TEXT[];

-- jp: 공시 알림 설정
CREATE TABLE IF NOT EXISTS disclosure_alerts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        VARCHAR(50) NOT NULL DEFAULT 'default',
  stock_code     VARCHAR(10) NOT NULL,
  important_only BOOLEAN     DEFAULT FALSE,
  keywords       TEXT[],
  is_enabled     BOOLEAN     DEFAULT TRUE,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, stock_code)
);

-- jp: 알림 히스토리
CREATE TABLE IF NOT EXISTS notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    VARCHAR(50)  NOT NULL DEFAULT 'default',
  type       VARCHAR(50)  NOT NULL,
  stock_code VARCHAR(10),
  title      VARCHAR(200) NOT NULL,
  body       TEXT,
  target_id  VARCHAR(100),
  is_read    BOOLEAN      DEFAULT FALSE,
  created_at TIMESTAMPTZ  DEFAULT NOW()
);

-- jp: 관심종목 그룹 (멀티유저 - PK는 user_id+id 복합)
CREATE TABLE IF NOT EXISTS watchlist_groups (
  id         VARCHAR(50)  NOT NULL,
  user_id    VARCHAR(50)  NOT NULL DEFAULT 'default',
  name       VARCHAR(100) NOT NULL,
  sort_order INT          DEFAULT 0,
  is_default BOOLEAN      DEFAULT FALSE,
  created_at TIMESTAMPTZ  DEFAULT NOW(),
  updated_at TIMESTAMPTZ  DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
);

-- jp: 관심종목
CREATE TABLE IF NOT EXISTS watchlists (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          VARCHAR(50)  NOT NULL DEFAULT 'default',
  stock_code       VARCHAR(10) NOT NULL,
  stock_name       VARCHAR(200),
  group_id         VARCHAR(50)  DEFAULT 'default',
  sort_order       INT          DEFAULT 0,
  memo             TEXT         DEFAULT '',
  memo_updated_at  TIMESTAMPTZ,
  price_alert      BOOLEAN      DEFAULT FALSE,
  disclosure_alert BOOLEAN      DEFAULT FALSE,
  created_at       TIMESTAMPTZ  DEFAULT NOW(),
  UNIQUE(user_id, stock_code)
);

-- jp: 종목 알림 조건 (가격/등락률/거래량/공시)
CREATE TABLE IF NOT EXISTS stock_alert_conditions (
  id                VARCHAR(60)  PRIMARY KEY,
  user_id           VARCHAR(50)  NOT NULL DEFAULT 'default',
  stock_code        VARCHAR(10)  NOT NULL,
  stock_name        VARCHAR(200),
  type              VARCHAR(40)  NOT NULL,
  value             DECIMAL(16,2),
  keyword           VARCHAR(200),
  is_enabled        BOOLEAN      DEFAULT TRUE,
  cooldown_minutes  INT          DEFAULT 10,
  last_triggered_at TIMESTAMPTZ,
  created_at        TIMESTAMPTZ  DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  DEFAULT NOW()
);

-- jp: 공시 AI 분석 컬럼 (Claude API로 수집 시 생성, feature flag로 보호)
-- jp: 기존 테이블 마이그레이션 - 없으면 추가
ALTER TABLE disclosures ADD COLUMN IF NOT EXISTS ai_summary       TEXT;
ALTER TABLE disclosures ADD COLUMN IF NOT EXISTS ai_key_points    JSONB;
ALTER TABLE disclosures ADD COLUMN IF NOT EXISTS ai_investor_note TEXT;
ALTER TABLE disclosures ADD COLUMN IF NOT EXISTS ai_risk_note     TEXT;
ALTER TABLE disclosures ADD COLUMN IF NOT EXISTS impact_level     VARCHAR(30);
ALTER TABLE disclosures ADD COLUMN IF NOT EXISTS confidence_score INTEGER;
ALTER TABLE disclosures ADD COLUMN IF NOT EXISTS ai_analyzed_at   TIMESTAMPTZ;
ALTER TABLE disclosures ADD COLUMN IF NOT EXISTS ai_model         VARCHAR(100);
ALTER TABLE disclosures ADD COLUMN IF NOT EXISTS ai_status        VARCHAR(30) DEFAULT 'pending';
CREATE INDEX IF NOT EXISTS idx_disclosures_ai_status ON disclosures(ai_status);

-- jp: 공시 10년치 backfill 작업 진행상태 (중단 후 재개 가능)
CREATE TABLE IF NOT EXISTS disclosure_backfill_jobs (
  id                  SERIAL PRIMARY KEY,
  status              VARCHAR(20) DEFAULT 'pending',  -- jp: pending/running/paused/done/failed
  total_companies     INTEGER DEFAULT 0,
  processed_companies INTEGER DEFAULT 0,
  inserted_count      INTEGER DEFAULT 0,
  duplicated_count    INTEGER DEFAULT 0,
  failed_count        INTEGER DEFAULT 0,
  last_stock_code     VARCHAR(10),
  error_log           TEXT,
  started_at          TIMESTAMPTZ,
  finished_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- jp: 전 종목 마스터 (KOSPI/KOSDAQ 전체 - 검색/관심추가용)
-- jp: KIS 마스터 파일(.mst)에서 매일 수집. 가격은 별도(stock_prices), 여긴 메타만
CREATE TABLE IF NOT EXISTS stock_master (
  code        VARCHAR(10)  PRIMARY KEY,
  name        VARCHAR(80)  NOT NULL,
  market      VARCHAR(10)  NOT NULL,          -- jp: KOSPI / KOSDAQ
  sector      VARCHAR(80),                    -- jp: 업종(있으면)
  is_etf      BOOLEAN      DEFAULT FALSE,
  updated_at  TIMESTAMPTZ  DEFAULT NOW()
);

-- jp: 현재가 히스토리
-- jp: 현재가 (종목당 1행만 유지 - 무한 증가 방지, stale fallback용)
-- jp: 기존 테이블이 옛 구조(id BIGSERIAL, created_at)면 정리 (fallback 데이터라 재수집됨)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'stock_prices' AND column_name = 'id') THEN
    DROP TABLE stock_prices;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS stock_prices (
  stock_code  VARCHAR(10)    PRIMARY KEY,
  price       INT            NOT NULL,
  change      INT            NOT NULL,
  change_rate DECIMAL(8,2)   NOT NULL,
  volume      BIGINT,
  updated_at  TIMESTAMPTZ    DEFAULT NOW()
);

-- jp: 인덱스
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
-- jp: 종목 검색 - 이름 부분일치(LIKE) 가속용
CREATE INDEX IF NOT EXISTS idx_stock_master_name   ON stock_master(name);
CREATE INDEX IF NOT EXISTS idx_stock_master_market ON stock_master(market);
CREATE UNIQUE INDEX IF NOT EXISTS idx_dart_companies_corp_code  ON dart_companies(corp_code);
CREATE INDEX        IF NOT EXISTS idx_dart_companies_stock_code ON dart_companies(stock_code);

CREATE UNIQUE INDEX IF NOT EXISTS idx_disclosures_receipt_no   ON disclosures(receipt_no);
CREATE INDEX        IF NOT EXISTS idx_disclosures_stock_code   ON disclosures(stock_code);
CREATE INDEX        IF NOT EXISTS idx_disclosures_corp_code    ON disclosures(corp_code);
CREATE INDEX        IF NOT EXISTS idx_disclosures_disclosed_at ON disclosures(disclosed_at DESC);
CREATE INDEX        IF NOT EXISTS idx_disclosures_importance   ON disclosures(importance);

CREATE INDEX IF NOT EXISTS idx_disclosure_alerts_user_id    ON disclosure_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_disclosure_alerts_stock_code ON disclosure_alerts(stock_code);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id    ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read    ON notifications(is_read);

CREATE INDEX IF NOT EXISTS idx_watchlists_user_id    ON watchlists(user_id);
CREATE INDEX IF NOT EXISTS idx_watchlists_stock_code ON watchlists(stock_code);
CREATE INDEX IF NOT EXISTS idx_watchlists_group_id   ON watchlists(group_id);

CREATE INDEX IF NOT EXISTS idx_watchlist_groups_user ON watchlist_groups(user_id);
CREATE INDEX IF NOT EXISTS idx_alert_conditions_user ON stock_alert_conditions(user_id);
CREATE INDEX IF NOT EXISTS idx_alert_conditions_code ON stock_alert_conditions(stock_code);

-- jp: stock_prices는 stock_code가 PK라 별도 인덱스 불필요 (종목당 1행)
-- jp: 성능 - 공시 조회 최적화
CREATE INDEX IF NOT EXISTS idx_disclosures_stock_disclosed     ON disclosures(stock_code, disclosed_at DESC);
CREATE INDEX IF NOT EXISTS idx_disclosures_importance_disclosed ON disclosures(importance, disclosed_at DESC);
CREATE INDEX IF NOT EXISTS idx_disclosures_sentiment_disclosed  ON disclosures(sentiment, disclosed_at DESC);
-- jp: 성능 - 알림/관심종목 조회 최적화
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_watchlists_user_group      ON watchlists(user_id, group_id);

-- jp: 초기 DART 기업 매핑 데이터
INSERT INTO dart_companies (corp_code, stock_code, corp_name, corp_cls) VALUES
  ('00164779', '000660', 'SK하이닉스',      'Y'),
  ('00126380', '005930', '삼성전자',         'Y'),
  ('00918444', '042700', '한미반도체',       'K'),
  ('00916184', '196170', '알테오젠',         'K'),
  ('00105947', '034020', '두산에너빌리티',   'Y'),
  ('00526929', '035720', '카카오',           'K'),
  ('00119650', '035420', 'NAVER',            'Y'),
  ('00861032', '207940', '삼성바이오로직스', 'Y')
ON CONFLICT (corp_code) DO UPDATE SET
  stock_code = EXCLUDED.stock_code,
  corp_name  = EXCLUDED.corp_name,
  updated_at = NOW();

-- jp: 기본 관심종목 그룹 (게스트/데모용 default 사용자)
INSERT INTO watchlist_groups (id, user_id, name, sort_order, is_default) VALUES
  ('default', 'default', '기본', 0, TRUE)
ON CONFLICT (user_id, id) DO NOTHING;

-- ============================================================
-- jp: 종목별 커뮤니티 (게시글/댓글/좋아요)
-- ============================================================

-- jp: 게시글
CREATE TABLE IF NOT EXISTS community_posts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_code  VARCHAR(10)  NOT NULL,
  user_id     VARCHAR(50)  NOT NULL,
  nickname    VARCHAR(100) NOT NULL,         -- jp: 작성 시점 닉네임 스냅샷
  content     TEXT         NOT NULL,
  like_count  INT          DEFAULT 0,
  comment_count INT        DEFAULT 0,
  created_at  TIMESTAMPTZ  DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_community_posts_stock ON community_posts(stock_code, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_posts_user ON community_posts(user_id);

-- jp: 댓글
CREATE TABLE IF NOT EXISTS community_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     UUID         NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  user_id     VARCHAR(50)  NOT NULL,
  nickname    VARCHAR(100) NOT NULL,
  content     TEXT         NOT NULL,
  created_at  TIMESTAMPTZ  DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_community_comments_post ON community_comments(post_id, created_at ASC);

-- jp: 좋아요 (게시글당 사용자 1회 - 중복 방지)
CREATE TABLE IF NOT EXISTS community_likes (
  post_id     UUID         NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  user_id     VARCHAR(50)  NOT NULL,
  created_at  TIMESTAMPTZ  DEFAULT NOW(),
  PRIMARY KEY (post_id, user_id)
);

-- ============================================================
-- jp: 공시 분류 플래그 (탭 필터용) - 기존 테이블에도 컬럼 추가
-- ============================================================
ALTER TABLE disclosures ADD COLUMN IF NOT EXISTS is_important   BOOLEAN DEFAULT FALSE;
ALTER TABLE disclosures ADD COLUMN IF NOT EXISTS is_capital     BOOLEAN DEFAULT FALSE;
ALTER TABLE disclosures ADD COLUMN IF NOT EXISTS is_good        BOOLEAN DEFAULT FALSE;
ALTER TABLE disclosures ADD COLUMN IF NOT EXISTS is_bad         BOOLEAN DEFAULT FALSE;
ALTER TABLE disclosures ADD COLUMN IF NOT EXISTS is_correction  BOOLEAN DEFAULT FALSE;
ALTER TABLE disclosures ADD COLUMN IF NOT EXISTS normalized_title TEXT;
ALTER TABLE disclosures ADD COLUMN IF NOT EXISTS category       VARCHAR(20);
ALTER TABLE disclosures ADD COLUMN IF NOT EXISTS category_type  VARCHAR(20);
-- jp: 탭 필터 인덱스 (중요/자본조달/호재/악재 조회 빠르게)
CREATE INDEX IF NOT EXISTS idx_disclosures_flags ON disclosures(is_important, is_capital, is_good, is_bad);
-- jp: 종류 축 탭 필터 인덱스 (6개 탭 조회 빠르게)
CREATE INDEX IF NOT EXISTS idx_disclosures_category_type ON disclosures(category_type, disclosed_at DESC);

-- jp: 아래 내용을 backend/src/db/schema.sql 맨 아래에 추가하세요.

-- jp: FCM 푸시 토큰 저장 (한 사용자가 여러 기기 가능)
CREATE TABLE IF NOT EXISTS fcm_tokens (
  id          SERIAL PRIMARY KEY,
  user_id     VARCHAR(100) NOT NULL,
  token       TEXT NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fcm_tokens_user ON fcm_tokens(user_id);

-- jp: 아래 내용을 backend/src/db/schema.sql 맨 아래에 추가하세요.
-- jp: disclosure_alerts에 5종 공시 알림 플래그 추가 (기존 컬럼 유지, 하위호환)

ALTER TABLE disclosure_alerts ADD COLUMN IF NOT EXISTS alert_all       BOOLEAN DEFAULT FALSE;
ALTER TABLE disclosure_alerts ADD COLUMN IF NOT EXISTS alert_important BOOLEAN DEFAULT TRUE;
ALTER TABLE disclosure_alerts ADD COLUMN IF NOT EXISTS alert_capital   BOOLEAN DEFAULT TRUE;
ALTER TABLE disclosure_alerts ADD COLUMN IF NOT EXISTS alert_good      BOOLEAN DEFAULT TRUE;
ALTER TABLE disclosure_alerts ADD COLUMN IF NOT EXISTS alert_bad       BOOLEAN DEFAULT TRUE;




-- jp: �Ϻ� ĵ�� ���̺� (10��ġ �̻� ����)
CREATE TABLE IF NOT EXISTS stock_daily_candles (stock_code VARCHAR(10) NOT NULL, candle_date INTEGER NOT NULL, period CHAR(1) NOT NULL DEFAULT 'D', open INTEGER NOT NULL, high INTEGER NOT NULL, low INTEGER NOT NULL, close INTEGER NOT NULL, volume BIGINT DEFAULT 0, trade_value BIGINT DEFAULT 0, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (stock_code, candle_date, period));
CREATE INDEX IF NOT EXISTS idx_daily_candles_code_date ON stock_daily_candles (stock_code, candle_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_candles_code_period_date ON stock_daily_candles (stock_code, period, candle_date DESC);

-- ============================================================
-- jp: 장마감/재연결용 시장 스냅샷
-- jp: Redis가 비어도 종가 기준 화면을 복구할 수 있게 DB 저장 구조를 둔다.
-- ============================================================
CREATE TABLE IF NOT EXISTS market_snapshots (
  stock_code  VARCHAR(10) PRIMARY KEY,
  trade_date  DATE NOT NULL,
  status      VARCHAR(20) NOT NULL DEFAULT 'CLOSED',
  last_price  JSONB,
  orderbook   JSONB,
  trades      JSONB DEFAULT '[]'::jsonb,
  updated_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_market_snapshots_trade_date ON market_snapshots(trade_date DESC);

-- ============================================================
-- jp: 투자자별 일별 수급
-- jp: 체결 tick으로 계산하지 않고 별도 데이터 소스(KIS/거래소)로 적재해야 한다.
-- ============================================================
CREATE TABLE IF NOT EXISTS stock_daily_investor_flows (
  stock_code      VARCHAR(10) NOT NULL,
  trade_date      DATE NOT NULL,
  investor_type   VARCHAR(30) NOT NULL,
  buy_volume      BIGINT DEFAULT 0,
  sell_volume     BIGINT DEFAULT 0,
  net_buy_volume  BIGINT DEFAULT 0,
  buy_value       BIGINT DEFAULT 0,
  sell_value      BIGINT DEFAULT 0,
  net_buy_value   BIGINT DEFAULT 0,
  data_status     VARCHAR(20) NOT NULL DEFAULT 'DELAYED',
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (stock_code, trade_date, investor_type)
);
CREATE INDEX IF NOT EXISTS idx_investor_flows_code_date ON stock_daily_investor_flows(stock_code, trade_date DESC);
CREATE INDEX IF NOT EXISTS idx_investor_flows_type_date ON stock_daily_investor_flows(investor_type, trade_date DESC);

-- ============================================================
-- jp: 자체 1분봉 원본 테이블
-- jp: 실시간 trade tick으로 1분봉을 만들고, 3/5/10/15/30/60/120/240분봉은 이 원본에서 집계한다.
-- ============================================================
CREATE TABLE IF NOT EXISTS minute_candles (
  stock_code  VARCHAR(10) NOT NULL,
  candle_time BIGINT NOT NULL,
  open        INTEGER NOT NULL,
  high        INTEGER NOT NULL,
  low         INTEGER NOT NULL,
  close       INTEGER NOT NULL,
  volume      BIGINT DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (stock_code, candle_time)
);
CREATE INDEX IF NOT EXISTS idx_minute_candles_code_time ON minute_candles(stock_code, candle_time DESC);
