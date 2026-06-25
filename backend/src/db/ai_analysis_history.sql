-- jp: AI 분석 히스토리 테이블
-- jp: user_id 기준 저장. 질문/답변(JSON)/관련 종목/생성시간

CREATE TABLE IF NOT EXISTS ai_analysis_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     VARCHAR(50)  NOT NULL DEFAULT 'default-user',
  kind        VARCHAR(30)  NOT NULL DEFAULT 'receipt',  -- jp: receipt(접수번호) / stock(종목질문)
  question    TEXT         NOT NULL,                     -- jp: 사용자 입력 (접수번호 또는 질문)
  receipt_no  VARCHAR(50),                               -- jp: 접수번호 분석이면 채움
  stock_code  VARCHAR(10),
  stock_name  VARCHAR(200),
  answer      JSONB        NOT NULL,                      -- jp: 분석 결과 전체 (AiAnalysisResult)
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- jp: 조회 인덱스 (user + 최신순)
CREATE INDEX IF NOT EXISTS idx_ai_history_user_created
  ON ai_analysis_history (user_id, created_at DESC);
