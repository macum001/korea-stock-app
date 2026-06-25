// jp: PostgreSQL 연결 설정

import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ENV } from './env';

// jp: 커넥션 풀 - 실제 운영에서는 max를 조정
export const db = new Pool({
  connectionString: ENV.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// jp: DB 사용 가능 여부 (연결 실패 시 false → 상용에서는 빈/오류 응답, 개발 mock은 명시 설정일 때만)
let dbReady = false;
export function isDbReady(): boolean {
  return dbReady;
}

// jp: 연결 테스트 + 스키마 자동 생성
export async function connectDB(): Promise<void> {
  try {
    const client = await db.connect();
    console.log('[DB] PostgreSQL 연결 성공');

    // jp: schema.sql 실행 (CREATE TABLE IF NOT EXISTS 라서 반복 실행 안전)
    try {
      // jp: dev(ts-node)는 src/db, build 후엔 dist/db - 둘 다 시도
      const candidates = [
        join(__dirname, '../db/schema.sql'),
        join(process.cwd(), 'src/db/schema.sql'),
      ];
      let schema = '';
      for (const p of candidates) {
        try { schema = readFileSync(p, 'utf-8'); break; } catch { /* 다음 후보 */ }
      }
      if (schema) {
        await client.query(schema);
        console.log('[DB] 스키마 적용 완료 (테이블 생성/확인)');
      } else {
        console.warn('[DB] schema.sql 파일을 찾지 못했어요.');
      }
    } catch (schemaErr) {
      console.error('[DB] 스키마 적용 실패:', schemaErr instanceof Error ? schemaErr.message : schemaErr);
    }

    client.release();
    dbReady = true;
  } catch (err) {
    console.error('[DB] PostgreSQL 연결 실패:', err instanceof Error ? err.message : err);
    dbReady = false;
    // jp: 서버는 뜨게 하되, 실제 데이터 API는 stale/empty/error로 응답하게 유지
  }
}

// jp: 쿼리 헬퍼 - 에러 로깅 포함
export async function query<T = unknown>(
  sql: string,
  params?: unknown[]
): Promise<T[]> {
  try {
    const result = await db.query(sql, params);
    return result.rows as T[];
  } catch (err) {
    console.error('[DB] 쿼리 에러:', sql.slice(0, 80));
    throw err;
  }
}
