// jp: 호가 탭 패널 - 호가창(좌) + 체결내역(우) 좌우 배치
// jp: 증권앱 표준 레이아웃. 모바일에서도 2단으로 표시

import { useState } from 'react';
import { OrderBook } from './OrderBook';
import { TradeList } from './TradeList';
import { StockInfoPanel } from './StockInfoPanel';

interface OrderBookPanelProps {
  stockCode: string;
}

export function OrderBookPanel({ stockCode }: OrderBookPanelProps) {
  // jp: 좁은 화면 대응 - 탭 전환 방식도 제공
  const [view, setView] = useState<'split' | 'orderbook' | 'trades'>('split');

  return (
    <div>
      {/* jp: 보기 전환 (좁은 화면용) */}
      <div className="flex items-center gap-1 px-4 pt-3">
        <ViewButton label="호가+체결" active={view === 'split'} onClick={() => setView('split')} />
        <ViewButton label="호가" active={view === 'orderbook'} onClick={() => setView('orderbook')} />
        <ViewButton label="체결" active={view === 'trades'} onClick={() => setView('trades')} />
      </div>

      {/* jp: 정보 패널 (거래대금/52주/상한하한/시고저) */}
      <StockInfoPanel stockCode={stockCode} />

      {/* jp: split = 좌우 2단 */}
      {view === 'split' && (
        <div className="flex">
          <div className="flex-1 border-r" style={{ borderColor: 'var(--border)' }}>
            <OrderBook stockCode={stockCode} />
          </div>
          <div className="flex-1">
            <TradeList stockCode={stockCode} />
          </div>
        </div>
      )}

      {view === 'orderbook' && <OrderBook stockCode={stockCode} />}
      {view === 'trades' && <TradeList stockCode={stockCode} />}
    </div>
  );
}

function ViewButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
      style={{
        backgroundColor: active ? 'var(--text-primary)' : 'var(--bg-elevated)',
        color: active ? 'var(--bg-primary)' : 'var(--text-tertiary)',
      }}
    >
      {label}
    </button>
  );
}
