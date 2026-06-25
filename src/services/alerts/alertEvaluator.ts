// jp: 알림 평가 로직 - 가격/공시 업데이트 시 조건 검사 후 알림 생성
// jp: cooldown 적용으로 같은 조건이 너무 자주 울리지 않게 함

import { StockPrice } from '@/types/stock';
import { StockAlertCondition } from '@/types/alert';
import { NotificationType } from '@/types/notification';
import { useAlertStore } from '@/store/alertStore';
import { useNotificationStore } from '@/store/notificationStore';

// jp: 종목별 평균 거래량 (mock - 실제론 API에서)
const AVG_VOLUME: Record<string, number> = {
  '000660': 3_000_000, '005930': 12_000_000, '042700': 800_000,
  '196170': 500_000,   '034020': 5_000_000,  '035720': 2_000_000,
  '035420': 1_500_000, '207940': 300_000,
};

// jp: cooldown 체크 - 마지막 발생 후 N분 안 지났으면 skip
function isInCooldown(cond: StockAlertCondition, now: number): boolean {
  if (!cond.lastTriggeredAt) return false;
  const elapsed = now - cond.lastTriggeredAt;
  return elapsed < cond.cooldownMinutes * 60 * 1000;
}

// jp: 가격 알림 메시지 + 타입 생성
function buildPriceAlert(cond: StockAlertCondition, price: StockPrice): { type: NotificationType; title: string; message: string } | null {
  switch (cond.type) {
    case 'price_above':
      if (cond.value != null && price.price >= cond.value)
        return { type: 'price_up', title: '목표가 도달', message: `${cond.stockName}이(가) ${cond.value.toLocaleString()}원 이상에 도달했어요. (현재 ${price.price.toLocaleString()}원)` };
      break;
    case 'price_below':
      if (cond.value != null && price.price <= cond.value)
        return { type: 'price_down', title: '목표가 하락', message: `${cond.stockName}이(가) ${cond.value.toLocaleString()}원 이하로 내려갔어요. (현재 ${price.price.toLocaleString()}원)` };
      break;
    case 'change_rate_above':
      if (cond.value != null && price.changeRate >= cond.value)
        return { type: 'change_rate', title: '상승률 알림', message: `${cond.stockName}이(가) +${price.changeRate.toFixed(2)}% 상승했어요.` };
      break;
    case 'change_rate_below':
      if (cond.value != null && price.changeRate <= -Math.abs(cond.value))
        return { type: 'change_rate', title: '하락률 알림', message: `${cond.stockName}이(가) ${price.changeRate.toFixed(2)}% 하락했어요.` };
      break;
    case 'volume_spike': {
      const avg = AVG_VOLUME[cond.stockCode] ?? 1_000_000;
      const ratio = price.volume / avg;
      if (cond.value != null && ratio >= cond.value)
        return { type: 'volume_surge', title: '거래량 급증', message: `${cond.stockName} 거래량이 평소 대비 ${ratio.toFixed(1)}배 증가했어요.` };
      break;
    }
  }
  return null;
}

// jp: 가격 업데이트 시 알림 평가 (핵심)
export function evaluateStockAlerts(price: StockPrice): void {
  const now = Date.now();
  const alertStore = useAlertStore.getState();
  const notifStore = useNotificationStore.getState();

  const conditions = alertStore.getConditionsByStock(price.code);

  for (const cond of conditions) {
    if (!cond.isEnabled) continue;
    // jp: 공시 조건은 여기서 평가 안 함
    if (cond.type.startsWith('disclosure')) continue;
    if (isInCooldown(cond, now)) continue;

    const result = buildPriceAlert(cond, price);
    if (result) {
      notifStore.addNotification({
        type: result.type,
        stockCode: cond.stockCode,
        stockName: cond.stockName,
        title: result.title,
        message: result.message,
      });
      alertStore.markTriggered(cond.id, now);
    }
  }
}

// jp: 공시 알림 평가
interface DisclosureLike {
  stockCode: string;
  stockName: string;
  reportName: string;
  importance: 'important' | 'warning' | 'normal';
}

export function evaluateDisclosureAlerts(disclosure: DisclosureLike): void {
  const now = Date.now();
  const alertStore = useAlertStore.getState();
  const notifStore = useNotificationStore.getState();

  const conditions = alertStore.getConditionsByStock(disclosure.stockCode);

  for (const cond of conditions) {
    if (!cond.isEnabled) continue;
    if (!cond.type.startsWith('disclosure')) continue;
    if (isInCooldown(cond, now)) continue;

    let matched = false;
    switch (cond.type) {
      case 'disclosure_all':
        matched = true;
        break;
      case 'disclosure_important':
        matched = disclosure.importance !== 'normal';
        break;
      case 'disclosure_keyword':
        matched = !!cond.keyword && disclosure.reportName.includes(cond.keyword);
        break;
    }

    if (matched) {
      const isImportant = disclosure.importance !== 'normal';
      notifStore.addNotification({
        type: isImportant ? 'important_disclosure' : 'disclosure',
        stockCode: disclosure.stockCode,
        stockName: disclosure.stockName,
        title: isImportant ? '중요 공시 발생' : '공시 알림',
        message: `${disclosure.reportName} 공시가 등록됐어요.`,
      });
      alertStore.markTriggered(cond.id, now);
    }
  }
}
