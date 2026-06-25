// jp: 관리자 계정 repository (user.repository 패턴 따름)

import { query } from '../config/db';

export interface AdminUserRow {
  id: string;
  username: string;
  password_hash: string;
  name: string;
  role: string;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
}

// jp: username으로 조회 (로그인용)
export async function findAdminByUsername(username: string): Promise<AdminUserRow | null> {
  const rows = await query<AdminUserRow>(
    `SELECT id, username, password_hash, name, role, is_active, last_login_at, created_at
       FROM admin_users WHERE username = $1 LIMIT 1`,
    [username.toLowerCase()]
  );
  return rows[0] ?? null;
}

// jp: id로 조회
export async function findAdminById(id: string): Promise<AdminUserRow | null> {
  const rows = await query<AdminUserRow>(
    `SELECT id, username, password_hash, name, role, is_active, last_login_at, created_at
       FROM admin_users WHERE id = $1 LIMIT 1`,
    [id]
  );
  return rows[0] ?? null;
}

// jp: username 존재 확인
export async function adminUsernameExists(username: string): Promise<boolean> {
  const rows = await query<{ exists: boolean }>(
    `SELECT EXISTS(SELECT 1 FROM admin_users WHERE username = $1) AS exists`,
    [username.toLowerCase()]
  );
  return rows[0]?.exists ?? false;
}

// jp: 관리자 생성 (시드/추가용)
export async function createAdmin(
  username: string,
  passwordHash: string,
  name: string,
  role: string
): Promise<AdminUserRow> {
  const rows = await query<AdminUserRow>(
    `INSERT INTO admin_users (username, password_hash, name, role)
     VALUES ($1, $2, $3, $4)
     RETURNING id, username, password_hash, name, role, is_active, last_login_at, created_at`,
    [username.toLowerCase(), passwordHash, name, role]
  );
  return rows[0];
}

// jp: 마지막 로그인 시각 갱신
export async function touchAdminLogin(id: string): Promise<void> {
  await query(`UPDATE admin_users SET last_login_at = now() WHERE id = $1`, [id]);
}

// jp: 관리자 목록 (어드민 관리 화면용 - 비밀번호 제외)
export async function listAdmins(): Promise<Omit<AdminUserRow, 'password_hash'>[]> {
  return query<Omit<AdminUserRow, 'password_hash'>>(
    `SELECT id, username, name, role, is_active, last_login_at, created_at
       FROM admin_users ORDER BY created_at ASC`
  );
}
