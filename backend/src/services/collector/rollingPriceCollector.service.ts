// jp: 전체 상장종목 순환 수집 서비스
// jp: 사양 3번: 전체 종목 수 하드코딩 X, 종목마스터 기준 동적 처리, 순환 수집 → Redis 캐시
// jp: 프론트는 이 캐시를 batchPrice로 읽음 (직접 전체 반복 호출 X)
//
// jp: 동작:
// jp:   - 종목마스터에서 전체 코드 동적 로드
// jp:   - 우선순위: 주요종목 먼저 → 나머지
// jp:   - 배치 단위로 KIS 호출 (rate limit 보호) → cacheStockPrice (Redis)
// jp:   - 한 바퀴 완료 시 처음부터 순환
// jp:   - 장외엔 가동 안 함

import { getAllStockCodes } from '../../repositories/stockMaster.repository';
import { MAJOR_STOCK_CODES_UNIQUE } from '../../data/majorStocks';
import { getStockPrice } from '../kis/kisRest.service';
import { cacheStockPrice } from '../cache/stockCache.service';
import { saveStockPrice } from '../../repositories/stockPrice.repository';
import { withCircuitBreaker } from '../performance/circuitBreaker.service';
import { enqueueExternalApiRequest, withRetryAndBackoff } from '../performance/rateLimitQueue.service';
import { ENV } from '../../config/env';
import { isDbReady } from '../../config/db';

// jp: 한 배치당 종목 수 (rate limit 고려 - 큐가 알아서 분산하지만 안전하게)
const BATCH_SIZE = 20;
// jp: 배치 간 간격 (ms)
const BATCH_INTERVAL_MS = 3000;

let running = false;
let cancelled = false;
let cursor = 0;            // jp: 현재 순환 위치
let orderedCodes: string[] = [];
let lastRefreshAt = 0;     // jp: 종목 목록 갱신 시각

// jp: 통계
let stats = { round: 0, collected: 0, failed: 0, lastCycleAt: '' };

function isMarketHours(): boolean {
  const now = new Date();
  const day = now.getDay();
  if (day === 0 || day === 6) return false;
  const time = now.getHours() * 100 + now.getMinutes();
  // jp: 장 + 동시호가 시간 여유 (08:30~15:40)
  return time >= 830 && time <= 1540;
}

// jp: 종목 목록 로드 (우선순위 정렬) - 1시간마다 갱신
async function ensureCodes(): Promise<void> {
  const now = Date.now();
  if (orderedCodes.length > 0 && now - lastRefreshAt < 3600_000) return;

  const all = await getAllStockCodes(true);
  if (all.length === 0) return;

  // jp: 주요종목 먼저, 나머지 뒤로
  const majorSet = new Set(MAJOR_STOCK_CODES_UNIQUE);
  const major = MAJOR_STOCK_CODES_UNIQUE.filter(c => all.includes(c));
  const rest = all.filter(c => !majorSet.has(c));
  orderedCodes = [...major, ...rest];
  lastRefreshAt = now;
  console.log(`[순환수집] 종목 목록 갱신: ${orderedCodes.length}개 (주요 ${major.length} 우선)`);
}

// jp: 단일 종목 수집 (rate limit 보호)
async function collectOne(code: string): Promise<boolean> {
  try {
    const price = await withCircuitBreaker('KIS_PRICE', () =>
      enqueueExternalApiRequest('KIS_PRICE', `roll:${code}`, () =>
        withRetryAndBackoff(() => getStockPrice(code), { retries: 1 })
      )
    );
    if (price && price.price > 0) {
      void cacheStockPrice(price);   // jp: Redis 캐시 (batchPrice가 읽는 키)
      void saveStockPrice(price);    // jp: DB 마지막 정상가 (fallback용)
      return true;
    }
  } catch { /* 실패 무시 */ }
  return false;
}

// jp: 순환 루프 (한 배치씩 처리하고 다음 배치 예약)
async function tick(): Promise<void> {
  if (cancelled) { running = false; return; }

  // jp: 장외면 쉬었다가 재확인 (수집 안 함)
  if (!isMarketHours()) {
    setTimeout(() => void tick(), 60_000); // jp: 1분 후 재확인
    return;
  }

  await ensureCodes();
  if (orderedCodes.length === 0) {
    setTimeout(() => void tick(), 30_000);
    return;
  }

  // jp: 현재 커서부터 BATCH_SIZE개
  const batch = orderedCodes.slice(cursor, cursor + BATCH_SIZE);
  const results = await Promise.all(batch.map(collectOne));
  stats.collected += results.filter(Boolean).length;
  stats.failed += results.filter(r => !r).length;

  cursor += BATCH_SIZE;

  // jp: 한 바퀴 완료
  if (cursor >= orderedCodes.length) {
    cursor = 0;
    stats.round += 1;
    stats.lastCycleAt = new Date().toISOString();
    console.log(`[순환수집] ${stats.round}바퀴 완료 (수집 ${stats.collected}, 실패 ${stats.failed})`);
    stats.collected = 0;
    stats.failed = 0;
  }

  // jp: 다음 배치 예약
  setTimeout(() => void tick(), BATCH_INTERVAL_MS);
}

export function startRollingCollector(): void {
  if (ENV.USE_MOCK_DATA) {
    console.log('[순환수집] USE_MOCK_DATA=true → 비활성');
    return;
  }
  if (!ENV.KIS.APP_KEY || ENV.KIS.APP_KEY === 'your_app_key_here') {
    console.log('[순환수집] KIS 키 없음 → 비활성');
    return;
  }
  if (running) return;
  if (!isDbReady()) {
    // jp: DB 준비 안 됐으면 잠시 후 재시도
    setTimeout(() => startRollingCollector(), 5000);
    return;
  }

  running = true;
  cancelled = false;
  console.log('[순환수집] 시작 (장중 전체종목 순환 → Redis 캐시)');
  void tick();
}

export function stopRollingCollector(): void {
  cancelled = true;
  running = false;
}

// jp: 상태 조회 (디버그/헬스용)
export function getRollingStats() {
  return { ...stats, cursor, total: orderedCodes.length, running };
}
