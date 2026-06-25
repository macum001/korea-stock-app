// jp: 한국투자증권 WebSocket + REST 폴링 혼합 방식
// jp: 장중(9:00~15:30) → WebSocket 실시간
// jp: 장외 → REST 폴링 (5초마다)

import WebSocket from 'ws';
import { ENV } from '../../config/env';
import { getKisApprovalKey } from './kisAuth.service';
import { getStockPrice } from './kisRest.service';
import { cacheStockPrice } from '../cache/stockCache.service';
import { StockPrice } from '../../types';
import { isRegularMarketOpen } from '../../utils/marketTime';

type PriceCallback = (price: StockPrice) => void;

// jp: 장중 여부 체크는 서버 timezone이 아니라 Asia/Seoul 기준 marketTime 유틸만 사용
function isMarketOpen(): boolean {
  return isRegularMarketOpen();
}

class KisWebSocketService {
  private ws: WebSocket | null = null;
  private subscribers = new Map<string, Set<PriceCallback>>();
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT = 10;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private pollTimer: NodeJS.Timeout | null = null; // jp: REST 폴링 타이머
  private watchdogTimer: NodeJS.Timeout | null = null; // jp: 좀비 연결 감지
  private lastMessageAt = 0; // jp: 마지막 메시지 수신 시각
  private currentMode: 'websocket' | 'polling' | 'mock' = 'mock';
  private isMock = false;
  private marketSwitchTimer: NodeJS.Timeout | null = null;

  // jp: mock 가격 상태
  private mockPrices: Record<string, number> = {
    '000660':198500,'005930':74800,'042700':128000,
    '196170':312000,'034020':21450,'035720':38500,
    '035420':182500,'207940':876000,
  };

  async connect(): Promise<void> {
    // jp: 상용 모드(USE_MOCK_DATA=false)에서는 가짜 시세 시뮬레이션 금지
    const allowMock = ENV.USE_MOCK_DATA;

    // jp: API 키 없음
    if (!ENV.KIS.APP_KEY || ENV.KIS.APP_KEY === 'your_app_key_here') {
      if (allowMock) {
        console.log('[KIS] mock 모드 - 시뮬레이션 사용 (개발용)');
        this.isMock = true;
        this.currentMode = 'mock';
        this.startMockSimulation();
      } else {
        // jp: 상용인데 키 없음 → 시세 없음 (가짜 데이터 금지)
        console.warn('[KIS] API 키 미설정 - 실시간 시세 비활성 (가짜 데이터 금지)');
        this.currentMode = 'mock'; // jp: 상태값은 유지하되 시뮬레이션은 안 돌림
      }
      return;
    }

    // jp: 장중이면 WebSocket, 장외면 REST 폴링
    if (isMarketOpen()) {
      console.log('[KIS] 장중 → WebSocket 모드');
      await this.connectWebSocket();
    } else {
      console.log('[KIS] 장외 → REST 폴링 모드');
      this.startPolling();
    }

    // jp: 1분마다 장 상태 체크해서 자동 전환. connect() 재호출 시 타이머 중복 생성 방지
    if (!this.marketSwitchTimer) {
      this.marketSwitchTimer = setInterval(() => this.checkMarketAndSwitch(), 60000);
    }
  }

  // jp: 장 상태에 따라 자동 전환
  private async checkMarketAndSwitch(): Promise<void> {
    if (this.isMock) return;

    const open = isMarketOpen();

    if (open && this.currentMode !== 'websocket') {
      console.log('[KIS] 장 시작 → WebSocket으로 전환');
      this.stopPolling();
      await this.connectWebSocket();
    } else if (!open && this.currentMode === 'websocket') {
      console.log('[KIS] 장 마감 → REST 폴링으로 전환');
      this.disconnectWebSocket();
      this.startPolling();
    }
  }

  // jp: WebSocket 연결
  private async connectWebSocket(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    try {
      const token = await getKisApprovalKey();
      console.log('[KIS-WS] 연결 시도...');
      this.ws = new WebSocket(ENV.KIS.WS_URL);

      this.ws.on('open', () => {
        console.log('[KIS-WS] 연결 성공');
        this.currentMode = 'websocket';
        this.reconnectAttempts = 0;
        // jp: 중요 - WebSocket 연결되면 REST 폴링 중지 (이중 호출로 EGW00201 방지)
        this.stopPolling();
        this.startPing();
        // jp: 기존 구독 종목 재등록 - 간격 두고 순차 전송 (한꺼번에 보내면 일부 누락)
        const codes = Array.from(this.subscribers.keys());
        codes.forEach((code, i) => {
          setTimeout(() => this.sendSubscribeMsg(code, token, '1'), i * 200);
        });
      });

      this.ws.on('message', (data: Buffer) => this.handleWsMessage(data.toString()));

      this.ws.on('close', () => {
        console.warn('[KIS-WS] 연결 끊김');
        this.stopPing();
        this.currentMode = 'polling';
        // jp: 장중이면 재연결, 장외면 폴링으로
        if (isMarketOpen()) {
          this.scheduleReconnect();
        } else {
          this.startPolling();
        }
      });

      this.ws.on('error', (err) => {
        console.error('[KIS-WS] 에러:', err.message);
      });

    } catch (err) {
      console.error('[KIS-WS] 연결 실패:', err);
      this.startPolling(); // jp: 실패하면 폴링으로
    }
  }

