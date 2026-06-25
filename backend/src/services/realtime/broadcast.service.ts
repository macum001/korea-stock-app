// jp: WebSocket 브로드캐스트 서비스 - 공시 이벤트 발송

import { socketServer } from './socketServer.service';
import { Disclosure } from '../../types/disclosure';

// jp: 공시 업데이트 브로드캐스트
export function broadcastDisclosureUpdate(disclosure: Disclosure): void {
  try {
    socketServer.broadcastDisclosure({
      type: 'disclosure_update',
      disclosure,
    });
  } catch (err) {
    console.error('[Broadcast] 공시 업데이트 발송 실패:', err instanceof Error ? err.message : err);
  }
}

// jp: 중요 공시 알림 브로드캐스트
export function broadcastImportantDisclosure(disclosure: Disclosure, message: string): void {
  try {
    socketServer.broadcastDisclosure({
      type: 'important_disclosure_alert',
      disclosure,
      message,
    });
  } catch (err) {
    console.error('[Broadcast] 중요 공시 알림 발송 실패:', err instanceof Error ? err.message : err);
  }
}
