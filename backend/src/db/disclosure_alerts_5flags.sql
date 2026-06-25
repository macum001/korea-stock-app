-- jp: 아래 내용을 backend/src/db/schema.sql 맨 아래에 추가하세요.
-- jp: disclosure_alerts에 5종 공시 알림 플래그 추가 (기존 컬럼 유지, 하위호환)

ALTER TABLE disclosure_alerts ADD COLUMN IF NOT EXISTS alert_all       BOOLEAN DEFAULT FALSE;
ALTER TABLE disclosure_alerts ADD COLUMN IF NOT EXISTS alert_important BOOLEAN DEFAULT TRUE;
ALTER TABLE disclosure_alerts ADD COLUMN IF NOT EXISTS alert_capital   BOOLEAN DEFAULT TRUE;
ALTER TABLE disclosure_alerts ADD COLUMN IF NOT EXISTS alert_good      BOOLEAN DEFAULT TRUE;
ALTER TABLE disclosure_alerts ADD COLUMN IF NOT EXISTS alert_bad       BOOLEAN DEFAULT TRUE;
