// jp: Redis Pub/Sub fanout 서비스
// jp: 여러 WebSocket 서버가 떠도 동일 tick을 fanout 받을 수 있는 확장 포인트

import { safePublish } from '../../config/redis';
import { realtimeCacheConfig } from '../cache/marketRealtimeCache.service';

export interface FanoutMessage<T = unknown> {
  type: 'trade' | 'orderbook';
  code: string;
  payload: T;
  ts: number;
}

export async function publishMarketFanout<T>(message: FanoutMessage<T>): Promise<boolean> {
  return safePublish(realtimeCacheConfig.pubsubChannel, JSON.stringify(message));
}
