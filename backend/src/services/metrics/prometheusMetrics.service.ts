// jp: Prometheus metrics exporter
// jp: 토스급 운영 목표 - Redis/KIS/WS/EventBus 지연과 구독 상태를 숫자로 상시 관측한다.

import { isRedisReady, safeHGetAll, safeRedisInfo } from '../../config/redis';
import { kisOrderbookWs } from '../kis/kisOrderbookWs.service';
import { marketEventBus } from '../realtime/marketEventBus.service';
import { socketServer } from '../realtime/socketServer.service';
import { getRedisStreamRecoveryStats } from '../realtime/redisStreamRecovery.service';
import { getKisSubscriptionLockStats } from '../realtime/distributedKisSubscriptionLock.service';

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function metric(name: string, value: unknown, help?: string): string[] {
  const lines: string[] = [];
  if (help) lines.push(`# HELP ${name} ${help}`);
  lines.push(`# TYPE ${name} gauge`);
  lines.push(`${name} ${num(value)}`);
  return lines;
}

function parseRedisInfo(raw: string | null): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const line of (raw || '').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes(':')) continue;
    const [k, v] = trimmed.split(':');
    out[k] = Number.isNaN(Number(v)) ? v : Number(v);
  }
  return out;
}

export async function renderPrometheusMetrics(): Promise<string> {
  const lines: string[] = [];
  const redisStats = parseRedisInfo(await safeRedisInfo('stats'));
  const redisMemory = parseRedisInfo(await safeRedisInfo('memory'));
  const realtimeMetrics = await safeHGetAll('metrics:market:realtime');
  const streamRecovery = await getRedisStreamRecoveryStats();
  const lockStats = await getKisSubscriptionLockStats();
  const kisStatus = kisOrderbookWs.getStatus();
  const eventBusStats = marketEventBus.getStats() as Record<string, unknown>;
  const fanoutStats = await socketServer.getRealtimeFanoutStats();
  const streamMetrics = (streamRecovery.metrics || {}) as Record<string, unknown>;
  const pending = (streamRecovery.pending || {}) as Record<string, unknown>;
  const lockMetrics = (lockStats.metrics || {}) as Record<string, unknown>;

  lines.push(...metric('jp_app_up', 1, 'Application process is running'));
  lines.push(...metric('jp_redis_ready', isRedisReady() ? 1 : 0, 'Redis ready state'));
  lines.push(...metric('jp_ws_clients', fanoutStats.clients, 'Connected frontend WebSocket clients'));
  lines.push(...metric('jp_ws_local_orderbook_symbols', fanoutStats.localOrderbookSymbols, 'Local orderbook symbols watched by this WS server'));
  lines.push(...metric('jp_ws_local_trade_symbols', fanoutStats.localTradeSymbols, 'Local trade symbols watched by this WS server'));
  lines.push(...metric('jp_kis_orderbook_subscriptions', kisStatus.orderbook, 'Active KIS orderbook source subscriptions owned by this process'));
  lines.push(...metric('jp_kis_trade_subscriptions', kisStatus.trade, 'Active KIS trade source subscriptions owned by this process'));
  lines.push(...metric('jp_kis_subscription_capacity', kisStatus.max, 'KIS subscription capacity per TR'));

  lines.push(...metric('jp_market_event_trade_events', eventBusStats.tradeEvents, 'Market event bus trade event count'));
  lines.push(...metric('jp_market_event_orderbook_events', eventBusStats.orderbookEvents, 'Market event bus orderbook event count'));
  lines.push(...metric('jp_redis_trade_ticks', realtimeMetrics.tradeTicks, 'Redis realtime trade ticks written'));
  lines.push(...metric('jp_redis_orderbook_ticks', realtimeMetrics.orderbookTicks, 'Redis realtime orderbook ticks written'));
  lines.push(...metric('jp_redis_connected_clients', redisStats.connected_clients, 'Redis connected clients'));
  lines.push(...metric('jp_redis_instantaneous_ops_per_sec', redisStats.instantaneous_ops_per_sec, 'Redis operations per second'));
  lines.push(...metric('jp_redis_used_memory_bytes', redisMemory.used_memory, 'Redis used memory in bytes'));
  lines.push(...metric('jp_redis_mem_fragmentation_ratio', redisMemory.mem_fragmentation_ratio, 'Redis memory fragmentation ratio'));

  lines.push(...metric('jp_stream_recovery_running', streamRecovery.running ? 1 : 0, 'Redis stream recovery worker running'));
  lines.push(...metric('jp_stream_recovery_pending', pending.pending, 'Redis stream consumer group pending rows'));
  lines.push(...metric('jp_stream_recovery_acked_rows', streamMetrics.ackedRows, 'Redis stream recovery acked rows'));
  lines.push(...metric('jp_stream_recovery_reclaimed_rows', streamMetrics.reclaimedRows, 'Redis stream recovery reclaimed rows'));
  lines.push(...metric('jp_stream_recovery_last_max_lag_ms', streamMetrics.lastMaxLagMs, 'Last stream recovery max lag in milliseconds'));

  lines.push(...metric('jp_kis_lock_held_count', lockStats.heldCount, 'Distributed KIS subscription locks held by this process'));
  lines.push(...metric('jp_kis_lock_acquired_total', lockMetrics.acquiredLocks, 'Distributed KIS locks acquired'));
  lines.push(...metric('jp_kis_lock_contended_total', lockMetrics.contendedLocks, 'Distributed KIS locks contended'));
  lines.push(...metric('jp_kis_lock_lost_total', lockMetrics.lostLocks, 'Distributed KIS locks lost'));
  lines.push(...metric('jp_kis_lock_local_fallback_total', lockMetrics.localFallbackLocks, 'KIS lock local fallback count when Redis unavailable'));

  lines.push('');
  return lines.join('\n');
}
