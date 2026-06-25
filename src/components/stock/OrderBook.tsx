// jp: 호가창 컴포넌트 - 실시간 WS 우선 + 폴링 대갚 (useRealtimeOrderbook)
// jp: 매도 10호가(위, 빨강) / 현재가 / 매수 10호가(아래, 파랑), 잔량 바
// jp: 한국 기준: 파랑/매수=상승, 빨강/매도=하락
// jp: 변경: 장마감/호가없음/데이터없음 상태를 명확히 분리해서 안내 문구 개선

import { useRealtimeOrderbook } from '@/hooks/useRealtimeOrderbook';
import { useStockStore } from '@/store/stockStore';
import { getMarketStatus, getMarketStatusLabel, MarketStatus } from '@/utils/marketTime';

interface OrderBookProps {
  stockCode: string;
}

export function OrderBook({ stockCode }: OrderBookProps) {
  const { orderbook, loading } = useRealtimeOrderbook(stockCode);
  const livePrice = useStockStore((s) => s.prices[stockCode]);
  const marketState = getMarketStatus();

  const hasOrderbook =
    orderbook &&
    !(orderbook.ask.every(a => a.price === 0) && orderbook.bid.every(b => b.price === 0));

  // jp: 장중 로딩 중
  if (loading && marketState === 'REGULAR_OPEN') {
    return (
      <div className="px-4 py-8 text-center text-sm" style={{ color: 'var(--text-tertiary)' }}>
        호가 불러오는 중..
      </div>
    );
  }

  // jp: 실시간 호가 있으면 호가창 표시
  if (hasOrderbook) {
    const currentPrice = livePrice?.price ?? 0;
    const maxVolume = Math.max(
      ...orderbook!.ask.map(a => a.volume),
      ...orderbook!.bid.map(b => b.volume),
      1
    );

    return (
      <div className="px-4 py-3">
        <div className="space-y-0.5">
          {orderbook!.ask.map((level, i) => (
            <OrderRow key={`ask-${i}`} price={level.price} volume={level.volume}
              maxVolume={maxVolume} side="ask" isCurrent={level.price === currentPrice} />
          ))}
        </div>

        <div className="flex items-center justify-center py-2 my-1 rounded-lg"
          style={{ backgroundColor: 'var(--bg-elevated)' }}>
          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>현재가</span>
          <span className="text-sm font-bold ml-2 tabular-nums" style={{ color: 'var(--text-primary)' }}>
            {currentPrice > 0 ? currentPrice.toLocaleString() : '-'}원
          </span>
        </div>

        <div className="space-y-0.5">
          {orderbook!.bid.map((level, i) => (
            <OrderRow key={`bid-${i}`} price={level.price} volume={level.volume}
              maxVolume={maxVolume} side="bid" isCurrent={level.price === currentPrice} />
          ))}
        </div>

        <div className="flex items-center justify-between mt-3 px-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>매도잔량</span>
            <span className="text-xs font-semibold tabular-nums" style={{ color: 'var(--fall)' }}>
              {orderbook!.totalAskVolume.toLocaleString()}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold tabular-nums" style={{ color: 'var(--rise)' }}>
              {orderbook!.totalBidVolume.toLocaleString()}
            </span>
            <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>매수잔량</span>
          </div>
        </div>
      </div>
    );
  }

  // jp: 호가 없음 → 장 상태에 따라 다른 화면
  return <ClosePriceSummary livePrice={livePrice} marketState={marketState} />;
}

// ─────────────────────────────────────────
// jp: 호가 없을 때 대체 화면
// jp: 변경: marketState에 따라 3가지 케이스로 분기
//   1. 장중인데 livePrice도 없음 → 데이터 로딩 실패 안내
//   2. 장마감/주말 + livePrice 있음 → 종가 요약 표시
//   3. 장마감/주말 + livePrice도 없음 → 명확한 안내 문구
// ─────────────────────────────────────────
interface ClosePriceSummaryProps {
  livePrice?: {
    price: number;
    change: number;
    changeRate: number;
    volume: number;
    high: number;
    low: number;
    open: number;
    prevClose: number;
  };
  marketState: MarketStatus;
}

