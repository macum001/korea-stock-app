-- jp: PostgreSQL 초기화 스크립트
-- jp: Docker 최초 실행 시 1회 실행됨 (이미 있으면 건너뜀)

-- jp: 확장
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- jp: 타임존
SET timezone = 'Asia/Seoul';
