// jp: 시황 브리핑 서비스 - 백엔드 API 연결
import { apiClient } from './apiClient';
import { MarketBriefing } from '@/types/briefing';

function getKstDate(): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

// jp: 최신 브리핑 1건
export async function getLatestBriefing(): Promise<{
  briefing: MarketBriefing | null;
  isToday: boolean;
  todayStatus: string | null;
}> {
  try {
    const briefing = await apiClient.get<MarketBriefing | null>('/api/market/briefing');
    if (!briefing) {
      return { briefing: null, isToday: false, todayStatus: null };
    }
    const today = getKstDate();
    const briefingDate = String(briefing.date).slice(0, 10);
    const isToday = briefingDate === today;
    return { briefing, isToday, todayStatus: isToday ? briefing.status : null };
  } catch (err) {
    console.error('[브리핑] 조회 실패:', err);
    return { briefing: null, isToday: false, todayStatus: null };
  }
}

// jp: 최근 브리핑 목록 (타임라인용)
export async function getBriefingHistory(limit = 30): Promise<MarketBriefing[]> {
  try {
    const list = await apiClient.get<MarketBriefing[]>(`/api/market/briefing-history?limit=${limit}`);
    return Array.isArray(list) ? list : [];
  } catch (err) {
    console.error('[브리핑] 히스토리 조회 실패:', err);
    return [];
  }
}

export const CATEGORY_LABELS: Record<string, string> = {
  kr_index:     '국내 지수',
  kr_stock:     '국내 반도체',
  us_index:     '미국 지수',
  us_rate:      '미국 금리',
  forex:        '환율',
  commodity:    '원자재',
  global_index: '해외 지수',
  us_stock:     '미국 반도체주',
};

export const CATEGORY_ORDER = [
  'kr_index', 'kr_stock',
  'us_index', 'us_rate', 'forex', 'commodity', 'global_index', 'us_stock',
];

// jp: 날짜+시간대 라벨 헬퍼 (타임라인 공용)
// jp: "오늘 15:40" / "어제 11:50" / "6월 18일 08:40"
export function formatBriefingLabel(briefing: MarketBriefing): string {
  const today = getKstDate();
  const yesterday = new Date(Date.now() + 9 * 60 * 60 * 1000 - 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 10);

  const bDate = String(briefing.date).slice(0, 10);
  const time = slotToTime(briefing.slot);

  let dayLabel: string;
  if (bDate === today) dayLabel = '오늘';
  else if (bDate === yesterday) dayLabel = '어제';
  else {
    const [, m, d] = bDate.split('-');
    dayLabel = `${parseInt(m, 10)}월 ${parseInt(d, 10)}일`;
  }
  return time ? `${dayLabel} ${time}` : dayLabel;
}

export function slotToTime(slot: string): string {
  if (!slot || slot === 'test') return '';
  if (slot.length === 4) return `${slot.slice(0, 2)}:${slot.slice(2)}`;
  return slot;
}
