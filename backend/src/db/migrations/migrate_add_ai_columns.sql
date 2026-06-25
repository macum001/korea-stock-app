-- jp: 공시 AI 분석 확장 컬럼 추가
-- jp: ai_key_numbers: 핵심 숫자 배열 [{label, value}] JSON
-- jp: ai_timeline: 주요 일정 흐름 텍스트
-- jp: 기존 데이터에 영향 없음 (NULL 허용)

ALTER TABLE disclosures
  ADD COLUMN IF NOT EXISTS ai_key_numbers  jsonb    DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS ai_timeline     text     DEFAULT '';

-- jp: 인덱스 (선택 — ai_key_numbers로 검색할 일 생기면)
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_disclosures_ai_key_numbers
--   ON disclosures USING gin (ai_key_numbers);

COMMENT ON COLUMN disclosures.ai_key_numbers IS 'AI가 추출한 핵심 숫자 배열 [{label, value}]';
COMMENT ON COLUMN disclosures.ai_timeline    IS 'AI가 정리한 주요 일정 흐름 (이사회→청약→납입→상장 등)';
