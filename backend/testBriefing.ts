// jp: 브리핑 테스트 스크립트
import { runBriefingCollection } from './src/services/briefing/briefingCollector.service';
import { runBriefingAI } from './src/services/briefing/briefingAI.service';

async function test() {
  console.log('브리핑 수집 시작...');
  const r = await runBriefingCollection('1540');
  console.log('수집 결과:', r.success, r.message);
  if (!r.briefing) {
    console.log('브리핑 없음');
    return;
  }
  console.log('AI 분석 시작...');
  const ai = await runBriefingAI(r.briefing);
  console.log('=== 결과 ===');
  console.log(JSON.stringify(ai.analysis, null, 2));
}

test().catch(console.error).finally(() => process.exit(0));
