// jp: 자체 Candle Engine
// jp: 체결 tick → 1분봉 생성/갱신 → 3/5/10/15/30/60/120/240분봉 집계 기반 제공

import { safeGet, safeSetEx } from '../../config/redis';
import { saveMinuteCandles, MinuteCandle } from '../../repositories/minuteCandle.repository';
import type { RealtimeTrade } from '../kis/kisOrderbookWs.service';
import { marketEventBus } from '../realtime/marketEventBus.service';

const LIVE_CANDLE_TTL = 60 * 60 * 8;
const FLUSH_DELAY_MS = 1500;
const pending = new Map<string, MinuteCandle>();
const flushTimers = new Map<string, NodeJS.Timeout>();

const key1m = (code: string, bucket: number) => `candle:1m:live:${code}:${bucket}`;
const latestKey = (code: string) => `candle:1m:latest:${code}`;

function getKstSessionBucket(timestampMs: number, unitMinutes: number): number {
  const utc = new Date(timestampMs);
  const kstMs = utc.getTime() + 9 * 60 * 60 * 1000;
  const kst = new Date(kstMs);
  const y = kst.getUTCFullYear();
  const m = kst.getUTCMonth();
  const d = kst.getUTCDate();
  const sessionStartUtcSec = Math.floor((Date.UTC(y, m, d, 9, 0, 0) - 9 * 60 * 60 * 1000) / 1000);
  const tsSec = Math.floor(timestampMs / 1000);
  const unitSec = unitMinutes * 60;
  const elapsed = Math.max(0, tsSec - sessionStartUtcSec);
  return sessionStartUtcSec + Math.floor(elapsed / unitSec) * unitSec;
}

async function readCandle(code: string, bucket: number): Promise<MinuteCandle | null> {
  const raw = await safeGet(key1m(code, bucket));
  if (!raw) return null;
  try { return JSON.parse(raw) as MinuteCandle; } catch { return null; }
}

function scheduleFlush(code: string): void {
  const old = flushTimers.get(code);
  if (old) clearTimeout(old);
  flushTimers.set(code, setTimeout(async () => {
    flushTimers.delete(code);
    const rows = [...pending.entries()]
      .filter(([k]) => k.startsWith(`${code}:`))
      .map(([k, v]) => {
        pending.delete(k);
        return v;
      });
    if (rows.length > 0) await saveMinuteCandles(code, rows);
  }, FLUSH_DELAY_MS));
}

export async function updateLiveMinuteCandle(trade: RealtimeTrade): Promise<MinuteCandle | null> {
  if (!trade.code || !trade.price || !trade.volume) return null;
  const ts = trade.providerTimestamp ?? trade.backendReceivedAt ?? Date.now();
  const bucket = getKstSessionBucket(ts, 1);
  const prev = await readCandle(trade.code, bucket);
  const next: MinuteCandle = prev ? {
    time: bucket,
    open: prev.open,
    high: Math.max(prev.high, trade.price),
    low: Math.min(prev.low, trade.price),
    close: trade.price,
    volume: prev.volume + trade.volume,
  } : {
    time: bucket,
    open: trade.price,
    high: trade.price,
    low: trade.price,
    close: trade.price,
    volume: trade.volume,
  };

  await safeSetEx(key1m(trade.code, bucket), LIVE_CANDLE_TTL, JSON.stringify(next));
  await safeSetEx(latestKey(trade.code), LIVE_CANDLE_TTL, JSON.stringify(next));
  pending.set(`${trade.code}:${bucket}`, next);
  scheduleFlush(trade.code);
  return next;
}

export async function getLatestLiveMinuteCandle(code: string): Promise<MinuteCandle | null> {
  const raw = await safeGet(latestKey(code));
  if (!raw) return null;
  try { return JSON.parse(raw) as MinuteCandle; } catch { return null; }
}

export function mergeLatestLiveCandle(candles: MinuteCandle[], live: MinuteCandle | null): MinuteCandle[] {
  if (!live) return candles;
  const idx = candles.findIndex(c => c.time === live.time);
  if (idx >= 0) {
    const next = candles.slice();
    next[idx] = live;
    return next;
  }
  return [...candles, live].sort((a, b) => a.time - b.time);
}

export function startLiveCandleEngine(): void {
  marketEventBus.on('trade', (event) => {
    void updateLiveMinuteCandle(event.data);
  });
  console.log('[CandleEngine] live tick → 1분봉 엔진 시작');
}

export const candleBucket = { getKstSessionBucket };
