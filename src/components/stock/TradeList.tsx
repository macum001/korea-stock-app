// jp: 체결내역 컴포넌트 - WebSocket append + 300행 이상 virtualized rendering
// jp: DOM에는 보이는 행만 렌더링해서 체결 폭주/모바일 스크롤에서도 프레임 드랍을 줄임

import { useMemo, useState } from 'react';
import { useRealtimeTrades } from '@/hooks/useRealtimeOrderbook';

interface TradeListProps {
  stockCode: string;
}

const ROW_HEIGHT = 34;
const VIEWPORT_HEIGHT = 420;
const OVERSCAN = 8;

export function TradeList({ stockCode }: TradeListProps) {
  const { trades, loading } = useRealtimeTrades(stockCode, 300);
  const [scrollTop, setScrollTop] = useState(0);

  const { visibleTrades, offsetY, totalHeight } = useMemo(() => {
    const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
    const visibleCount = Math.ceil(VIEWPORT_HEIGHT / ROW_HEIGHT) + OVERSCAN * 2;
    const end = Math.min(trades.length, start + visibleCount);
    return {
      visibleTrades: trades.slice(start, end).map((trade, localIndex) => ({
        trade,
        index: start + localIndex,
      })),
      offsetY: start * ROW_HEIGHT,
      totalHeight: trades.length * ROW_HEIGHT,
    };
  }, [trades, scrollTop]);

  if (loading) {
    return (
      <div className="px-4 py-8 text-center text-sm" style={{ color: 'var(--text-tertiary)' }}>
        체결내역 불러오는 중...
      </div>
    );
  }

  if (trades.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-sm" style={{ color: 'var(--text-tertiary)' }}>
        장 시간에 체결내역이 표시돼요.<br />
        <span className="text-xs">장마감 후에는 마지막 체결 snapshot을 유지합니다.</span>
      </div>
    );
  }

  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between px-2 py-2 text-[11px] font-semibold"
        style={{ color: 'var(--text-tertiary)', borderBottom: '1px solid var(--border)' }}>
        <span className="flex-1">체결시각</span>
        <span className="flex-1 text-right">체결가</span>
        <span className="flex-1 text-right">체결량</span>
      </div>

      <div
        className="overflow-y-auto"
        style={{ maxHeight: VIEWPORT_HEIGHT, contain: 'strict' }}
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      >
        <div style={{ height: totalHeight, position: 'relative' }}>
          <div style={{ transform: `translateY(${offsetY}px)` }}>
            {visibleTrades.map(({ trade: t, index }) => {
              const color = t.side === 'buy' ? 'var(--rise)' : 'var(--fall)';
              return (
                <div
                  key={`${t.time}-${t.price}-${t.volume}-${index}`}
                  className="flex items-center justify-between px-2"
                  style={{
                    height: ROW_HEIGHT,
                    borderBottom: '1px solid var(--border-subtle)',
                  }}
                >
                  <span className="flex-1 text-xs tabular-nums" style={{ color: 'var(--text-tertiary)' }}>
                    {t.time}
                  </span>
                  <span className="flex-1 text-right text-sm font-semibold tabular-nums" style={{ color }}>
                    {t.price.toLocaleString()}
                  </span>
                  <span className="flex-1 text-right text-xs tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                    {t.volume.toLocaleString()}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <p className="pt-2 text-[10px] text-right" style={{ color: 'var(--text-tertiary)' }}>
        최근 {trades.length.toLocaleString()}건 유지 · 화면 렌더링 최적화 적용
      </p>
    </div>
  );
}
