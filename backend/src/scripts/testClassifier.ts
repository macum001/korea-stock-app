// jp: 공시 분류 테스트 스크립트
// jp: 실행: npm run test:disclosure-classifier

import { classifyDisclosure } from '../services/disclosure/disclosureClassifier.service';

const TEST_CASES = [
  '단일판매ㆍ공급계약체결',
  '신규시설투자 등',
  '자기주식취득 결정',
  '기술이전 계약 체결',
  '전환사채권 발행결정',
  '유상증자 결정',
  '거래정지',
  '감사의견 거절',
  '횡령ㆍ배임 혐의발생',
  '상장폐지 관련',
  '최대주주변경',
  '무상증자 결정',
  'FDA 품목허가 취득',
  '소송 등의 제기',
  '분기보고서 (2024.03)',
];

function main(): void {
  console.log('=== 공시 분류 테스트 ===\n');

  TEST_CASES.forEach(reportName => {
    const r = classifyDisclosure(reportName);
    const icon =
      r.importance === 'warning'   ? '🔴' :
      r.sentiment  === 'positive'  ? '🔵' :
      r.sentiment  === 'negative'  ? '🟠' :
      r.sentiment  === 'caution'   ? '🟡' : '⚪';

    console.log(`${icon} "${reportName}"`);
    console.log(`   importance: ${r.importance} / sentiment: ${r.sentiment}`);
    console.log(`   점수: pos=${r.positiveScore} neg=${r.negativeScore} caut=${r.cautionScore}`);
    console.log(`   키워드: [${r.matchedKeywords.join(', ')}]\n`);
  });

  process.exit(0);
}

main();
