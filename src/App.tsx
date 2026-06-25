// jp: 메인 앱 컴포넌트 - 하단 탭 3개 (AI인사이트/알림/설정), 아이콘만
// jp: AI인사이트 탭 안에 상단 서브탭 4개 (AI종목분석/AI시황분석/AI공시분석/종목뉴스)
import { useState, useEffect } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { BottomNavigation, NavTab } from '@/components/layout/BottomNavigation';
import { AiAnalysisPage } from '@/pages/AiAnalysisPage';
import { NotificationPage } from '@/pages/NotificationPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { StockDetailPage } from '@/pages/StockDetailPage';
import { StockDisclosurePage } from '@/pages/StockDisclosurePage';
import { DisclosureSummarySheet } from '@/components/disclosure/DisclosureSummarySheet';
import { useNotificationStore } from '@/store/notificationStore';
import { useStockStore } from '@/store/stockStore';
import { Stock } from '@/types/stock';
import { Disclosure } from '@/types/disclosure';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

type AppScreen =
  | { type: 'home' }
  | { type: 'stockDetail'; stock: Stock }
  | { type: 'stockDisclosure'; code: string; name: string };

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('stocks');
  const [screen, setScreen] = useState<AppScreen>({ type: 'home' });
  const loadFromServer = useNotificationStore((s) => s.loadFromServer);

  // jp: 공시 클릭 시 여는 공시 AI분석 시트
  const [openedDisclosure, setOpenedDisclosure] = useState<Disclosure | null>(null);

  useEffect(() => {
    void loadFromServer();
  }, [loadFromServer]);

  const handleBack = () => setScreen({ type: 'home' });

  const handleGoToStock = (stockCode: string, stockName?: string) => {
    const live = useStockStore.getState().prices[stockCode];
    const stock: Stock = {
      code: stockCode,
      name: stockName || stockCode,
      market: 'KOSPI',
      sector: '',
      price: live?.price ?? 0,
      change: live?.change ?? 0,
      changeRate: live?.changeRate ?? 0,
      volume: live?.volume ?? 0,
      isFavorite: false,
    };
    setScreen({ type: 'stockDetail', stock });
  };

  const handleGoToDisclosures = (code: string, name?: string) =>
    setScreen({ type: 'stockDisclosure', code, name: name || code });

  // jp: receiptNo로 그 공시 1건 찾아 AI분석 시트 열기
  const handleOpenDisclosure = async (receiptNo: string, stockCode: string, stockName?: string) => {
    try {
      const res = await fetch(`${API_URL}/api/disclosures/stock/${stockCode}?limit=100`);
      const json = await res.json();
      const list: Disclosure[] = (json?.data ?? json ?? []) as Disclosure[];
      const found = list.find((d) => d.receiptNo === receiptNo);
      if (found) {
        setOpenedDisclosure(found);
      } else {
        handleGoToDisclosures(stockCode, stockName);
      }
    } catch {
      handleGoToDisclosures(stockCode, stockName);
    }
  };

  // jp: 종목 상세
  if (screen.type === 'stockDetail') {
    return (
      <AppShell showHeader={false}>
        <StockDetailPage stock={screen.stock} onBack={handleBack} />
      </AppShell>
    );
  }

  // jp: 종목 공시 화면
  if (screen.type === 'stockDisclosure') {
    return (
      <AppShell showHeader={false}>
        <StockDisclosurePage stockCode={screen.code} stockName={screen.name} onBack={handleBack} />
      </AppShell>
    );
  }

  return (
    <AppShell showHeader={activeTab === 'stocks'}>
      <main style={{ paddingBottom: 'calc(60px + env(safe-area-inset-bottom))' }}>
        {activeTab === 'stocks' && (
          <AiAnalysisPage
            onOpenDisclosure={handleOpenDisclosure}
            onGoToDisclosures={handleGoToDisclosures}
          />
        )}
        {activeTab === 'notifications' && (
          <NotificationPage
            onBack={() => setActiveTab('stocks')}
            onGoToStock={handleGoToStock}
            onOpenDisclosure={handleOpenDisclosure}
          />
        )}
        {activeTab === 'settings' && (
          <SettingsPage />
        )}
      </main>
      <BottomNavigation
        activeTab={activeTab}
        onTabChange={(t) => { setActiveTab(t); setScreen({ type: 'home' }); }}
      />
      {/* jp: 공시 AI분석 시트 오버레이 */}
      <DisclosureSummarySheet
        disclosure={openedDisclosure}
        isOpen={!!openedDisclosure}
        onClose={() => setOpenedDisclosure(null)}
      />
    </AppShell>
  );
}
