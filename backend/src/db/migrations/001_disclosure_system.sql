-- jp: 공시 시스템 마이그레이션 001
-- jp: disclosures 테이블에 점수 컬럼 추가 (기존 테이블 있을 때)

-- jp: 점수 컬럼 추가 (이미 있으면 무시)
ALTER TABLE disclosures ADD COLUMN IF NOT EXISTS positive_score   INT DEFAULT 0;
ALTER TABLE disclosures ADD COLUMN IF NOT EXISTS negative_score   INT DEFAULT 0;
ALTER TABLE disclosures ADD COLUMN IF NOT EXISTS caution_score    INT DEFAULT 0;
ALTER TABLE disclosures ADD COLUMN IF NOT EXISTS matched_keywords TEXT[];

-- jp: dart_companies modify_date 컬럼
ALTER TABLE dart_companies ADD COLUMN IF NOT EXISTS modify_date VARCHAR(20);

-- jp: 인덱스 재확인
CREATE UNIQUE INDEX IF NOT EXISTS idx_disclosures_receipt_no ON disclosures(receipt_no);
CREATE INDEX IF NOT EXISTS idx_disclosures_importance ON disclosures(importance);
