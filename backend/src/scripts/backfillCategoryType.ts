// jp: 기존 공시 category_type 백필 스크립트 (종류 축 6분류)
// jp: 실행: npm run disclosure:backfill-category
// jp: category_type IS NULL인 공시를 배치로 읽어 classifyCategoryType() 적용 후 UPDATE
// jp: 안전: UPDATE만 수행. 여러 번 실행해도 NULL인 것만 채움 (재실행 안전).

import { connectDB, query } from '../config/db';
import { classifyCategoryType } from '../services/disclosure/disclosureClassifier.service';

const BATCH_SIZE = 2000;

async function main(): Promise<void> {
  console.log('=== category_type 백필 시작 ===');
  await connectDB();

  // jp: 전체 대상 건수 (진행률 표시용)
  const totalRows = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM disclosures WHERE category_type IS NULL`
  );
  const total = parseInt(totalRows[0]?.count ?? '0', 10);
  console.log(`대상(category_type IS NULL): ${total.toLocaleString()}건`);
  if (total === 0) {
    console.log('✅ 백필할 데이터가 없습니다. (이미 완료)');
    process.exit(0);
  }

  let processed = 0;
  const startedAt = Date.now();

  // jp: NULL이 남아있는 동안 배치 반복
  while (true) {
    const rows = await query<{ id: string; report_name: string }>(
      `SELECT id, report_name FROM disclosures
       WHERE category_type IS NULL
       LIMIT $1`,
      [BATCH_SIZE]
    );
    if (rows.length === 0) break;

    // jp: 분류 결과를 카테고리별로 묶어 UPDATE (카테고리당 1쿼리)
    const byCategory = new Map<string, string[]>();
    for (const row of rows) {
      const cat = classifyCategoryType(row.report_name);
      if (!byCategory.has(cat)) byCategory.set(cat, []);
      byCategory.get(cat)!.push(row.id);
    }

    for (const [cat, ids] of byCategory) {
      await query(
        `UPDATE disclosures SET category_type = $1 WHERE id = ANY($2::uuid[])`,
        [cat, ids]
      );
    }

    processed += rows.length;
    const pct = ((processed / total) * 100).toFixed(1);
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(0);
    console.log(`  ${processed.toLocaleString()} / ${total.toLocaleString()} (${pct}%) — ${elapsed}s`);
  }

  // jp: 백필 결과 — 카테고리별 분포
  console.log('\n=== 백필 완료 — 카테고리별 분포 ===');
  const dist = await query<{ category_type: string; count: string }>(
    `SELECT category_type, COUNT(*)::text AS count
     FROM disclosures
     GROUP BY category_type
     ORDER BY COUNT(*) DESC`
  );
  for (const d of dist) {
    console.log(`  ${(d.category_type ?? 'NULL').padEnd(8)} : ${parseInt(d.count, 10).toLocaleString()}건`);
  }

  console.log('\n✅ category_type 백필 완료');
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ 백필 실패:', err instanceof Error ? err.message : err);
  process.exit(1);
});
