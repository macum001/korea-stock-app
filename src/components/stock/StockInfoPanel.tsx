// jp: 호가 탭 정보 패널 - 거래대금/52주/상한하한/시고저 (미래에셋 스타일)
// jp: 실시간 시고저는 store, 나머지는 getStock(KIS)에서
import { useState, useEffect } from 'react';
import { stockService } from '@/services/stockService';
import { Stock } from '@/types/stock';
import { useStockStore } from '@/store/stockStore';

interface StockInfoPanelProps {
  stockCode: string;
}

// jp: 큰 숫자 포맷 (조/억)
function fmtBig(n: number): string {
  if (!n) return '-';
  if (n >= 1e12) return (n / 1e12).toFixed(1) + '조';
  if (n >= 1e8) return Math.floor(n / 1e8).toLocaleString() + '억';
  return n.toLocaleString();
}

// jp: YYYYMMDD → YY.MM.DD
function fmtDate(d?: string): string {
  if (!d || d.length !== 8) return '';
  return d.slice(2, 4) + '.' + d.slice(4, 6) + '.' + d.slice(6, 8);
}

export function StockInfoPanel({ stockCode }: StockInfoPanelProps) {
  const [info, setInfo] = useState<Stock | null>(null);
  const live = useStockStore((s) => s.prices[stockCode]);

  useEffect(() => {
    let cancelled = false;
    stockService.getStock(stockCode).then((s) => {
      if (!cancelled) setInfo(s);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [stockCode]);

  const open = live?.open ?? 0;
  const high = live?.high ?? 0;
  const low = live?.low ?? 0;
  const prevClose = live?.prevClose ?? 0;

  // jp: 색상 (전일종가 대비)
  const colorOf = (v: number) => {
    if (!prevClose || !v) return 'var(--text-primary)';
    return v > prevClose ? 'var(--rise)' : v < prevClose ? 'var(--fall)' : 'var(--text-primary)';
  };

  const rows: { label: string; value: string; color?: string }[] = [
    { label: '거래대금', value: fmtBig(info?.tradingValue ?? 0) },
    { label: '52최고', value: info?.high52w ? info.high52w.toLocaleString() : '-', color: 'var(--rise)' },
    { label: '52최저', value: info?.low52w ? info.low52w.toLocaleString() : '-', color: 'var(--fall)' },
    { label: '상한가', value: info?.upperLimit ? info.upperLimit.toLocaleString() : '-', color: 'var(--rise)' },
    { label: '하한가', value: info?.lowerLimit ? info.lowerLimit.toLocaleString() : '-', color: 'var(--fall)' },
    { label: '시가', value: open ? open.toLocaleString() : '-', color: colorOf(open) },
    { label: '고가', value: high ? high.toLocaleString() : '-', color: 'var(--rise)' },
    { label: '저가', value: low ? low.toLocaleString() : '-', color: 'var(--fall)' },
  ];

  return (
    <div className="mx-4 mt-3 rounded-xl overflow-hidden" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
        {rows.map((r, i) => (
          <div key={r.label} className="flex items-center justify-between px-3 py-2"
            style={{
              borderBottom: i < rows.length - 2 ? '1px solid var(--border)' : 'none',
              borderRight: i % 2 === 0 ? '1px solid var(--border)' : 'none',
            }}>
            <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{r.label}</span>
            <span className="text-[12px] tabular-nums" style={{ color: r.color || 'var(--text-primary)' }}>{r.value}</span>
          </div>
        ))}
      </div>
      {(info?.high52wDate || info?.low52wDate) && (
        <div className="flex justify-between px-3 py-1.5" style={{ borderTop: '1px solid var(--border)', backgroundColor: 'var(--bg-elevated)' }}>
          <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>52최고 {fmtDate(info?.high52wDate)}</span>
          <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>52최저 {fmtDate(info?.low52wDate)}</span>
        </div>
      )}
    </div>
  );
}
