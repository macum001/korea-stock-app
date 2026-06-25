// jp: mock 공시 데이터 - 실제 OpenDART API 연결 전 테스트용
// jp: 수정: import 경로 ../types/disclosure → ../../types/disclosure

import { Disclosure } from '../../types/disclosure';

const now = Date.now();

export const MOCK_DISCLOSURES: Disclosure[] = [
  {
    id:             'mock-d001',
    stockCode:      '000660',
    stockName:      'SK하이닉스',
    corpCode:       '00164779',
    receiptNo:      '20240615000101',
    reportName:     '단일판매공급계약체결',
    disclosureType: '주요사항보고',
    importance:     'important',
    sentiment:      'positive',
    positiveScore:  90,
    negativeScore:  5,
    cautionScore:   5,
    matchedKeywords: ['계약', 'NVIDIA', 'HBM'],
    summary:        'SK하이닉스는 HBM3E 메모리 반도체를 NVIDIA에 공급하는 계약을 체결했습니다. 계약 규모는 약 2조 3,000억원으로 2025년 1분기부터 공급 예정입니다.',
    originalUrl:    'https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20240615000101',
    disclosedAt:    new Date(now - 1000 * 60 * 30).toISOString(),
    collectedAt:    new Date().toISOString(),
    isImportant:    true,
    isCapital:      false,
    isGood:         true,
    isBad:          false,
    isCorrection:   false,
    normalizedTitle: '단일판매공급계약체결',
    category:       'good',
  },
  {
    id:             'mock-d002',
    stockCode:      '000660',
    stockName:      'SK하이닉스',
    corpCode:       '00164779',
    receiptNo:      '20240614000102',
    reportName:     '유상증자 결정',
    disclosureType: '주요사항보고',
    importance:     'important',
    sentiment:      'positive',
    positiveScore:  80,
    negativeScore:  10,
    cautionScore:   10,
    matchedKeywords: ['유상증자', 'HBM', '투자'],
    summary:        'SK하이닉스는 차세대 HBM 생산 라인 증설을 위한 시설 투자로 총 5조원 규모의 유상증자를 2026년까지 진행할 예정입니다.',
    originalUrl:    'https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20240614000102',
    disclosedAt:    new Date(now - 1000 * 60 * 60 * 3).toISOString(),
    collectedAt:    new Date().toISOString(),
    isImportant:    true,
    isCapital:      true,
    isGood:         false,
    isBad:          false,
    isCorrection:   false,
    normalizedTitle: '유상증자결정',
    category:       'capital',
  },
  {
    id:             'mock-d003',
    stockCode:      '005930',
    stockName:      '삼성전자',
    corpCode:       '00126380',
    receiptNo:      '20240615000201',
    reportName:     '자기주식취득 결정',
    disclosureType: '주요사항보고',
    importance:     'important',
    sentiment:      'positive',
    positiveScore:  85,
    negativeScore:  5,
    cautionScore:   10,
    matchedKeywords: ['자사주', '취득'],
    summary:        '삼성전자는 주주가치 제고를 위해 보통주 5,000만주, 약 3조 7,500억원 규모의 자기주식 취득을 결정했습니다. 취득 기간은 2024년 6월 9일부터입니다.',
    originalUrl:    'https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20240615000201',
    disclosedAt:    new Date(now - 1000 * 60 * 45).toISOString(),
    collectedAt:    new Date().toISOString(),
    isImportant:    true,
    isCapital:      false,
    isGood:         true,
    isBad:          false,
    isCorrection:   false,
    normalizedTitle: '자기주식취득결정',
    category:       'good',
  },
  {
    id:             'mock-d006',
    stockCode:      '034020',
    stockName:      '두산에너빌리티',
    corpCode:       '00105947',
    receiptNo:      '20240615000501',
    reportName:     '유상증자 및 채권발행결정',
    disclosureType: '주요사항보고',
    importance:     'warning',
    sentiment:      'negative',
    positiveScore:  20,
    negativeScore:  70,
    cautionScore:   10,
    matchedKeywords: ['유상증자', '채권'],
    summary:        '두산에너빌리티는 재무 구조 개선을 위해 3,000억원 규모의 유상증자를 진행할 계획입니다. 발행 가격은 주당 18,500원입니다.',
    originalUrl:    'https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20240615000501',
    disclosedAt:    new Date(now - 1000 * 60 * 90).toISOString(),
    collectedAt:    new Date().toISOString(),
    isImportant:    false,
    isCapital:      true,
    isGood:         false,
    isBad:          true,
    isCorrection:   false,
    normalizedTitle: '유상증자및채권발행결정',
    category:       'bad',
  },
];

export function getMockDisclosuresByStock(stockCode: string): Disclosure[] {
  return MOCK_DISCLOSURES
    .filter(d => d.stockCode === stockCode)
    .sort((a, b) => new Date(b.disclosedAt).getTime() - new Date(a.disclosedAt).getTime());
}

export function getMockImportantDisclosures(): Disclosure[] {
  return MOCK_DISCLOSURES
    .filter(d => d.importance !== 'normal')
    .sort((a, b) => new Date(b.disclosedAt).getTime() - new Date(a.disclosedAt).getTime());
}

export function searchMockDisclosures(keyword: string): Disclosure[] {
  const kw = keyword.toLowerCase();
  return MOCK_DISCLOSURES
    .filter(d =>
      d.reportName.toLowerCase().includes(kw) ||
      (d.stockName ?? '').toLowerCase().includes(kw) ||
      (d.summary ?? '').toLowerCase().includes(kw)
    )
    .sort((a, b) => new Date(b.disclosedAt).getTime() - new Date(a.disclosedAt).getTime());
}
