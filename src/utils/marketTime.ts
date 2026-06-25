// jp: 프론트 한국장 시간 유틸 - 사용자 PC/브라우저 timezone과 무관하게 Asia/Seoul 기준으로 판단

export type MarketStatus = 'PRE_MARKET' | 'REGULAR_OPEN' | 'AFTER_HOURS' | 'CLOSED' | 'DISCONNECTED' | 'NO_DATA';

export function getKstParts(date = new Date()): { day: number; hour: number; minute: number; ymd: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
    weekday: 'short',
  }).formatToParts(date);

  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  const weekday = get('weekday');
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const year = get('year');
  const month = get('month');
  const day = get('day');
  return {
    day: dayMap[weekday] ?? date.getUTCDay(),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    ymd: `${year}-${month}-${day}`,
  };
}

export function getMarketStatus(date = new Date()): MarketStatus {
  const kst = getKstParts(date);
  if (kst.day === 0 || kst.day === 6) return 'CLOSED';
  const hhmm = kst.hour * 100 + kst.minute;
  if (hhmm < 900) return 'PRE_MARKET';
  if (hhmm < 1530) return 'REGULAR_OPEN';
  if (hhmm < 1800) return 'AFTER_HOURS';
  return 'CLOSED';
}

export function isRegularMarketOpen(date = new Date()): boolean {
  return getMarketStatus(date) === 'REGULAR_OPEN';
}

export function getMarketStatusLabel(status: MarketStatus): string {
  switch (status) {
    case 'PRE_MARKET': return '장전 · 전일 종가 기준';
    case 'REGULAR_OPEN': return '정규장';
    case 'AFTER_HOURS': return '시간외 · 종가 기준';
    case 'CLOSED': return '장마감 · 종가 기준';
    case 'DISCONNECTED': return '연결 끊김 · 마지막 시세 기준';
    case 'NO_DATA': return '데이터 없음';
  }
}
