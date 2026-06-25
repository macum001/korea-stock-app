// jp: 거래원 정보 - 증권사별 매도/매수 상위 5 + 외국계 추정
// jp: KIS inquire-member 기반. 당일 현재 기준. 60초 캐시.
import { useState, useEffect } from 'react';
import { stockService, MemberFlow } from '@/services/stockService';

interface MemberFlowSectionProps {
  stockCode: string;
}

function fmtQty(n: number): string {
  return Math.abs(n).toLocaleString();
}

export function MemberFlowSection({ stockCode }: MemberFlowSectionProps) {
  const [data, setData] = useState<MemberFlow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    stockService.getMemberFlow(stockCode).then((d) => {
      if (!cancelled) { setData(d); setLoading(false); }
    }).catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [stockCode]);

  if (loading) {
    return (
      <div className="mx-4 mt-4 rounded-2xl p-4" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>거래원 정보 불러오는 중..</p>
      </div>
    );
  }
  if (!data || (data.sell.length === 0 && data.buy.length === 0)) {
    return (
      <div className="mx-4 mt-4 rounded-2xl p-4 text-center" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>거래원 정보가 아직 없어요</p>
      </div>
    );
  }

  const net = data.globalNetQty;
  const netColor = net > 0 ? 'var(--rise)' : net < 0 ? 'var(--fall)' : 'var(--text-secondary)';
  const netSign = net > 0 ? '+' : net < 0 ? '−' : '';

  return (
    <div className="mx-4 mt-4 rounded-2xl overflow-hidden" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
        <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>거래원 정보</span>
        <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>당일 기준 · 외(외국계)</span>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div style={{ borderRight: '1px solid var(--border)' }}>
          <div className="flex justify-between px-4 pt-3 pb-1 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
            <span>매도 상위</span><span>거래량</span>
          </div>
          <div className="px-4 pb-2">
            {data.sell.map((m, i) => (
              <div key={i} className="flex justify-between items-center py-1.5 text-[13px]">
                <span style={{ color: 'var(--fall)' }}>
                  {m.name}
                  {m.isGlobal && <span className="ml-1 text-[9px] px-1 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>외</span>}
                </span>
                <span className="tabular-nums" style={{ color: 'var(--text-secondary)' }}>{fmtQty(m.qty)}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="flex justify-between px-4 pt-3 pb-1 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
            <span>매수 상위</span><span>거래량</span>
          </div>
          <div className="px-4 pb-2">
            {data.buy.map((m, i) => (
              <div key={i} className="flex justify-between items-center py-1.5 text-[13px]">
                <span style={{ color: 'var(--rise)' }}>
                  {m.name}
                  {m.isGlobal && <span className="ml-1 text-[9px] px-1 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>외</span>}
                </span>
                <span className="tabular-nums" style={{ color: 'var(--text-secondary)' }}>{fmtQty(m.qty)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="px-4 py-3" style={{ borderTop: '1px solid var(--border)', backgroundColor: 'var(--bg-elevated)' }}>
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>외국계 추정</span>
          <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>매도비중 {data.globalSellRlim.toFixed(1)}%</span>
        </div>
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
          <div>
            <div className="text-[10px] mb-0.5" style={{ color: 'var(--text-tertiary)' }}>매도</div>
            <div className="text-[13px] tabular-nums" style={{ color: 'var(--fall)' }}>{fmtQty(data.globalSellQty)}</div>
          </div>
          <div>
            <div className="text-[10px] mb-0.5" style={{ color: 'var(--text-tertiary)' }}>매수</div>
            <div className="text-[13px] tabular-nums" style={{ color: 'var(--rise)' }}>{fmtQty(data.globalBuyQty)}</div>
          </div>
          <div>
            <div className="text-[10px] mb-0.5" style={{ color: 'var(--text-tertiary)' }}>순매수</div>
            <div className="text-[13px] font-semibold tabular-nums" style={{ color: netColor }}>{netSign}{fmtQty(net)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
