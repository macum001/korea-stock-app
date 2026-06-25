// jp: 호가/체결 실시간 훅 - WebSocket push 중심 + REST 1회 bootstrap
// jp: 실시간 경로에서 반복 polling 제거. 끊김/장마감 시 마지막 화면 데이터 유지.
// jp: 성능 개선: quote는 latest ref에 저장 후 100~300ms 단위 반영, trade는 buffer에 모아 100~200ms 단위 반영.

import { useEffect, useState, useRef } from 'react';
import { websocketService } from '@/services/websocketService';
import { orderbookService } from '@/services/orderbookService';
import { tradesService, TradeTick } from '@/services/tradesService';
import { Orderbook } from '@/types/stock';

interface TradeSnapshotPayload {
  code: string;
  trades: TradeTick[];
  __snapshot: true;
}

function isTradeSnapshot(payload: unknown): payload is TradeSnapshotPayload {
  return !!payload && typeof payload === 'object' && (payload as TradeSnapshotPayload).__snapshot === true;
}

function perfNow(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function logRealtimeLatency(kind: 'quote' | 'trade', payload: Record<string, unknown>, frontendAt: number): void {
  if (!import.meta.env.DEV) return;
  const backendReceivedAt = Number(payload.backendReceivedAt ?? 0);
  const wsBroadcastAt = Number(payload.wsBroadcastAt ?? 0);
  const providerTs = Number(payload.providerTimestamp ?? 0);
  if (!backendReceivedAt && !wsBroadcastAt && !providerTs) return;
  console.debug('[latency-debug]', {
    kind,
    code: payload.code,
    providerToBackendMs: providerTs ? backendReceivedAt - providerTs : undefined,
    backendToBroadcastMs: backendReceivedAt && wsBroadcastAt ? wsBroadcastAt - backendReceivedAt : undefined,
    broadcastToFrontendMs: wsBroadcastAt ? Date.now() - wsBroadcastAt : undefined,
    frontendReceivedAt: frontendAt,
  });
}

// jp: 호가 실시간 훅 - quote는 append가 아니라 최신 snapshot 덮어쓰기
export function useRealtimeOrderbook(stockCode: string) {
  const [orderbook, setOrderbook] = useState<Orderbook | null>(null);
  const [loading, setLoading] = useState(true);
  const hasWsDataRef = useRef(false);
  const latestRef = useRef<Orderbook | null>(null);

  useEffect(() => {
    let cancelled = false;
    let flushTimer: ReturnType<typeof setInterval> | null = null;
    hasWsDataRef.current = false;
    latestRef.current = null;
    setLoading(true);

    websocketService.connect();

    const onWs = (payload: unknown) => {
      if (cancelled) return;
      hasWsDataRef.current = true;
      latestRef.current = payload as Orderbook;
      logRealtimeLatency('quote', payload as Record<string, unknown>, perfNow());
      setLoading(false);
    };
    websocketService.subscribeOrderbook(stockCode, onWs);

    // jp: 호가 폭주 시 React 전체 리렌더링을 막기 위해 최신값만 150ms 단위로 화면 반영
    flushTimer = setInterval(() => {
      if (cancelled || !latestRef.current) return;
      setOrderbook(latestRef.current);
    }, 150);

    // jp: 초기 화면만 REST snapshot으로 채움. 이후 반복 polling은 하지 않음.
    orderbookService.getOrderbook(stockCode).then((data) => {
      if (cancelled || hasWsDataRef.current) return;
      if (data) setOrderbook(data);
      setLoading(false);
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
      if (flushTimer) clearInterval(flushTimer);
      websocketService.unsubscribeOrderbook(stockCode, onWs);
      // jp: setOrderbook(null) 금지 — 탭 전환/끊김/장마감에도 마지막 호가 보존
    };
  }, [stockCode]);

  return { orderbook, loading };
}

// jp: 체결 실시간 훅 - 서버 snapshot 300개 + 신규 tick append, 기본 300개 유지
export function useRealtimeTrades(stockCode: string, maxRows = 300) {
  const [trades, setTrades] = useState<TradeTick[]>([]);
  const [loading, setLoading] = useState(true);
  const hasWsDataRef = useRef(false);
  const bufferRef = useRef<TradeTick[]>([]);
  const seenKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    let flushTimer: ReturnType<typeof setInterval> | null = null;
    hasWsDataRef.current = false;
    bufferRef.current = [];
    seenKeysRef.current = new Set();
    setLoading(true);

    websocketService.connect();

    const onWs = (payload: unknown) => {
      if (cancelled) return;
      hasWsDataRef.current = true;

      if (isTradeSnapshot(payload)) {
        const snapshot = payload.trades.slice(0, maxRows);
        seenKeysRef.current = new Set(snapshot.map(t => `${t.time}|${t.price}|${t.volume}|${t.side}`));
        setTrades(snapshot);
      } else {
        const tick = payload as TradeTick;
        const key = `${tick.time}|${tick.price}|${tick.volume}|${tick.side}`;
        // jp: 재연결 직후 snapshot + live tick이 겹치는 경우 중복 체결 행 방지
        if (!seenKeysRef.current.has(key)) {
          seenKeysRef.current.add(key);
          bufferRef.current.unshift(tick);
        }
        logRealtimeLatency('trade', payload as Record<string, unknown>, perfNow());
      }
      setLoading(false);
    };
    websocketService.subscribeTrade(stockCode, onWs);

    // jp: 체결 tick마다 setState하지 않고 120ms 단위로 batch append. 300행 이상에서도 렌더 부담 완화.
    flushTimer = setInterval(() => {
      if (cancelled || bufferRef.current.length === 0) return;
      const batch = bufferRef.current.splice(0, bufferRef.current.length);
      setTrades(prev => {
        const next = [...batch, ...prev].slice(0, maxRows);
        seenKeysRef.current = new Set(next.map(t => `${t.time}|${t.price}|${t.volume}|${t.side}`));
        return next;
      });
    }, 120);

    // jp: 초기 화면만 REST/Redis snapshot으로 채움. 장중 신규 체결은 WS append로만 반영.
    tradesService.getTrades(stockCode, maxRows).then((data) => {
      if (cancelled || hasWsDataRef.current) return;
      if (data.length > 0) {
        const snapshot = data.slice(0, maxRows);
        seenKeysRef.current = new Set(snapshot.map(t => `${t.time}|${t.price}|${t.volume}|${t.side}`));
        setTrades(snapshot);
      }
      setLoading(false);
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
      if (flushTimer) clearInterval(flushTimer);
      websocketService.unsubscribeTrade(stockCode, onWs);
      // jp: setTrades([]) 금지 — 마지막 체결 목록 유지
    };
  }, [stockCode, maxRows]);

  return { trades, loading };
}
