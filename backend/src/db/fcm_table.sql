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
