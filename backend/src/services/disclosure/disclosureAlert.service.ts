// jp: 공시 알림 처리 서비스 - 5종 매칭 + 알림 기록 + WS + FCM 푸시
// jp: 공시 분류(isCapital/isGood/isBad/isImportant)에 맞는 구독자에게만 발송
// jp: ★ 대량 최적화 - 일괄 중복체크 + 토큰 일괄 조회 + FCM 배치

import { Disclosure } from '../../types/disclosure';
import { getAlertTargetsForDisclosure } from '../../repositories/disclosureAlert.repository';
import { createNotificationsForUsers, filterNewUserIdsForTarget } from '../../repositories/notification.repository';
import { broadcastImportantDisclosure } from '../realtime/broadcast.service';
import { getFcmTokensForUsers, deleteFcmTokens } from '../../repositories/fcmToken.repository';
import { sendPushToTokens, isFcmEnabled } from '../fcm/firebase.service';

// jp: 공시 유형 → 한글 라벨 + 알림 제목
function getTypeLabel(matchedType: string): string {
  switch (matchedType) {
    case 'capital': return '자본조달';
    case 'bad':     return '악재';
    case 'good':    return '호재';
    case 'important': return '중요';
    case 'all':     return '공시';
    default:        return '공시';
  }
}

// jp: 중요/분류 공시 발생 시 알림 처리
export async function createDisclosureNotification(disclosure: Disclosure): Promise<void> {
  try {
    if (!disclosure.stockCode) return;

    // jp: 공시 분류 플래그 (Disclosure에 있으면 사용, 없으면 importance/sentiment로 추정)
    const d = disclosure as Disclosure & {
      isImportant?: boolean; isCapital?: boolean; isGood?: boolean; isBad?: boolean;
    };
    const flags = {
      isImportant: d.isImportant ?? (disclosure.importance !== 'normal'),
      isCapital:   d.isCapital ?? false,
      isGood:      d.isGood ?? (disclosure.sentiment === 'positive'),
      isBad:       d.isBad ?? (disclosure.sentiment === 'negative'),
    };

    // jp: 5종 매칭 - 해당 유형을 구독한 사용자만
    const targets = await getAlertTargetsForDisclosure(disclosure.stockCode, flags);

    if (targets.length > 0) {
      // jp: 대표 유형 (첫 번째 매칭 유형으로 라벨)
      const repType = targets[0].matchedType;
      const typeLabel = getTypeLabel(repType);
      const title = `${disclosure.stockName} ${typeLabel} 공시`;
      const body  = `${disclosure.reportName}${disclosure.summary ? ' - ' + disclosure.summary : ''}`;

      const userIds = [...new Set(targets.map(t => t.userId))];

      // jp: 중복 방지 - 이미 이 공시로 알림 받은 user 제외 (★ 일괄 1쿼리)
      // jp: target_id에는 receiptNo를 저장 (id는 알림 시점에 누락될 수 있어 receiptNo가 안전,
      // jp:  notification.repository의 조회 JOIN도 n.target_id = d.receipt_no 기준)
      const targetId = String(disclosure.receiptNo ?? '');
      const newUserIds = await filterNewUserIdsForTarget(userIds, targetId, 'disclosure');

      // jp: 모두 이미 받았으면 알림/푸시 건너뛰고 WS만 (아래)
      if (newUserIds.length > 0) {
        // jp: 1. 알림 기록 생성 (DB) - 한 방 INSERT
        await createNotificationsForUsers(newUserIds, {
          type:      'disclosure',
          stockCode: disclosure.stockCode,
          title,
          body,
          targetId:  disclosure.receiptNo,
        });
        console.log(`[Alert] ${newUserIds.length}명에게 공시 알림 생성: ${title}`);

        // jp: 2. FCM 푸시 발송 (새로 받는 사람에게만)
        if (isFcmEnabled()) {
          // jp: 토큰 일괄 조회 (★ 1쿼리) + 500개 배치는 sendPushToTokens 내부 처리
          const allTokens = await getFcmTokensForUsers(newUserIds);
          if (allTokens.length > 0) {
            const { failedTokens } = await sendPushToTokens(allTokens, title, body, {
              type: 'disclosure',
              stockCode: disclosure.stockCode,
              disclosureType: repType,
            });
            // jp: 만료 토큰 정리
            if (failedTokens.length > 0) {
              await deleteFcmTokens(failedTokens);
            }
          }
        }
      } else {
        console.log(`[Alert] 이미 발송된 공시 알림 - 건너뜀: ${title}`);
      }
    }

    // jp: 3. WebSocket 브로드캐스트 (모든 접속 클라이언트)
    const wsTitle = `${disclosure.stockName} 공시`;
    broadcastImportantDisclosure(disclosure, wsTitle);
  } catch (err) {
    console.error('[Alert] 알림 생성 실패:', err instanceof Error ? err.message : err);
  }
}
