-- jp: 관리자 계정 테이블 (일반 users와 분리)
-- jp: 비밀번호는 bcrypt 해시만 저장 (평문 절대 금지)

CREATE TABLE IF NOT EXISTS admin_users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username      VARCHAR(50)  NOT NULL UNIQUE,    -- jp: 관리자 로그인 아이디
  password_hash VARCHAR(200) NOT NULL,           -- jp: bcrypt 해시
  name          VARCHAR(100) NOT NULL DEFAULT '',-- jp: 표시용 이름
  role          VARCHAR(20)  NOT NULL DEFAULT 'admin',  -- jp: super / admin / viewer
  is_active     BOOLEAN      NOT NULL DEFAULT true,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_users_username ON admin_users (username);
