// jp: 매일 새벽 5시 - 오늘의 AI 예시 질문 5개 자동 생성
// jp: 최근 24시간 공시에서 주요 종목 추출 → 템플릿 조합 → Redis 저장 (24시간 TTL)
// jp: 토큰 0개 소모 (Claude 호출 없음, 순수 DB + 템플릿)

import cron from 'node-cron';
import { query } from '../config/db';
import { safeSetEx, safeGet } from '../config/redis';

export const DAILY_EXAMPLES_KEY = 'ai:daily_examples';
const DAILY_EXAMPLES_TTL = 60 * 60 * 24; // 24시간

// jp: 질문 템플릿 풀 - 공시+뉴스 데이터로 잘 나오는 질문들
const TEMPLATES = [
  (name: string) => ({ text: `${name} 최근 뉴스랑 공시 종합해줘`, sub: '뉴스 + 공시 종합' }),
  (name: string) => ({ text: `${name} 이번 공시 투자자 관점에서 어떻게 봐?`, sub: '투자자 시각 분석' }),
  (name: string) => ({ text: `${name} 최근 공시 중 주가에 영향줄 내용 있어?`, sub: '공시 + 뉴스 분석' }),
  (name: string) => ({ text: `${name} 최근 공시 호재 악재 구분해줘`, sub: '호재/악재 분류' }),
  (name: string) => ({ text: `${name} 오늘 공시 핵심만 짧게 알려줘`, sub: '공시 요약' }),
  (name: string) => ({ text: `${name} 최근 공시 흐름이 주가에 미칠 영향은?`, sub: '공시 영향 분석' }),
  (name: string) => ({ text: `${name} 최근 뉴스 보면 지금 분위기 어때?`, sub: '뉴스 분위기 분석' }),
  (name: string) => ({ text: `${name} 이번 공시 시장 반응이 어떨 것 같아?`, sub: '시장 반응 예측' }),
];

interface ExampleItem {
  text: string;
  sub: string;
  stockCode: string;
  stockName: string;
}

// jp: 오늘의 예시 생성 - 최근 24시간 중요 공시 종목에서 추출
export async function generateDailyExamples(): Promise<ExampleItem[]> {
  try {
    // jp: 최근 24시간 공시 종목 (중요도 높은 것 우선, 중복 제거)
    const rows = await query<{ stock_code: string; stock_name: string }>(
      `SELECT DISTINCT ON (stock_code) stock_code, stock_name
         FROM disclosures
        WHERE disclosed_at > now() - INTERVAL '24 hours'
          AND stock_name IS NOT NULL
          AND stock_code IS NOT NULL
        ORDER BY stock_code, is_important DESC, disclosed_at DESC
        LIMIT 30`
    );

    if (rows.length < 3) {
      // jp: 24시간 공시가 부족하면 최근 7일로 확장
      const extended = await query<{ stock_code: string; stock_name: string }>(
        `SELECT DISTINCT ON (stock_code) stock_code, stock_name
           FROM disclosures
          WHERE disclosed_at > now() - INTERVAL '7 days'
            AND stock_name IS NOT NULL
            AND stock_code IS NOT NULL
          ORDER BY stock_code, is_important DESC, disclosed_at DESC
          LIMIT 30`
      );
      rows.push(...extended.filter(r => !rows.find(e => e.stock_code === r.stock_code)));
    }

    if (rows.length === 0) return getDefaultExamples();

    // jp: 랜덤으로 5개 종목 선택
    const shuffled = rows.sort(() => Math.random() - 0.5).slice(0, 5);

    // jp: 각 종목에 랜덤 템플릿 조합
    const usedTemplates = new Set<number>();
    return shuffled.map((row) => {
      // jp: 중복 템플릿 최소화
      let idx: number;
      do { idx = Math.floor(Math.random() * TEMPLATES.length); }
      while (usedTemplates.has(idx) && usedTemplates.size < TEMPLATES.length);
      usedTemplates.add(idx);

      const { text, sub } = TEMPLATES[idx](row.stock_name);
      return { text, sub, stockCode: row.stock_code, stockName: row.stock_name };
    });
  } catch (err) {
    console.error('[DailyExamples] 생성 실패:', err instanceof Error ? err.message : err);
    return getDefaultExamples();
  }
}

// jp: 기본 예시 (DB 실패 시 폴백)
function getDefaultExamples(): ExampleItem[] {
  return [
    { text: '삼성전자 최근 뉴스랑 공시 종합해줘', sub: '뉴스 + 공시 종합', stockCode: '005930', stockName: '삼성전자' },
    { text: 'SK하이닉스 이번 분기 실적 공시 어떻게 나왔어?', sub: '실적 공시 해석', stockCode: '000660', stockName: 'SK하이닉스' },
    { text: '현대차 오늘 뉴스랑 공시 같이 보면 어때?', sub: '공시 + 뉴스 크로스체크', stockCode: '005380', stockName: '현대차' },
    { text: '오늘 반도체 관련주 흐름 어때?', sub: '섹터 흐름 분석', stockCode: '', stockName: '' },
    { text: '삼성바이오로직스 최근 뉴스랑 공시 종합해줘', sub: '뉴스 + 공시 종합', stockCode: '207940', stockName: '삼성바이오로직스' },
  ];
}

// jp: Redis에서 오늘의 예시 조회
export async function getDailyExamples(): Promise<ExampleItem[]> {
  try {
    const cached = await safeGet(DAILY_EXAMPLES_KEY);
    if (cached) return JSON.parse(cached) as ExampleItem[];
  } catch { /* 무시 */ }

  // jp: Redis에 없으면 즉시 생성 후 저장
  const examples = await generateDailyExamples();
  try {
    await safeSetEx(DAILY_EXAMPLES_KEY, DAILY_EXAMPLES_TTL, JSON.stringify(examples));
  } catch { /* 무시 */ }
  return examples;
}

let task: ReturnType<typeof cron.schedule> | null = null;

export function startDailyExamplesJob(): void {
  // jp: 매일 새벽 5시 KST 실행
  task = cron.schedule(
    '0 5 * * *',
    async () => {
      console.log('[DailyExamples] 오늘의 예시 질문 생성 시작...');
      const examples = await generateDailyExamples();
      try {
        await safeSetEx(DAILY_EXAMPLES_KEY, DAILY_EXAMPLES_TTL, JSON.stringify(examples));
        console.log('[DailyExamples] 완료 -', examples.map(e => e.stockName || '일반').join(', '));
      } catch (err) {
        console.error('[DailyExamples] Redis 저장 실패:', err instanceof Error ? err.message : err);
      }
    },
    { timezone: 'Asia/Seoul' }
  );
  console.log('[DailyExamples] 매일 새벽 5시 예시 생성 스케줄 시작');
}

export function stopDailyExamplesJob(): void {
  if (task) { task.stop(); task = null; }
}