  private disconnectWebSocket(): void {
    this.stopPing();
    this.ws?.close();
    this.ws = null;
  }

  // jp: REST 폴링 - 5초마다 현재가 조회
  private startPolling(): void {
    if (this.pollTimer) return;
    this.currentMode = 'polling';
    console.log('[KIS] REST 폴링 시작 (5초 간격)');

    const poll = async () => {
      if (this.subscribers.size === 0) return;

      // jp: 구독 종목 순서대로 조회 (rate limit 고려)
      for (const [code, cbs] of this.subscribers) {
        try {
          const price = await getStockPrice(code);
          cbs.forEach(cb => cb(price));
          // jp: 각 요청 사이 300ms 간격 (KIS rate limit 250ms 여유)
          await new Promise(r => setTimeout(r, 300));
        } catch (err) {
          console.error(`[KIS] 폴링 실패 (${code}):`, err);
        }
      }
    };

    // jp: 즉시 1회 실행 후 5초마다 반복
    poll();
    this.pollTimer = setInterval(poll, 5000);
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  // jp: 종목 구독
  subscribe(code: string, cb: PriceCallback): void {
    if (!this.subscribers.has(code)) {
      // jp: KIS WebSocket은 세션당 최대 41종목. 초과 시 KIS가 거부하므로 미리 차단
      // jp: 안전하게 40으로 제한 (지수/기타 여유분 고려)
      const KIS_MAX_SUBSCRIPTIONS = 40;
      if (this.subscribers.size >= KIS_MAX_SUBSCRIPTIONS) {
        console.warn(`[KIS] 구독 한도(${KIS_MAX_SUBSCRIPTIONS}) 초과 - ${code} 구독 보류 (REST 폴링으로 가격 제공)`);
        // jp: 한도 초과 종목도 콜백은 등록 (REST batch로 가격이 채워짐). WebSocket 구독만 생략
        if (!this.subscribers.has(code)) this.subscribers.set(code, new Set());
        this.subscribers.get(code)!.add(cb);
        return;
      }
      this.subscribers.set(code, new Set());
      if (this.currentMode === 'websocket' && this.ws?.readyState === WebSocket.OPEN) {
        getKisApprovalKey().then(token => this.sendSubscribeMsg(code, token, '1'));
      }
    }
    this.subscribers.get(code)!.add(cb);
    console.log(`[KIS] 구독: ${code} (${this.subscribers.size}/40, 모드: ${this.currentMode})`);
  }

  unsubscribe(code: string, cb: PriceCallback): void {
    const subs = this.subscribers.get(code);
    if (!subs) return;
    subs.delete(cb);
    if (subs.size === 0) {
      this.subscribers.delete(code);
      if (this.currentMode === 'websocket' && this.ws?.readyState === WebSocket.OPEN) {
        getKisApprovalKey().then(token => this.sendSubscribeMsg(code, token, '2'));
      }
    }
  }

  // jp: WebSocket 구독 메시지 전송
  private sendSubscribeMsg(code: string, token: string, trType: '1' | '2'): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({
      header: { approval_key: token, custtype: 'P', tr_type: trType, 'content-type': 'utf-8' },
      body:   { input: { tr_id: 'H0STCNT0', tr_key: code } },
    }));
    console.log(`[KIS-WS] ${trType === '1' ? '구독' : '해제'} 전송: ${code}`);
  }

  // jp: WebSocket 메시지 파싱
  private handleWsMessage(raw: string): void {
    try {
      this.lastMessageAt = Date.now(); // jp: watchdog용 - 메시지 수신 시각 갱신
      if (raw === 'PINGPONG') { this.ws?.send('PINGPONG'); return; }
      if (raw.startsWith('{')) {
        const json = JSON.parse(raw);
        if (json.header?.tr_id === 'PINGPONG') { this.ws?.send(raw); return; }
        // jp: 구독 응답 로깅 (어떤 종목이 성공/실패하는지 진단)
        const body = json.body;
        if (body) {
          const trKey = json.header?.tr_key || '';
          if (body.rt_cd === '0') {
            console.log(`[KIS-WS] 구독 성공: ${trKey || body.msg1}`);
          } else if (body.rt_cd === '1') {
            console.error(`[KIS-WS] 구독 거부: ${trKey} - ${body.msg1} (${body.msg_cd})`);
          }
        }
        return;
      }
      const parts = raw.split('|');
      if (parts.length < 4 || parts[1] !== 'H0STCNT0') return;

      const data = parts[3].split('^');
      if (!data || data.length < 13) return;

      // jp: KIS H0STCNT0 실시간 체결가 필드 순서 (^ 구분)
      // jp: [0]종목코드 [1]체결시간 [2]현재가 [3]전일대비부호 [4]전일대비 [5]등락률
      // jp: [6]가중평균가 [7]시가 [8]고가 [9]저가 [12]체결량(1건) [13]누적거래량
      const code = data[0];
      const price = parseInt(data[2]) || 0;
      // jp: 부호: 1상한 2상승 3보합 4하한 5하락 → 4,5는 하락(음수)
      const sign = data[3];
      const isDown = sign === '4' || sign === '5';
      const rawChange = parseInt(data[4]) || 0;
      const rawRate = parseFloat(data[5]) || 0;
      const change = isDown ? -Math.abs(rawChange) : Math.abs(rawChange);
      const changeRate = isDown ? -Math.abs(rawRate) : Math.abs(rawRate);

      const priceObj = {
        code, name: code, price,
        change,
        changeRate,
        // jp: [13] 누적거래량 (증권앱 표시값). [12]는 이번 체결 1건이라 쓰면 안 됨
        volume:    parseInt(data[13]) || 0,
        open:      parseInt(data[7]) || 0,
        high:      parseInt(data[8]) || 0,
        low:       parseInt(data[9]) || 0,
        prevClose: price - change,
        updatedAt: new Date().toISOString(),
      };

      // jp: 핵심 - 실시간 가격을 캐시에 저장 → REST 현재가 호출 불필요 (토스 방식)
      void cacheStockPrice(priceObj);

      this.subscribers.get(code)?.forEach(cb => cb(priceObj));
    } catch { /* 파싱 에러 무시 */ }
  }

  // jp: KIS WebSocket은 서버(KIS)가 PINGPONG을 보내면 그대로 echo만 함 (handleWsMessage에서 처리)
  // jp: 대신 watchdog로 좀비 연결 감지: 일정 시간 메시지가 없으면 강제 재연결
  private startPing(): void {
    this.stopPing();
    this.lastMessageAt = Date.now();
    // jp: 45초마다 체크 - 마지막 메시지 후 90초 넘게 조용하면 죽은 연결로 보고 재연결
    // jp: (장중엔 PINGPONG 포함 주기적으로 뭔가 오므로, 90초 침묵은 비정상)
    this.watchdogTimer = setInterval(() => {
      if (this.lastMessageAt && Date.now() - this.lastMessageAt > 90000) {
        console.warn('[KIS-WS] 90초간 데이터 없음 - 죽은 연결로 판단, 재연결');
        try { this.ws?.close(); } catch { /* ignore */ }
      }
    }, 45000);
  }

  private stopPing(): void {
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
    if (this.watchdogTimer) { clearInterval(this.watchdogTimer); this.watchdogTimer = null; }
  }

  // jp: 지수 백오프 재연결
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.MAX_RECONNECT) {
      // jp: 한도 도달 → 폴링으로 임시 전환하되, 30초 후 재연결 카운터 리셋하고 다시 WebSocket 시도
      // jp: (영구 폴링 정지 방지 - 장중엔 반드시 WebSocket로 복귀해야 함)
      console.error('[KIS-WS] 최대 재연결 횟수 초과 - 폴링 임시 전환, 30초 후 재시도');
      this.startPolling();
      if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
      this.reconnectTimer = setTimeout(() => {
        this.reconnectAttempts = 0; // jp: 카운터 리셋
        if (isMarketOpen()) this.connectWebSocket();
      }, 30000);
      return;
    }
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;
    console.log(`[KIS-WS] ${delay}ms 후 재연결 (${this.reconnectAttempts}/${this.MAX_RECONNECT})`);
    this.reconnectTimer = setTimeout(() => this.connectWebSocket(), delay);
  }

  // jp: mock 시뮬레이션
  private startMockSimulation(): void {
    // jp: 안전장치 - 상용 모드에서는 절대 가짜 시세 생성 안 함
    if (!ENV.USE_MOCK_DATA) {
      console.warn('[KIS] 상용 모드 - mock 시뮬레이션 차단됨');
      return;
    }
    setInterval(() => {
      this.subscribers.forEach((cbs, code) => {
        const base  = this.mockPrices[code] || 50000;
        const delta = Math.floor((Math.random() - 0.48) * base * 0.004);
        this.mockPrices[code] = Math.max(1, base + delta);
        const price = this.mockPrices[code];
        cbs.forEach(cb => cb({
          code, name: code, price, change: delta,
          changeRate: parseFloat(((delta / base) * 100).toFixed(2)),
          volume:     Math.floor(Math.random() * 10000),
          high: price + 500, low: price - 500,
          open: base, prevClose: base,
          updatedAt: new Date().toISOString(),
        }));
      });
    }, 1000);
  }

  // jp: 현재 모드 반환 (상태 확인용)
  getMode(): string { return this.currentMode; }

  disconnect(): void {
    this.stopPing();
    this.stopPolling();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.marketSwitchTimer) { clearInterval(this.marketSwitchTimer); this.marketSwitchTimer = null; }
    this.ws?.close();
    this.ws = null;
  }
}

export const kisWsService = new KisWebSocketService();
