// jp: 호가/체결 전용 실시간 WebSocket (별도 WS로 완전히 분리된 연결)
// jp: 변경: KIS 정책상 TR당 41개 제한 → orderbookSubs/tradeSubs 각각 40개로 제한
// jp:       초과 시 구독 거부 + 경고 로그 (REST 폴링 fallback은 useRealtimeOrderbook에서 처리)

import WebSocket from 'ws';
import { ENV } from '../../config/env';
import { getKisApprovalKey } from './kisAuth.service';
import { isRegularMarketOpen, getMarketStatus, getKstParts } from '../../utils/marketTime';
import { saveLatestOrderbook, appendRecentTrade } from '../market/marketSnapshot.service';
import { marketEventBus } from '../realtime/marketEventBus.service';

export interface RealtimeOrderbook {
  code: string;
  ask: { price: number; volume: number }[];
  bid: { price: number; volume: number }[];
  totalAskVolume: number;
  totalBidVolume: number;
  updatedAt: string;
  backendReceivedAt?: number;
  wsBroadcastAt?: number;
}


export interface RealtimeTrade {
  code: string;
  time: string;
  price: number;
  volume: number;
  change: number;
  side: 'buy' | 'sell';
  strength?: number;
  providerTimestamp?: number;
  backendReceivedAt?: number;
  wsBroadcastAt?: number;
}

type OrderbookCallback = (data: RealtimeOrderbook) => void;
type TradeCallback = (data: RealtimeTrade) => void;

// jp: KIS TR당 최대 41개 구독 가능 → 안전하게 40개로 제한
const KIS_MAX_SUBS_PER_TR = 40;

function isMarketOpen(): boolean {
  return isRegularMarketOpen();
}

class KisOrderbookWsService {
  private ws: WebSocket | null = null;
  private orderbookSubs = new Map<string, Set<OrderbookCallback>>();
  private tradeSubs = new Map<string, Set<TradeCallback>>();
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT = 10;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private connecting = false;
  private marketSwitchTimer: NodeJS.Timeout | null = null;
  // jp: KIS에 실제로 보낸 TR 구독만 별도 추적. 한도 초과로 Map에만 남은 종목이 재연결 때 잘못 구독되는 문제 방지.
  private activeOrderbookCodes = new Set<string>();
  private activeTradeCodes = new Set<string>();

  // jp: 현재 WS TR 구독 수 (종목 기준, 콜백 수 아님)
  private get orderbookSubCount(): number { return this.activeOrderbookCodes.size; }
  private get tradeSubCount(): number { return this.activeTradeCodes.size; }

  private startMarketSwitchTimer(): void {
    if (this.marketSwitchTimer) return;
    this.marketSwitchTimer = setInterval(() => {
      const hasSubs = this.orderbookSubs.size > 0 || this.tradeSubs.size > 0;
      if (!hasSubs) return;
      if (isMarketOpen()) {
        void this.ensureConnected();
      } else if (this.ws?.readyState === WebSocket.OPEN) {
        // jp: 장마감 이후에는 새 실시간 tick이 없으므로 연결만 종료하고 Redis/DB 마지막 snapshot은 유지
        this.ws.close();
        this.ws = null;
      }
    }, 60000);
  }

  private async ensureConnected(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    if (this.connecting) return;
    if (!ENV.KIS.APP_KEY || ENV.KIS.APP_KEY === 'your_app_key_here') return;
    if (!isMarketOpen()) return;

    this.connecting = true;
    try {
      const token = await getKisApprovalKey();
      this.ws = new WebSocket(ENV.KIS.WS_URL);

      this.ws.on('open', () => {
        console.log('[KIS-호가WS] 연결 성공');
        this.connecting = false;
        this.reconnectAttempts = 0;
        const token2 = token;
        let i = 0;
        // jp: 재연결 시 기존 구독 전체 복원 (150ms 간격으로 rate limit 준수)
        for (const code of this.activeOrderbookCodes) {
          setTimeout(() => this.sendSub(code, token2, 'H0STASP0', '1'), i * 150); i++;
        }
        for (const code of this.activeTradeCodes) {
          setTimeout(() => this.sendSub(code, token2, 'H0STCNT0', '1'), i * 150); i++;
        }
      });

      this.ws.on('message', (data: Buffer) => this.handleMessage(data.toString()));

      this.ws.on('close', () => {
        console.warn('[KIS-호가WS] 연결 끊김');
        this.connecting = false;
        if (isMarketOpen() && (this.orderbookSubs.size > 0 || this.tradeSubs.size > 0)) {
          this.scheduleReconnect();
        }
      });

      this.ws.on('error', (err) => {
        console.error('[KIS-호가WS] 오류:', err.message);
        this.connecting = false;
      });
    } catch (err) {
      this.connecting = false;
      console.error('[KIS-호가WS] 연결 실패:', err instanceof Error ? err.message : err);
    }
  }

