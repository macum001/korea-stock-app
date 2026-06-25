// jp: 가격 알림 브리지 - Redis PRICE_ALERT 채널 구독 → WS 클라이언트로 전송
// jp: server.ts에서 1회 init 호출
// jp: 현재는 전체 브로드캐스트 (WS 유저 인증 붙으면 userId 타겟팅으로 변경)

import { socketServer } from '../realtime/socketServer.service';
import { subscribePubSub, PUBSUB_CHANNELS, PriceAlertPayload } from '../pubsub/redisPubSub.service';

export async function initPriceAlertBridge(): Promise<void> {
  await subscribePubSub(PUBSUB_CHANNELS.PRICE_ALERT, (msg: unknown) => {
    const m = msg as { type: string; data: PriceAlertPayload };
    if (m?.type !== 'PRICE_ALERT' || !m.data) return;

    // jp: WS로 가격 알림 전송 (현재는 전체 브로드캐스트)
    // jp: socketServer에 broadcastDisclosure 패턴 재사용
    try {
      socketServer.broadcastDisclosure({
        type: 'price_alert',
        userId: m.data.userId,
        stockCode: m.data.stockCode,
        title: m.data.title,
        body: m.data.body,
        price: m.data.price,
      });
    } catch (err) {
      console.error('[PriceAlertBridge] WS 전송 실패:', err instanceof Error ? err.message : err);
    }
  });

  console.log('[PriceAlertBridge] 가격 알림 브리지 초기화 완료');
}
