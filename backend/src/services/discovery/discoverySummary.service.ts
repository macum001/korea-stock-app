// jp: 발견 화면 사전 계산 서비스 - 결과를 Redis에 저장
// jp: 화면 요청마다 전체 재계산 금지. 스케줄러가 미리 계산

import { safeGet, safeSetEx, isRedisReady } from '../../config/redis';
import { computeAllFeatures, groupBySections } from '../stockFeature/featuredSection.service';
import { getImportantDisclosures } from '../../repositories/disclosure.repository';
import { computeThemes } from './themeDiscovery.service';
import { getMarketIndices } from '../kis/kisRest.service';
import { isDbReady } from '../../config/db';

// jp: Redis 키
export const DISCOVERY_KEYS = {
  summary: 'discovery:summary',
  featured: 'discovery:featured',
  topGainers: 'discovery:top-gainers',
  topLosers: 'discovery:top-losers',
  volumeSpikes: 'discovery:volume-spikes',
  themes: 'discovery:themes',
  todayDisclosures: 'discovery:today-disclosures',
};

// jp: TTL (장중 기준 - job 주기보다 약간 길게)
const TTL = 120;

// jp: 전체 발견 데이터 사전 계산 후 Redis 저장
export async function precomputeDiscoverySummary(): Promise<void> {
  if (!isRedisReady()) return;

  try {
    // jp: 1. 5점수 특징주 계산
    const all = await computeAllFeatures('intraday');

    // jp: 가격을 못 받아 계산 결과가 비면(EGW00201 등) Redis를 덮어쓰지 않음
    // jp: → 마지막 정상 데이터 유지 (화면이 '계산 중'으로 사라지는 깜빡임 방지)
    if (all.length === 0) {
      console.log('[precompute] 계산 결과 없음(가격 미수신) → 기존 캐시 유지, 갱신 스킵');
    } else {
      const sections = groupBySections(all);

    // jp: 2. 파생 목록 (특징주 점수 기반)
    const sorted = [...all].sort((a, b) => b.featuredScore - a.featuredScore);
    const volumeSpikes = all.filter(s => s.reasons.some(r => r.label.includes('거래량')));
    // jp: 테마 - 매핑 테이블 기반 전체 계산(평균상승률/대장주/상승비율), 점수순
    const themes = await computeThemes();

    // jp: 3. 오늘의 주요공시 (DB)
    let todayDisclosures: unknown[] = [];
    if (isDbReady()) {
      try { todayDisclosures = await getImportantDisclosures(10); } catch { /* skip */ }
    }

    // jp: 4. summary 조립
    const summary = {
      todayImportantDisclosures: todayDisclosures,
      themes,
      volumeSpikes: volumeSpikes.slice(0, 10),
      featuredStocks: sorted.slice(0, 10),
      stockFeatureRankings: sorted.slice(0, 20).map(s => ({
        stockCode: s.stockCode, stockName: s.stockName,
        featuredScore: s.featuredScore, riskLevel: s.riskLevel,
      })),
      updatedAt: new Date().toISOString(),
    };

    // jp: 5. Redis 저장 (개별 + 통합)
    await Promise.all([
      safeSetEx(DISCOVERY_KEYS.summary, TTL, JSON.stringify(summary)),
      safeSetEx(DISCOVERY_KEYS.featured, TTL, JSON.stringify(sections)),
      safeSetEx(DISCOVERY_KEYS.volumeSpikes, TTL, JSON.stringify(volumeSpikes.slice(0, 10))),
      safeSetEx(DISCOVERY_KEYS.themes, TTL, JSON.stringify(themes)),
      safeSetEx(DISCOVERY_KEYS.todayDisclosures, TTL, JSON.stringify(todayDisclosures)),
    ]);

    console.log(`[precompute] discovery summary 갱신 완료 (종목 ${all.length}, 섹션 ${sections.length})`);
    }
  } catch (err) {
    console.error('[precompute] discovery summary 실패:', err instanceof Error ? err.message : err);
  }

  // jp: 시장지수 - 캐시가 비었을 때만 갱신 (중복 KIS 호출로 인한 rate limit 방지)
  try {
    const cached = await safeGet('market:indices');
    if (!cached) {
      const indices = await getMarketIndices();
      if (indices.length > 0) {
        await safeSetEx('market:indices', 60, JSON.stringify(indices));
      }
    }
  } catch { /* 무시 */ }
}
