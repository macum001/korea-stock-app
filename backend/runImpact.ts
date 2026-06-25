// jp: 공시 가격영향 재계산 수동 실행 스크립트
import { runImpactRecompute } from './src/jobs/disclosureImpact.job';

async function main() {
  console.log('공시 가격영향 재계산 시작...');
  console.log('(2000개씩 20배치 = 최대 40,000개 처리)');
  const r = await runImpactRecompute('manual');
  console.log('결과:', r);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
