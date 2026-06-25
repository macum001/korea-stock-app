// jp: 관리자 계정 생성 스크립트
// jp: 사용법: npx ts-node src/scripts/createAdmin.ts <username> <password> [name] [role]
// jp: 예: npx ts-node src/scripts/createAdmin.ts admin MyP@ssw0rd "운영자" super
// jp: 비밀번호는 bcrypt 해시로 저장 (평문 저장 안 함)

import bcrypt from 'bcryptjs';
import * as admins from '../repositories/adminUser.repository';
import { db } from '../config/db';

async function main() {
  const [, , username, password, name = '', role = 'admin'] = process.argv;

  if (!username || !password) {
    console.error('사용법: npx ts-node src/scripts/createAdmin.ts <username> <password> [name] [role]');
    console.error('  role: super | admin | viewer (기본 admin)');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('비밀번호는 8자 이상이어야 해요.');
    process.exit(1);
  }
  if (!['super', 'admin', 'viewer'].includes(role)) {
    console.error('role은 super / admin / viewer 중 하나여야 해요.');
    process.exit(1);
  }

  try {
    if (await admins.adminUsernameExists(username)) {
      console.error(`이미 존재하는 아이디예요: ${username}`);
      process.exit(1);
    }

    const hash = await bcrypt.hash(password, 10);
    const admin = await admins.createAdmin(username, hash, name || username, role);

    console.log('✅ 관리자 계정 생성 완료');
    console.log(`   아이디: ${admin.username}`);
    console.log(`   이름:   ${admin.name}`);
    console.log(`   권한:   ${admin.role}`);
    console.log('   (비밀번호는 해시로 저장됐어요. 평문은 저장 안 됨)');
  } catch (err) {
    console.error('생성 실패:', err instanceof Error ? err.message : err);
    process.exit(1);
  } finally {
    // jp: DB 연결 종료
    try { await db.end(); } catch { /* noop */ }
  }
}

void main();
