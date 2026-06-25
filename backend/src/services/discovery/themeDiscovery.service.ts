// jp: 테마별 종목 계산 서비스 - 명세 기준
// jp: 테마 선정: 구성종목 5개↑, 상승종목비율 60%↑, 평균상승률 +2%↑
// jp: 테마 점수: 평균상승률 + 상승비율 + 대장주 강도 (거래대금/뉴스는 데이터 한계로 일부만)

import { THEME_MAP } from '../../data/themeMap';
import { getCachedStockPrice } from '../cache/stockCache.service';

export interface ThemeStock {
  code: string;
  name: string;
  price: number;
  changeRate: number;
}

export interface ThemeResult {
  id: string;
  name: string;
  emoji: string;
  avgChangeRate: number;      // jp: 평균 상승률
  risingCount: number;        // jp: 상승 종목 수
  totalCount: number;         // jp: 시세 있는 종목 수
  leader: ThemeStock | null;  // jp: 대장주 (등락률 1위)
  stocks: ThemeStock[];       // jp: 구성 종목 (등락률순)
  score: number;              // jp: 테마 점수 0~100
  reason: string;             // jp: 선정 이유
}

// jp: 전체 테마 계산 → 점수순 정렬 (상위 노출용)
export async function computeThemes(): Promise<ThemeResult[]> {
  const results: ThemeResult[] = [];

  for (const theme of THEME_MAP) {
    // jp: 테마 종목들의 시세 수집 (캐시 우선, 없으면 제외)
    const stocks: ThemeStock[] = [];
    for (const s of theme.stocks) {
      const price = await getCachedStockPrice(s.code);
      if (price && price.price > 0) {
        stocks.push({ code: s.code, name: s.name, price: price.price, changeRate: price.changeRate });
      }
    }

    // jp: 시세 있는 종목이 너무 적으면(<3) 테마 계산 의미 없음 → 스킵
    if (stocks.length < 3) continue;

    // jp: 등락률순 정렬
    stocks.sort((a, b) => b.changeRate - a.changeRate);

    const totalCount = stocks.length;
    const risingCount = stocks.filter(s => s.changeRate > 0).length;
    const avgChangeRate = stocks.reduce((sum, s) => sum + s.changeRate, 0) / totalCount;
    const risingRatio = risingCount / totalCount;
    const leader = stocks[0] || null;

    // jp: 테마 점수 (명세 비율 반영: 평균상승률 40 + 상승비율 30 + 대장주강도 30)
    const avgScore = Math.max(0, Math.min(40, (avgChangeRate / 5) * 40));        // jp: +5%면 만점
    const ratioScore = risingRatio * 30;
    const leaderScore = leader ? Math.max(0, Math.min(30, (leader.changeRate / 10) * 30)) : 0; // jp: 대장 +10%면 만점
    const score = Math.round(avgScore + ratioScore + leaderScore);

    // jp: 선정 이유 자동 생성
    let reason: string;
    if (avgChangeRate >= 2 && risingRatio >= 0.6) {
      reason = `테마 동반 강세 (평균 +${avgChangeRate.toFixed(1)}%, ${totalCount}개 중 ${risingCount}개 상승)`;
    } else if (leader && leader.changeRate >= 5) {
      reason = `${leader.name} 주도 (+${leader.changeRate.toFixed(1)}%)`;
    } else if (avgChangeRate > 0) {
      reason = `완만한 상승 (평균 +${avgChangeRate.toFixed(1)}%)`;
    } else {
      reason = `약세 (평균 ${avgChangeRate.toFixed(1)}%)`;
    }

    results.push({
      id: theme.id, name: theme.name, emoji: theme.emoji,
      avgChangeRate: Number(avgChangeRate.toFixed(2)),
      risingCount, totalCount, leader,
      stocks, score, reason,
    });
  }

  // jp: 점수순 정렬 (강세 테마 먼저)
  results.sort((a, b) => b.score - a.score);
  return results;
}
