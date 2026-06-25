// jp: 종목 상세 헤더 - 뒤로가기만 (종목명/코드/액션은 StockPriceSummary로 이동)
import { ArrowLeft } from 'lucide-react';
import { Stock } from '@/types/stock';

interface StockHeaderProps {
  stock: Stock;
  onBack: () => void;
}

export function StockHeader({ stock: _stock, onBack }: StockHeaderProps) {
  return (
    <header
      className="flex items-center gap-3 px-4 py-3 sticky top-0 z-30"
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      <button
        onClick={onBack}
        className="w-9 h-9 flex items-center justify-center rounded-full active:scale-90 transition-transform"
        style={{ backgroundColor: 'var(--bg-elevated)' }}
        aria-label="뒤로"
      >
        <ArrowLeft size={18} style={{ color: 'var(--text-primary)' }} />
      </button>
    </header>
  );
}