  private sendSub(code: string, token: string, trId: 'H0STASP0' | 'H0STCNT0', trType: '1' | '2'): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({
      header: { approval_key: token, custtype: 'P', tr_type: trType, 'content-type': 'utf-8' },
      body:   { input: { tr_id: trId, tr_key: code } },
    }));
  }

  // jp: 호가 구독
  // jp: 변경: orderbookSubs 종목 수가 40개 이상이면 신규 종목 WS 구독 거부
  //          (기존 콜백 추가는 허용 — 같은 종목 여러 컴포넌트가 볼 수 있음)
  async subscribeOrderbook(code: string, cb: OrderbookCallback): Promise<void> {
    this.startMarketSwitchTimer();
    const isNew = !this.orderbookSubs.has(code);

    if (isNew) {
      // jp: 신규 종목 구독 시 한도 체크
      if (this.orderbookSubCount >= KIS_MAX_SUBS_PER_TR) {
        console.warn(
          `[KIS-호가WS] 호가 구독 한도 초과 (${KIS_MAX_SUBS_PER_TR}개) — ${code} WS 구독 거부. ` +
          `REST 폴링 fallback으로 동작합니다.`
        );
        // jp: Map에 등록만 하고 KIS 구독은 안 함. 재연결 시 activeOrderbookCodes에 없는 종목은 복원하지 않음.
        this.orderbookSubs.set(code, new Set([cb]));
        return;
      }
      this.orderbookSubs.set(code, new Set());
    }

    this.orderbookSubs.get(code)!.add(cb);

    if (isNew) {
      // jp: 장전/재연결 상황에서도 나중에 실제 KIS 구독이 복원되도록 desired-active 코드로 먼저 등록
      this.activeOrderbookCodes.add(code);
      await this.ensureConnected();
      if (this.ws?.readyState === WebSocket.OPEN) {
        const token = await getKisApprovalKey();
        this.sendSub(code, token, 'H0STASP0', '1');
        console.log(`[KIS-호가WS] 호가 구독: ${code} (${this.orderbookSubCount}/${KIS_MAX_SUBS_PER_TR})`);
      }
    }
  }

  // jp: 체결 구독
  // jp: 변경: tradeSubs 종목 수가 40개 이상이면 신규 종목 WS 구독 거부
  async subscribeTrade(code: string, cb: TradeCallback): Promise<void> {
    this.startMarketSwitchTimer();
    const isNew = !this.tradeSubs.has(code);

    if (isNew) {
      if (this.tradeSubCount >= KIS_MAX_SUBS_PER_TR) {
        console.warn(
          `[KIS-호가WS] 체결 구독 한도 초과 (${KIS_MAX_SUBS_PER_TR}개) — ${code} WS 구독 거부. ` +
          `REST 폴링 fallback으로 동작합니다.`
        );
        this.tradeSubs.set(code, new Set([cb]));
        return;
      }
      this.tradeSubs.set(code, new Set());
    }

    this.tradeSubs.get(code)!.add(cb);

    if (isNew) {
      // jp: 장전/재연결 상황에서도 나중에 실제 KIS 구독이 복원되도록 desired-active 코드로 먼저 등록
      this.activeTradeCodes.add(code);
      await this.ensureConnected();
      if (this.ws?.readyState === WebSocket.OPEN) {
        const token = await getKisApprovalKey();
        this.sendSub(code, token, 'H0STCNT0', '1');
        console.log(`[KIS-호가WS] 체결 구독: ${code} (${this.tradeSubCount}/${KIS_MAX_SUBS_PER_TR})`);
      }
    }
  }

  async unsubscribeOrderbook(code: string, cb: OrderbookCallback): Promise<void> {
    const subs = this.orderbookSubs.get(code);
    if (!subs) return;
    subs.delete(cb);
    if (subs.size === 0) {
      this.orderbookSubs.delete(code);
      this.activeOrderbookCodes.delete(code);
      if (this.ws?.readyState === WebSocket.OPEN) {
        const token = await getKisApprovalKey();
        this.sendSub(code, token, 'H0STASP0', '2');
        console.log(`[KIS-호가WS] 호가 구독 해제: ${code} (${this.orderbookSubCount}/${KIS_MAX_SUBS_PER_TR})`);
      }
      this.closeIfIdle();
    }
  }

  async unsubscribeTrade(code: string, cb: TradeCallback): Promise<void> {
    const subs = this.tradeSubs.get(code);
    if (!subs) return;
    subs.delete(cb);
    if (subs.size === 0) {
      this.tradeSubs.delete(code);
      this.activeTradeCodes.delete(code);
      if (this.ws?.readyState === WebSocket.OPEN) {
        const token = await getKisApprovalKey();
        this.sendSub(code, token, 'H0STCNT0', '2');
        console.log(`[KIS-호가WS] 체결 구독 해제: ${code} (${this.tradeSubCount}/${KIS_MAX_SUBS_PER_TR})`);
      }
      this.closeIfIdle();
    }
  }

  // jp: 구독이 하나도 없으면 WS 연결 종료
  private closeIfIdle(): void {
    if (this.orderbookSubs.size === 0 && this.tradeSubs.size === 0) {
      this.ws?.close();
      this.ws = null;
      this.activeOrderbookCodes.clear();
      this.activeTradeCodes.clear();
      if (this.marketSwitchTimer) {
        clearInterval(this.marketSwitchTimer);
        this.marketSwitchTimer = null;
      }
    }
  }

  private handleMessage(raw: string): void {
    try {
      if (raw === 'PINGPONG') { this.ws?.send('PINGPONG'); return; }
      if (raw.startsWith('{')) {
        const json = JSON.parse(raw);
        if (json.header?.tr_id === 'PINGPONG') { this.ws?.send(raw); return; }
        // jp: 구독 응답 로그 (성공/실패 확인)
        const body = json.body;
        if (body?.rt_cd === '0') {
          console.log(`[KIS-호가WS] 구독 성공: ${json.header?.tr_key ?? ''}`);
        } else if (body?.rt_cd === '1') {
          console.error(`[KIS-호가WS] 구독 실패: ${json.header?.tr_key ?? ''} — ${body.msg1} (${body.msg_cd})`);
        }
        return;
      }

      const parts = raw.split('|');
      if (parts.length < 4) return;
      const trId = parts[1];
      const data = parts[3].split('^');

      if (trId === 'H0STASP0') {
        this.parseOrderbook(data);
      } else if (trId === 'H0STCNT0') {
        this.parseTrade(data);
      }
    } catch { /* 파싱 오류 무시 */ }
  }

  private parseOrderbook(d: string[]): void {
    const backendReceivedAt = Date.now();
    if (d.length < 45) return;
    const code = d[0];
    const ask: { price: number; volume: number }[] = [];
    const bid: { price: number; volume: number }[] = [];

    for (let i = 0; i < 10; i++) {
      ask.push({ price: parseInt(d[3 + i]) || 0, volume: parseInt(d[23 + i]) || 0 });
      bid.push({ price: parseInt(d[13 + i]) || 0, volume: parseInt(d[33 + i]) || 0 });
    }
    ask.reverse();

    const data: RealtimeOrderbook = {
      code, ask, bid,
      totalAskVolume: parseInt(d[43]) || 0,
      totalBidVolume: parseInt(d[44]) || 0,
      updatedAt: new Date().toISOString(),
      backendReceivedAt,
    };
    // jp: 실시간 화면용 최신 호가 캐시/장마감 스냅샷 저장은 화면 전송을 막지 않도록 비동기 처리
    void saveLatestOrderbook(code, data, getMarketStatus());
    const event = marketEventBus.publishOrderbook(data);
    this.orderbookSubs.get(code)?.forEach(cb => cb({ ...data, wsBroadcastAt: event.meta.busPublishedAt }));
  }

  private parseTrade(d: string[]): void {
    const backendReceivedAt = Date.now();
    if (d.length < 14) return;
    const code = d[0];
    const t = d[1] || '';
    const time = t.length >= 6 ? `${t.slice(0,2)}:${t.slice(2,4)}:${t.slice(4,6)}` : t;
    const kst = getKstParts();
    const [yy, mm, dd] = kst.ymd.split('-').map(Number);
    const providerTimestamp = t.length >= 6
      ? Date.UTC(yy, mm - 1, dd, Number(t.slice(0,2)) - 9, Number(t.slice(2,4)), Number(t.slice(4,6)))
      : undefined;
    const sign = d[3];
    const isDown = sign === '4' || sign === '5';
    const change = (isDown ? -1 : 1) * Math.abs(parseInt(d[4]) || 0);
    const strength = parseFloat(d[18]) || undefined;

    const data: RealtimeTrade = {
      code, time,
      price:  parseInt(d[2]) || 0,
      volume: parseInt(d[12]) || 0,
      change,
      side:   isDown ? 'sell' : 'buy',
      strength,
      providerTimestamp,
      backendReceivedAt,
    };
    // jp: 체결은 DB 조회 경로가 아니라 최근 5000개 Redis append + Stream replay 캐시로 유지
    void appendRecentTrade(code, data, getMarketStatus());
    const event = marketEventBus.publishTrade(data);
    this.tradeSubs.get(code)?.forEach(cb => cb({ ...data, wsBroadcastAt: event.meta.busPublishedAt }));
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.MAX_RECONNECT) return;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this.ensureConnected(), delay);
  }

  disconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.marketSwitchTimer) { clearInterval(this.marketSwitchTimer); this.marketSwitchTimer = null; }
    this.ws?.close();
    this.ws = null;
  }

  // jp: 현재 구독 현황 확인 (디버그용)
  getStatus(): { orderbook: number; trade: number; max: number } {
    return {
      orderbook: this.orderbookSubCount,
      trade: this.tradeSubCount,
      max: KIS_MAX_SUBS_PER_TR,
    };
  }
}

export const kisOrderbookWs = new KisOrderbookWsService();
