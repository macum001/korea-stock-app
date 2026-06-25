// jp: 테마 매핑 테이블 - 주요 테마별 핵심 종목 (코드: 이름)
// jp: KIS/DART에 투자 테마 분류가 없어서 직접 매핑 (네이버/토스도 자체 테마DB 사용)
// jp: 이 종목들의 시세로 테마 평균등락률/대장주/상승비율 계산
// jp: "전체"는 불가능(분류 데이터 없음) → 각 테마 핵심 종목으로 대표

export interface ThemeDef {
  id: string;
  name: string;
  emoji: string;
  stocks: { code: string; name: string }[];
}

export const THEME_MAP: ThemeDef[] = [
  {
    id: 'semiconductor', name: '반도체', emoji: '💾',
    stocks: [
      { code: '005930', name: '삼성전자' },
      { code: '000660', name: 'SK하이닉스' },
      { code: '042700', name: '한미반도체' },
      { code: '000990', name: 'DB하이텍' },
      { code: '240810', name: '원익IPS' },
      { code: '058470', name: '리노공업' },
      { code: '357780', name: '솔브레인' },
      { code: '403870', name: 'HPSP' },
      { code: '348370', name: '엔켐' },
      { code: '095340', name: 'ISC' },
      { code: '140860', name: '파크시스템스' },
      { code: '036930', name: '주성엔지니어링' },
    ],
  },
  {
    id: 'battery', name: '2차전지', emoji: '🔋',
    stocks: [
      { code: '373220', name: 'LG에너지솔루션' },
      { code: '006400', name: '삼성SDI' },
      { code: '247540', name: '에코프로비엠' },
      { code: '086520', name: '에코프로' },
      { code: '066970', name: '엘앤에프' },
      { code: '003670', name: '포스코퓨처엠' },
      { code: '137400', name: '피엔티' },
      { code: '278280', name: '천보' },
      { code: '020150', name: '롯데에너지머티리얼즈' },
    ],
  },
  {
    id: 'bio', name: '바이오/제약', emoji: '🧬',
    stocks: [
      { code: '207940', name: '삼성바이오로직스' },
      { code: '068270', name: '셀트리온' },
      { code: '196170', name: '알테오젠' },
      { code: '328130', name: '루닛' },
      { code: '145020', name: '휴젤' },
      { code: '302440', name: 'SK바이오사이언스' },
      { code: '141080', name: '리가켐바이오' },
      { code: '085660', name: '차바이오텍' },
      { code: '000250', name: '삼천당제약' },
      { code: '298380', name: '에이비엘바이오' },
    ],
  },
  {
    id: 'ai', name: 'AI', emoji: '🤖',
    stocks: [
      { code: '035420', name: 'NAVER' },
      { code: '035720', name: '카카오' },
      { code: '042510', name: '라온시큐어' },
      { code: '053580', name: '웹케시' },
      { code: '060280', name: '큐렉소' },
      { code: '023960', name: '에쓰씨엔지니어링' },
      { code: '376300', name: '디어유' },
      { code: '440110', name: '파두' },
    ],
  },
  {
    id: 'auto', name: '자동차', emoji: '🚗',
    stocks: [
      { code: '005380', name: '현대차' },
      { code: '000270', name: '기아' },
      { code: '012330', name: '현대모비스' },
      { code: '011210', name: '현대위아' },
      { code: '204320', name: 'HL만도' },
      { code: '161390', name: '한국타이어앤테크놀로지' },
    ],
  },
  {
    id: 'shipbuilding', name: '조선', emoji: '🚢',
    stocks: [
      { code: '009540', name: 'HD한국조선해양' },
      { code: '329180', name: 'HD현대중공업' },
      { code: '010140', name: '삼성중공업' },
      { code: '042660', name: '한화오션' },
      { code: '075580', name: '세진중공업' },
    ],
  },
  {
    id: 'defense', name: '방산', emoji: '🛡️',
    stocks: [
      { code: '012450', name: '한화에어로스페이스' },
      { code: '047810', name: '한국항공우주' },
      { code: '079550', name: 'LIG넥스원' },
      { code: '064350', name: '현대로템' },
      { code: '272210', name: '한화시스템' },
    ],
  },
  {
    id: 'nuclear', name: '원전', emoji: '⚛️',
    stocks: [
      { code: '034020', name: '두산에너빌리티' },
      { code: '051600', name: '한전KPS' },
      { code: '052690', name: '한전기술' },
      { code: '100090', name: '삼강엠앤티' },
      { code: '018470', name: '조일알미늄' },
    ],
  },
  {
    id: 'internet_game', name: '인터넷/게임', emoji: '🎮',
    stocks: [
      { code: '036570', name: '엔씨소프트' },
      { code: '251270', name: '넷마블' },
      { code: '263750', name: '펄어비스' },
      { code: '259960', name: '크래프톤' },
      { code: '293490', name: '카카오게임즈' },
      { code: '112040', name: '위메이드' },
    ],
  },
  {
    id: 'entertainment', name: '엔터', emoji: '🎤',
    stocks: [
      { code: '352820', name: '하이브' },
      { code: '041510', name: 'SM' },
      { code: '122870', name: 'YG엔터테인먼트' },
      { code: '035900', name: 'JYP Ent.' },
      { code: '253450', name: '스튜디오드래곤' },
    ],
  },
  {
    id: 'robot', name: '로봇', emoji: '🦾',
    stocks: [
      { code: '108490', name: '로보티즈' },
      { code: '056080', name: '유진로봇' },
      { code: '290120', name: '대보마그네틱' },
      { code: '278470', name: '에이피알' },
      { code: '454910', name: '두산로보틱스' },
    ],
  },
  {
    id: 'space', name: '우주항공', emoji: '🚀',
    stocks: [
      { code: '047810', name: '한국항공우주' },
      { code: '099320', name: '쎄트렉아이' },
      { code: '443060', name: 'AP위성' },
      { code: '494940', name: '컨텍' },
    ],
  },
  {
    id: 'finance', name: '금융', emoji: '🏦',
    stocks: [
      { code: '105560', name: 'KB금융' },
      { code: '055550', name: '신한지주' },
      { code: '086790', name: '하나금융지주' },
      { code: '316140', name: '우리금융지주' },
      { code: '323410', name: '카카오뱅크' },
    ],
  },
  {
    id: 'steel_chem', name: '철강/화학', emoji: '🏭',
    stocks: [
      { code: '005490', name: 'POSCO홀딩스' },
      { code: '004020', name: '현대제철' },
      { code: '051910', name: 'LG화학' },
      { code: '011170', name: '롯데케미칼' },
      { code: '010950', name: 'S-Oil' },
    ],
  },
  {
    id: 'energy', name: '에너지/태양광', emoji: '☀️',
    stocks: [
      { code: '009830', name: '한화솔루션' },
      { code: '322000', name: 'HD현대에너지솔루션' },
      { code: '112610', name: '씨에스윈드' },
      { code: '267260', name: 'HD현대일렉트릭' },
    ],
  },
];

// jp: 종목코드 → 테마명 역매핑 (빠른 조회)
export const CODE_TO_THEME: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const theme of THEME_MAP) {
    for (const s of theme.stocks) map[s.code] = theme.name;
  }
  return map;
})();

// jp: 전체 테마 종목 코드 (중복 제거) - 시세 조회 대상
export const ALL_THEME_CODES: string[] = [
  ...new Set(THEME_MAP.flatMap(t => t.stocks.map(s => s.code))),
];
