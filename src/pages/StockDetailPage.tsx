// jp: 종목 상세 화면

import { lazy, Suspense, useState, useEffect } from 'react';
import { Stock } from '@/types/stock';
import { StockTab } from '@/components/stock/StockTabNavigation';
import { StockHeader } from '@/components/stock/StockHeader';
import { StockPriceSummary } from '@/components/stock/StockPriceSummary';
import { PromoBanner } from '@/components/stock/PromoBanner';
import { StockTabNavigation } from '@/components/stock/StockTabNavigation';
import { OrderBookPanel } from '@/components/stock/OrderBookPanel';
import { InvestorVolumeSection } from '@/components/chart/InvestorVolumeSection';
import { MemberFlowSection } from '@/components/stock/MemberFlowSection';
import { DisclosureTab } from '@/components/disclosure/DisclosureTab';
import { CommunityTab } from '@/components/stock/CommunityTab';
import { useSingleStockSocket } from '@/hooks/useStockSocket';
import { useStockStore } from '@/store/stockStore';
import { stockService } from '@/services/stockService';


// jp: lightweight-charts는 번들이 커서 종목 상세 진입 시점에만 lazy load
const StockChart = lazy(() => import('@/components/chart/StockChart').then(m => ({ default: m.StockChart })));

interface StockDetailPageProps {
  stock: Stock;
  onBack: () => void;
}

export function StockDetailPage({ stock, onBack }: StockDetailPageProps) {
  const [activeTab, setActiveTab] = useState<StockTab>('chart');
  const [detailStock, setDetailStock] = useState<Stock>(stock);
  const { addRecentlyViewed } = useStockStore();

  // jp: 실시간 구독
  useSingleStockSocket(stock.code);

  // jp: 최근 본 종목 저장 + 상세 정보(시총/PER/거래량) 조회
  useEffect(() => {
    addRecentlyViewed(stock.code);
    // jp: 백엔드에서 정확한 종목 상세 정보 조회
    stockService.getStock(stock.code).then(full => {
      if (full) setDetailStock(prev => ({ ...prev, ...full }));
    });
  }, [stock.code, addRecentlyViewed]);

  return (
    <div className="min-h-dvh" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* jp: 헤더 */}
      <StockHeader stock={detailStock} onBack={onBack} />

      {/* jp: 현재가 요약 */}
      <StockPriceSummary stock={detailStock} />

      {/* jp: 안내 배너 */}
      <PromoBanner />

      {/* jp: 탭 네비게이션 */}
      <StockTabNavigation activeTab={activeTab} onTabChange={setActiveTab} />

      {/* jp: 탭 컨텐츠 */}
      <div className="pb-24">
        {activeTab === 'chart' && (
          <div>
            <Suspense fallback={<div className="mx-4 h-80 rounded-2xl animate-pulse" style={{ backgroundColor: 'var(--bg-card)' }} />}><StockChart stockCode={stock.code} /></Suspense>
            <div className="mt-2">
              <InvestorVolumeSection stockCode={stock.code} />
            </div>
          </div>
        )}

{activeTab === 'orderbook' && <OrderBookPanel stockCode={stock.code} />}
        {activeTab === 'info' && (
          <div className="px-4 pt-4 pb-6">
            <StockInfoCards stock={detailStock} />
            <MemberFlowSection stockCode={stock.code} />
          </div>
        )}
        {activeTab === 'disclosure' && <DisclosureTab stockCode={stock.code} />}
        {activeTab === 'community' && <CommunityTab stockCode={stock.code} />}
      </div>
    </div>
  );
}

// jp: 시가총액 포맷 (조/억 단위)
function formatMarketCap(value: number): string {
  if (value >= 1e12) {
    const jo = Math.floor(value / 1e12);
    const eok = Math.floor((value % 1e12) / 1e8);
    return eok > 0 ? `${jo}조 ${eok.toLocaleString()}억` : `${jo}조`;
  }
  if (value >= 1e8) return `${Math.floor(value / 1e8).toLocaleString()}억`;
  return value.toLocaleString();
}

// jp: 종목 기본 정보 카드
function StockInfoCards({ stock }: { stock: Stock }) {
  const livePrice = useStockStore((s) => s.prices[stock.code]);
  const price = livePrice ?? { high: 0, low: 0, open: 0, prevClose: 0, volume: 0 };

  const INFO_ITEMS = [
    { label: '시가', value: price.open ? price.open.toLocaleString() : '-' },
    { label: '전일 종가', value: price.prevClose ? price.prevClose.toLocaleString() : '-' },
    { label: '고가', value: price.high ? price.high.toLocaleString() : '-', colored: 'rise' },
    { label: '저가', value: price.low ? price.low.toLocaleString() : '-', colored: 'fall' },
    { label: '거래량', value: price.volume ? price.volume.toLocaleString() : '-' },
    { label: '시가총액', value: stock.marketCap ? formatMarketCap(stock.marketCap) : '-' },
    { label: 'PER', value: stock.per ? `${stock.per.toFixed(2)}배` : '-' },
    { label: 'PBR', value: stock.pbr ? `${stock.pbr.toFixed(2)}배` : '-' },
    { label: 'EPS', value: stock.eps ? `${stock.eps.toLocaleString()}원` : '-' },
    { label: '52주 최고', value: stock.high52w ? stock.high52w.toLocaleString() : '-', colored: 'rise' },
    { label: '52주 최저', value: stock.low52w ? stock.low52w.toLocaleString() : '-', colored: 'fall' },
    { label: '섹터', value: stock.sector ?? '-' },
    { label: '시장', value: stock.market ?? '-' },
  ];

  return (
    <div className="space-y-3">
      <div
        className="rounded-2xl overflow-hidden"
        style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
      >
        {INFO_ITEMS.map(({ label, value, colored }, i) => (
          <div
            key={label}
            className="flex items-center justify-between px-4 py-3"
            style={{
              borderBottom: i < INFO_ITEMS.length - 1 ? '1px solid var(--border-subtle)' : 'none',
            }}
          >
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{label}</span>
            <span
              className="text-sm font-semibold tabular-nums"
              style={{
                color: colored === 'rise' ? 'var(--rise)' :
                  colored === 'fall' ? 'var(--fall)' :
                  'var(--text-primary)',
              }}
            >
              {value}
            </span>
          </div>
        ))}
      </div>

      {/* jp: 법적 고지 */}
      <p className="text-[10px] leading-relaxed px-1" style={{ color: 'var(--text-tertiary)' }}>
        본 서비스의 시세, 공시, 뉴스, 분석 정보는 투자 참고용이며 투자 권유가 아닙니다. 모든 투자 판단과 책임은 사용자 본인에게 있습니다. 실시간 시세는 제공처 사정에 따라 지연되거나 중단될 수 있습니다.
      </p>
    </div>
  );
}
