// jp: 사용자 저장소 - 회원가입/로그인 + 내 정보 관리
import { query, isDbReady } from '../config/db';

export interface UserRow {
  id: string;
  email: string;
  nickname: string;
  password_hash: string;
}

// jp: 이메일로 조회 (로그인)
export async function findUserByEmail(email: string): Promise<UserRow | null> {
  if (!isDbReady()) return null;
  const rows = await query<UserRow>(
    `SELECT id, email, nickname, password_hash FROM users WHERE email = $1 LIMIT 1`,
    [email.toLowerCase()]
  );
  return rows[0] ?? null;
}

// jp: 이메일 존재 여부 (회원가입 중복 체크)
export async function emailExists(email: string): Promise<boolean> {
  if (!isDbReady()) return false;
  const rows = await query<{ id: string }>(
    `SELECT id FROM users WHERE email = $1 LIMIT 1`,
    [email.toLowerCase()]
  );
  return rows.length > 0;
}

// jp: 생성 (회원가입)
export async function createUser(email: string, nickname: string, passwordHash: string): Promise<UserRow> {
  const rows = await query<UserRow>(
    `INSERT INTO users (email, nickname, password_hash)
     VALUES ($1, $2, $3)
     RETURNING id, email, nickname, password_hash`,
    [email.toLowerCase(), nickname, passwordHash]
  );
  return rows[0];
}

// jp: ===== 회원가입 시 기본 관심종목 =====
// jp: 신규 가입자에게 디폴트로 들어가는 5종목 (지수 3 + 종목 2)
// jp: 코드는 시세 시스템과 일치: 국내지수 0001/2001/1001 (inquire-index)
export const DEFAULT_WATCHLIST_ITEMS: { code: string; name: string; assetType: 'stock' | 'index' }[] = [
  { code: '0001',   name: '코스피',      assetType: 'index' },
  { code: '2001',   name: '코스피200',   assetType: 'index' },
  { code: '1001',   name: '코스닥',      assetType: 'index' },
  { code: '005930', name: '삼성전자',    assetType: 'stock' },
  { code: '000660', name: 'SK하이닉스',  assetType: 'stock' },
];

// jp: 신규 유저에게 기본 관심종목 7개를 한 번에 INSERT
// jp: ON CONFLICT DO NOTHING - 혹시 중복(유저+코드 유니크)이면 조용히 무시
// jp: sort_order로 위 배열 순서 그대로 유지. group_id는 기본 그룹.
export async function seedDefaultWatchlist(userId: string): Promise<void> {
  if (!isDbReady()) return;
  // jp: 한 번의 쿼리로 7행 INSERT (VALUES 다중)
  const values: string[] = [];
  const params: unknown[] = [];
  DEFAULT_WATCHLIST_ITEMS.forEach((item, idx) => {
    const base = idx * 5;
    values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`);
    params.push(userId, item.code, item.name, item.assetType, idx);
  });
  try {
    await query(
      `INSERT INTO watchlists (user_id, stock_code, stock_name, asset_type, sort_order)
       VALUES ${values.join(', ')}
       ON CONFLICT (user_id, stock_code) DO NOTHING`,
      params
    );
  } catch (err) {
    // jp: 디폴트 추가 실패해도 회원가입 자체는 성공해야 함 (로그만)
    console.error('[seedDefaultWatchlist] 기본 관심종목 추가 실패:', err instanceof Error ? err.message : err);
  }
}

// jp: 마지막 로그인 시각 갱신
export async function touchLastLogin(userId: string): Promise<void> {
  if (!isDbReady()) return;
  try {
    await query(`UPDATE users SET last_login_at = NOW() WHERE id = $1`, [userId]);
  } catch { /* 무시 */ }
}

// jp: userId로 닉네임 조회 (커뮤니티 글 작성 시 작성자 닉네임 스냅샷용)
export async function getNicknameById(userId: string): Promise<string | null> {
  if (!isDbReady()) return null;
  const rows = await query<{ nickname: string }>(
    `SELECT nickname FROM users WHERE id = $1 LIMIT 1`,
    [userId]
  );
  return rows.length > 0 ? rows[0].nickname : null;
}

// jp: ===== 내 정보 관리 =====

// jp: userId로 전체 정보 조회 (마이페이지용 - 비번 해시 제외)
export interface UserProfile {
  id: string;
  email: string;
  nickname: string;
  created_at: string;
  last_login_at: string | null;
}
export async function getProfileById(userId: string): Promise<UserProfile | null> {
  if (!isDbReady()) return null;
  const rows = await query<UserProfile>(
    `SELECT id, email, nickname, created_at, last_login_at FROM users WHERE id = $1 LIMIT 1`,
    [userId]
  );
  return rows[0] ?? null;
}

// jp: userId로 비번 해시 조회 (비번 변경 시 현재 비번 확인용)
export async function getPasswordHashById(userId: string): Promise<string | null> {
  if (!isDbReady()) return null;
  const rows = await query<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = $1 LIMIT 1`,
    [userId]
  );
  return rows.length > 0 ? rows[0].password_hash : null;
}

// jp: 닉네임 변경
export async function updateNickname(userId: string, nickname: string): Promise<void> {
  await query(`UPDATE users SET nickname = $2 WHERE id = $1`, [userId, nickname]);
}

// jp: 비밀번호 변경 (해시 저장)
export async function updatePasswordHash(userId: string, passwordHash: string): Promise<void> {
  await query(`UPDATE users SET password_hash = $2 WHERE id = $1`, [userId, passwordHash]);
}

// jp: ===== 소셜 로그인 (네이버/카카오) =====
export interface SocialUserInput {
  provider: 'naver' | 'kakao' | 'google';
  providerId: string;
  email: string;
  nickname: string;
}

export async function findOrCreateSocialUser(input: SocialUserInput): Promise<{ user: UserRow; isNew: boolean }> {
  const { provider, providerId, email, nickname } = input;

  const existing = await query<UserRow>(
    `SELECT id, email, nickname, password_hash FROM users WHERE provider = $1 AND provider_id = $2 LIMIT 1`,
    [provider, providerId]
  );
  if (existing[0]) {
    return { user: existing[0], isNew: false };
  }

  if (email) {
    const byEmail = await query<UserRow & { provider: string }>(
      `SELECT id, email, nickname, password_hash, provider FROM users WHERE email = $1 LIMIT 1`,
      [email.toLowerCase()]
    );
    if (byEmail[0]) {
      await query(
        `UPDATE users SET provider = $1, provider_id = $2 WHERE id = $3`,
        [provider, providerId, byEmail[0].id]
      );
      return { user: { id: byEmail[0].id, email: byEmail[0].email, nickname: byEmail[0].nickname, password_hash: byEmail[0].password_hash }, isNew: false };
    }
  }

  const created = await query<UserRow>(
    `INSERT INTO users (email, nickname, password_hash, provider, provider_id)
     VALUES ($1, $2, NULL, $3, $4)
     RETURNING id, email, nickname, password_hash`,
    [email.toLowerCase(), nickname, provider, providerId]
  );
  const user = created[0];
  await seedDefaultWatchlist(user.id);
  return { user, isNew: true };
}
