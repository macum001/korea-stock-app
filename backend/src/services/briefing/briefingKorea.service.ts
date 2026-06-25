// briefingKorea.service.ts
// 시황 브리핑용 한국 데이터 수집 (통계 대조용)
// 코스피, 코스닥, 삼성전자, SK하이닉스 - 미국 지표와 같은 시점 스냅샷

import { getMarketIndices, getStockPrice } from '../kis/kisRest.service';
import { BriefingDataItem } from '../kis/globalIndex.service';

// jp: 수집할 한국 종목 (반도체 대표주)
const KR_STOCKS = [
  { code: '005930', key: 'kr_samsung',  name: '삼성전자' },
  { code: '000660', key: 'kr_skhynix',  name: 'SK하이닉스' },
];

// jp: 등락률 문자열 포맷 (+1.23% / -0.45%)
function fmtRate(rate: number): string {
  const sign = rate > 0 ? '+' : '';
  return `${sign}${rate.toFixed(2)}%`;
}

// jp: 한국 지수 2종 + 반도체 2종 수집 → BriefingDataItem[] 반환
// jp: 실패해도 빈 배열 반환 (브리핑 자체는 미국 데이터로 진행)
export async function collectKoreaBriefingData(fetchedAt: string): Promise<BriefingDataItem[]> {
  const items: BriefingDataItem[] = [];

  // jp: 1) 코스피/코스닥 지수
  try {
    const indices = await getMarketIndices();
    for (const idx of indices) {
      // jp: 코스피(0001), 코스닥(1001)만
      if (idx.code === '0001' || idx.code === '1001') {
        items.push({
          key:           idx.code === '0001' ? 'kr_kospi' : 'kr_kosdaq',
          name:          idx.code === '0001' ? '코스피' : '코스닥',
          category:      'kr_index',
          price:         idx.value,
          prevClose:     idx.value - idx.change,
          change:        idx.change,
          changeRate:    idx.changeRate,
          changeRateStr: fmtRate(idx.changeRate),
          fetchedAt,
        });
      }
    }
  } catch (err) {
    console.warn('[BriefingKR] 지수 수집 실패:', err instanceof Error ? err.message : err);
  }

  // jp: 2) 삼성전자, SK하이닉스
  for (const stock of KR_STOCKS) {
    try {
      const p = await getStockPrice(stock.code);
      items.push({
        key:           stock.key,
        name:          stock.name,
        category:      'kr_stock',
        unit:          '원',
        price:         p.price,
        prevClose:     p.prevClose,
        change:        p.change,
        changeRate:    p.changeRate,
        changeRateStr: fmtRate(p.changeRate),
        fetchedAt,
      });
    } catch (err) {
      console.warn(`[BriefingKR] ${stock.name} 수집 실패:`, err instanceof Error ? err.message : err);
    }
  }

  console.log(`[BriefingKR] 한국 데이터 수집: ${items.length}/4개`);
  return items;
}
