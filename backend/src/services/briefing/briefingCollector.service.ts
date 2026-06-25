// briefingCollector.service.ts
// 시황 브리핑 데이터 수집 오케스트레이터 (slot 기반)

import { collectBriefingData } from '../kis/globalIndex.service';
import { collectKoreaBriefingData } from './briefingKorea.service';
import {
  upsertBriefingCollected,
  markBriefingFailed,
  getBriefingByDateSlot,
  getLatestBriefing,
  getCurrentSlot,
  getKstDate,
  MarketBriefing,
} from '../../repositories/briefing.repository';

// jp: 오늘 + 지정 slot으로 데이터 수집 + DB 저장
export async function runBriefingCollection(slot?: string): Promise<{
  success: boolean;
  briefing?: MarketBriefing;
  message: string;
}> {
  const today = getKstDate();
  const useSlot = slot ?? getCurrentSlot();
  console.log(`[Briefing] 수집 시작 (${today} ${useSlot})`);

  try {
    // 이미 이 slot이 완료됐으면 스킵
    const existing = await getBriefingByDateSlot(today, useSlot);
    if (existing?.status === 'completed') {
      console.log(`[Briefing] ${today} ${useSlot} 이미 완료됨, 스킵`);
      return { success: true, briefing: existing, message: '이미 완료된 브리핑 있음' };
    }

    // Yahoo에서 미국/글로벌 데이터 수집
    const rawData = await collectBriefingData();
    if (rawData.fetchedCount === 0) {
      throw new Error('수집된 데이터가 없습니다 (Yahoo Finance 응답 없음)');
    }

    // jp: 한국 데이터(코스피/코스닥/삼성전자/SK하이닉스) 추가 - 통계 대조용
    // jp: 실패해도 미국 데이터로 브리핑은 진행
    try {
      const krItems = await collectKoreaBriefingData(rawData.fetchedAt);
      if (krItems.length > 0) {
        rawData.items.push(...krItems);
        rawData.fetchedCount += krItems.length;
        rawData.totalCount += krItems.length;
      }
    } catch (krErr) {
      console.warn('[Briefing] 한국 데이터 수집 실패(미국만 진행):', krErr instanceof Error ? krErr.message : krErr);
    }

    // DB 저장
    const briefing = await upsertBriefingCollected(today, useSlot, rawData);
    console.log(
      `[Briefing] 수집 완료: ${rawData.fetchedCount}/${rawData.totalCount}개, ` +
      `id=${briefing.id}, ${today} ${useSlot}`
    );

    return {
      success: true,
      briefing,
      message: `${rawData.fetchedCount}/${rawData.totalCount}개 항목 수집 완료`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Briefing] 수집 실패 (${today} ${useSlot}):`, msg);
    try {
      await markBriefingFailed(today, useSlot, msg);
    } catch (dbErr) {
      console.error('[Briefing] 실패 기록 중 DB 오류:', dbErr);
    }
    return { success: false, message: `수집 실패: ${msg}` };
  }
}

// jp: 최신 브리핑 조회 (API용)
export async function getLatestBriefingForApi(): Promise<{
  briefing: MarketBriefing | null;
  isToday: boolean;
  todayStatus: string | null;
}> {
  const today = getKstDate();
  const briefing = await getLatestBriefing();
  if (!briefing) {
    return { briefing: null, isToday: false, todayStatus: null };
  }
  const isToday = String(briefing.date).slice(0, 10) === today;
  return {
    briefing,
    isToday,
    todayStatus: isToday ? briefing.status : null,
  };
}

// jp: raw_data 사람이 읽기 쉬운 포맷
export function formatRawDataForDisplay(briefing: MarketBriefing): string {
  const items = briefing.raw_data?.items ?? [];
  if (items.length === 0) return '데이터 없음';

  const byCategory: Record<string, typeof items> = {};
  for (const item of items) {
    if (!byCategory[item.category]) byCategory[item.category] = [];
    byCategory[item.category].push(item);
  }

  const categoryNames: Record<string, string> = {
    us_index: '미국 지수', us_rate: '미국 금리', forex: '환율',
    commodity: '원자재', global_index: '해외 지수', us_stock: '미국 반도체주',
  };

  const lines: string[] = [
    `시황 데이터 (slot=${briefing.slot})`,
    `수집: ${briefing.raw_data.fetchedCount}/${briefing.raw_data.totalCount}개`,
    '',
  ];
  for (const [cat, catItems] of Object.entries(byCategory)) {
    lines.push(categoryNames[cat] ?? cat);
    for (const item of catItems) {
      const unit = item.unit ? ` ${item.unit}` : '';
      lines.push(`  ${item.name}: ${item.price.toLocaleString()}${unit} (${item.changeRateStr})`);
    }
    lines.push('');
  }
  return lines.join('\n');
}
