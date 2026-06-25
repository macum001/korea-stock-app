// briefingNotify.service.ts
// 시황 브리핑 푸시 알림 발송
// - 알림 시각: 08:40 / 11:50 / 15:40 만 (06:00, 22:50은 알림 없음)
// - 평소: 조용한 알림 / is_important: 소리 알림

import { getAllFcmTokens, deleteFcmTokens } from '../../repositories/fcmToken.repository';
import { sendPushWithSound } from '../fcm/firebase.service';
import { MarketBriefing } from '../../repositories/briefing.repository';

// jp: 알림을 보내는 slot (06:00, 22:50 제외)
const NOTIFY_SLOTS = new Set(['0840', '1150', '1540']);

// jp: slot → 사람이 읽는 시간대 라벨
function slotLabel(slot: string): string {
  const map: Record<string, string> = {
    '0840': '오전장 브리핑',
    '1150': '점심 브리핑',
    '1540': '마감 브리핑',
  };
  return map[slot] ?? '시황 브리핑';
}

// jp: 브리핑 완료 후 호출 - 알림 발송 여부 판단 + 발송
export async function notifyBriefing(briefing: MarketBriefing): Promise<void> {
  // jp: 알림 안 보내는 slot이면 스킵 (06:00, 22:50)
  if (!NOTIFY_SLOTS.has(briefing.slot)) {
    console.log(`[브리핑알림] ${briefing.slot}은 알림 제외 시간대, 스킵`);
    return;
  }

  const analysis = briefing.analysis as Record<string, unknown> | null;
  if (!analysis) {
    console.log('[브리핑알림] 분석 결과 없음, 스킵');
    return;
  }

  const isImportant = analysis.is_important === true;
  const status = String(analysis.status ?? '보통');
  const summary = String(analysis.summary ?? '오늘의 시황을 확인하세요');

  // jp: 알림 제목/본문
  const title = isImportant
    ? `⚠️ ${slotLabel(briefing.slot)} · 시장 ${status}`
    : `${slotLabel(briefing.slot)} 도착`;
  const body = summary;

  // jp: 전체 회원 토큰 조회
  const tokens = await getAllFcmTokens();
  if (tokens.length === 0) {
    console.log('[브리핑알림] 발송 대상 토큰 없음');
    return;
  }

  // jp: 중요하면 소리(silent=false), 평소엔 조용히(silent=true)
  const silent = !isImportant;

  const result = await sendPushWithSound(
    tokens,
    title,
    body,
    silent,
    {
      type: 'briefing',
      slot: briefing.slot,
      date: String(briefing.date).slice(0, 10),
      status,
      important: String(isImportant),
    }
  );

  console.log(
    `[브리핑알림] ${briefing.slot} 발송 완료 - ` +
    `성공 ${result.successCount}/${tokens.length}, ` +
    `${silent ? '조용히' : '소리'}, 중요=${isImportant}`
  );

  // jp: 실패한(만료된) 토큰 정리
  if (result.failedTokens.length > 0) {
    try {
      await deleteFcmTokens(result.failedTokens);
      console.log(`[브리핑알림] 만료 토큰 ${result.failedTokens.length}개 정리`);
    } catch (err) {
      console.error('[브리핑알림] 토큰 정리 실패:', err);
    }
  }
}
