// jp: 종목 상세 탭 네비게이션

export type StockTab = 'chart' | 'orderbook' | 'info' | 'disclosure' | 'community';

interface StockTabNavigationProps {
  activeTab: StockTab;
  onTabChange: (tab: StockTab) => void;
}

const TABS: { id: StockTab; label: string }[] = [
  { id: 'chart', label: '차트' },
  { id: 'orderbook', label: '호가' },
  { id: 'info', label: '종목정보' },
  { id: 'disclosure', label: '공시' },
  { id: 'community', label: '커뮤니티' },
];

export function StockTabNavigation({ activeTab, onTabChange }: StockTabNavigationProps) {
  return (
    <div
      className="tab-scroll flex sticky top-[56px] z-20"
      style={{
        backgroundColor: 'var(--bg-primary)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      {TABS.map(({ id, label }) => {
        const isActive = activeTab === id;
        return (
          <button
            key={id}
            onClick={() => onTabChange(id)}
            className="relative flex-shrink-0 px-5 py-3.5 text-sm font-semibold transition-colors"
            style={{
              color: isActive ? 'var(--text-primary)' : 'var(--text-tertiary)',
            }}
          >
            {label}
            {isActive && (
              <span
                className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full"
                style={{ backgroundColor: 'var(--text-primary)' }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
