// jp: 가격 알림 트리거 서비스
// jp: KIS 가격 수신 → 조건 체크 → 알림 발송 (notification 저장 + WS push)
// jp: cooldown으로 중복 알림 방지

import { StockPrice } from '../../types';
import { query } from '../../config/db';
import { createNotification } from '../../repositories/notification.repository';
import { publishPriceAlert } from '../pubsub/redisPubSub.service';

// jp: 가격 알림 조건 (DB stock_alert_conditions)
interface PriceAlertCondition {
  id: string;
  user_id: string;
  stock_code: string;
  stock_name: string;
  type: string;          // jp: price_above / price_below / change_rate_above / change_rate_below / volume_spike
  value: number | null;
  cooldown_minutes: number;
  last_triggered_at: string | null;
}

// jp: 메모리 캐시 - 종목코드별 활성 가격 알림 조건
// jp: 매 가격 수신마다 DB 조회하면 부하 → 주기적으로 메모리에 로드
let conditionsByStock = new Map<string, PriceAlertCondition[]>();
let lastLoadedAt = 0;
const RELOAD_INTERVAL_MS = 30_000; // jp: 30초마다 조건 재로드

// jp: 가격 관련 알림 타입만 (공시 알림은 별도 처리)
const PRICE_ALERT_TYPES = ['price_above', 'price_below', 'change_rate_above', 'change_rate_below', 'volume_spike'];

// jp: DB에서 활성 가격 알림 조건 로드 (종목코드별 그룹화)
async function loadConditions(): Promise<void> {
  try {
    const rows = await query<PriceAlertCondition>(
      `SELECT id, user_id, stock_code, stock_name, type, value, cooldown_minutes, last_triggered_at
         FROM stock_alert_conditions
        WHERE is_enabled = TRUE AND type = ANY($1)`,
      [PRICE_ALERT_TYPES]
    );

    const map = new Map<string, PriceAlertCondition[]>();
    for (const row of rows) {
      if (!map.has(row.stock_code)) map.set(row.stock_code, []);
      map.get(row.stock_code)!.push(row);
    }
    conditionsByStock = map;
    lastLoadedAt = Date.now();
  } catch (err) {
    // jp: DB 없으면 빈 맵 유지 (앱 동작에 영향 없음)
    console.error('[PriceAlert] 조건 로드 실패:', err instanceof Error ? err.message : err);
  }
}

// jp: 조건이 오래됐으면 재로드 (lazy reload)
async function ensureConditionsFresh(): Promise<void> {
  if (Date.now() - lastLoadedAt > RELOAD_INTERVAL_MS) {
    await loadConditions();
  }
}

// jp: cooldown 체크 - 마지막 발생 후 cooldownMinutes 안 지났으면 skip
function isInCooldown(cond: PriceAlertCondition): boolean {
  if (!cond.last_triggered_at) return false;
  const last = new Date(cond.last_triggered_at).getTime();
  const cooldownMs = cond.cooldown_minutes * 60 * 1000;
  return Date.now() - last < cooldownMs;
}

// jp: 조건 충족 여부 판정
function isConditionMet(cond: PriceAlertCondition, price: StockPrice): boolean {
  const v = cond.value;
  if (v === null) return false;

  switch (cond.type) {
    case 'price_above':        return price.price >= v;
    case 'price_below':        return price.price <= v;
    case 'change_rate_above':  return price.changeRate >= v;
    case 'change_rate_below':  return price.changeRate <= v;
    // jp: volume_spike는 평균 거래량 데이터 필요 → 현재는 절대 거래량 기준 임시 처리
    case 'volume_spike':       return price.volume >= v;
    default:                   return false;
  }
}

// jp: 알림 메시지 생성
function buildAlertMessage(cond: PriceAlertCondition, price: StockPrice): { title: string; body: string } {
  const name = cond.stock_name || cond.stock_code;
  switch (cond.type) {
    case 'price_above':
      return { title: `${name} 목표가 도달`, body: `현재가 ${price.price.toLocaleString()}원 (목표 ${cond.value?.toLocaleString()}원 이상)` };
    case 'price_below':
      return { title: `${name} 목표가 하회`, body: `현재가 ${price.price.toLocaleString()}원 (목표 ${cond.value?.toLocaleString()}원 이하)` };
    case 'change_rate_above':
      return { title: `${name} 상승률 도달`, body: `전일 대비 +${price.changeRate}% (목표 +${cond.value}% 이상)` };
    case 'change_rate_below':
      return { title: `${name} 하락률 도달`, body: `전일 대비 ${price.changeRate}% (목표 ${cond.value}% 이하)` };
    case 'volume_spike':
      return { title: `${name} 거래량 급증`, body: `거래량 ${price.volume.toLocaleString()}` };
    default:
      return { title: `${name} 알림`, body: '조건 충족' };
  }
}

// jp: 메인 - 가격 수신 시 호출 (kisWebSocket.service.ts에서 연결)
export async function checkPriceAlerts(price: StockPrice): Promise<void> {
  // jp: 해당 종목에 알림 조건 없으면 즉시 종료 (대부분의 경우 - 빠른 경로)
  await ensureConditionsFresh();
  const conditions = conditionsByStock.get(price.code);
  if (!conditions || conditions.length === 0) return;

  for (const cond of conditions) {
    if (isInCooldown(cond)) continue;
    if (!isConditionMet(cond, price)) continue;

    // jp: 조건 충족 → 알림 발송
    const { title, body } = buildAlertMessage(cond, price);

    // jp: 1. notification 테이블 저장
    await createNotification({
      userId: cond.user_id,
      type: 'price',
      stockCode: cond.stock_code,
      title,
      body,
    });

    // jp: 2. Redis Pub/Sub로 발행 → WS push
    await publishPriceAlert({
      userId: cond.user_id,
      stockCode: cond.stock_code,
      title,
      body,
      price: price.price,
    });

    // jp: 3. cooldown 갱신 (DB + 메모리)
    const now = new Date().toISOString();
    cond.last_triggered_at = now;
    void query(
      `UPDATE stock_alert_conditions SET last_triggered_at = NOW() WHERE id = $1`,
      [cond.id]
    ).catch(() => { /* 무시 */ });

    console.log(`[PriceAlert] 발송: ${title} (user=${cond.user_id})`);
  }
}

// jp: 서버 시작 시 1회 로드 (server.ts에서 호출)
export async function initPriceAlerts(): Promise<void> {
  await loadConditions();
  console.log(`[PriceAlert] 초기화 완료 - 감시 종목 ${conditionsByStock.size}개`);
}