function ClosePriceSummary({ livePrice, marketState }: ClosePriceSummaryProps) {
  // jp: 케이스 1: 장중인데 호가도 현재가도 없음 → 일시적 오류
  if (marketState === 'REGULAR_OPEN' && (!livePrice || !livePrice.price)) {
    return (
      <div className="px-4 py-10 text-center">
        <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
          호가 정보를 불러오지 못했습니다.
        </p>
        <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
          잠시 후 자동으로 다시 시도합니다.
        </p>
      </div>
    );
  }

  // jp: 케이스 2: 장마감/주말 + 현재가 없음 → 안내만
  if (!livePrice || !livePrice.price) {
    const label = getMarketStatusLabel(marketState);
    return (
      <div className="px-4 py-10 text-center">
        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full mb-4"
          style={{ backgroundColor: 'var(--bg-elevated)' }}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--text-tertiary)' }} />
          <span className="text-xs font-semibold" style={{ color: 'var(--text-tertiary)' }}>
            {label} · 호가창 비활성
          </span>
        </div>
        <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
          시세 정보가 아직 없습니다.
        </p>
        <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
          장 시작(09:00) 이후 실시간 호가가 표시됩니다.
        </p>
      </div>
    );
  }

  // jp: 케이스 3: 장마감/주말 + 현재가 있음 → 종가 요약 표시
  const { price, change, changeRate, volume, high, low } = livePrice;
  const up = change > 0;
  const down = change < 0;
  const priceColor = up ? 'var(--rise)' : down ? 'var(--fall)' : 'var(--text-primary)';
  const sign = up ? '+' : '';
  const label = getMarketStatusLabel(marketState);

  return (
    <div className="px-4 py-5">


    </div>
  );
}

function SummaryRow({ label, value, valueColor, last }: {
  label: string; value: string; valueColor?: string; last?: boolean
}) {
  return (
    <div
      className="flex items-center justify-between px-4 py-3"
      style={{ borderBottom: last ? 'none' : '1px solid var(--border-subtle)' }}
    >
      <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{label}</span>
      <span className="text-sm font-semibold tabular-nums"
        style={{ color: valueColor ?? 'var(--text-primary)' }}>
        {value}
      </span>
    </div>
  );
}

interface OrderRowProps {
  price: number;
  volume: number;
  maxVolume: number;
  side: 'ask' | 'bid';
  isCurrent: boolean;
}

function OrderRow({ price, volume, maxVolume, side, isCurrent }: OrderRowProps) {
  const barWidth = maxVolume > 0 ? (volume / maxVolume) * 100 : 0;
  const color = side === 'ask' ? 'var(--fall)' : 'var(--rise)';
  const barColor = side === 'ask' ? 'rgba(92, 138, 255, 0.15)' : 'rgba(255, 82, 82, 0.15)';

  if (price === 0) return <div className="h-7" />;

  return (
    <div className="relative flex items-center justify-between h-7 px-2 rounded"
      style={{
        backgroundColor: isCurrent ? 'var(--bg-elevated)' : 'transparent',
        border: isCurrent ? '1px solid var(--border)' : '1px solid transparent',
      }}>
      <div className="absolute top-0 bottom-0 rounded transition-all duration-300"
        style={{
          [side === 'ask' ? 'left' : 'right']: 0,
          width: `${barWidth}%`,
          backgroundColor: barColor,
        }} />
      <span className="relative text-sm font-semibold tabular-nums" style={{ color }}>
        {price.toLocaleString()}
      </span>
      <span className="relative text-xs tabular-nums" style={{ color: 'var(--text-secondary)' }}>
        {volume.toLocaleString()}
      </span>
    </div>
  );
}
