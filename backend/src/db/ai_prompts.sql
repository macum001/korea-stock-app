-- jp: AI 프롬프트 관리 테이블
-- jp: key로 프롬프트 식별. DB에 있으면 그걸, 없으면 코드 기본값 사용.

CREATE TABLE IF NOT EXISTS ai_prompts (
  prompt_key  VARCHAR(50)  PRIMARY KEY,   -- jp: 'disclosure_system' 등
  name        VARCHAR(100) NOT NULL,       -- jp: 표시용 이름
  description TEXT,                          -- jp: 이 프롬프트 설명
  content     TEXT         NOT NULL,        -- jp: 실제 프롬프트 내용
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_by  VARCHAR(50)                   -- jp: 마지막 수정 관리자
);
