// jp: 메인 앱 컴포넌트 - 하단 탭 3개 (AI인사이트/알림/설정), 아이콘만
// jp: AI인사이트 탭 안에 상단 서브탭 4개 (AI종목분석/AI시황분석/AI공시분석/종목뉴스)
import { useState, useEffect } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { BottomNavigation, NavTab } from '@/components/layout/BottomNavigation';
import { AiAnalysisPage } from '@/pages/AiAnalysisPage';
import { NotificationPage } from '@/pages/NotificationPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { StockDetailPage } from '@/pages/StockDetailPage';
import { DisclosureSummarySheet } from '@/components/disclosure/DisclosureSummarySheet';
import { useNotificationStore } from '@/store/notificationStore';
import { useStockStore } from '@/store/stockStore';
import { Stock } from '@/types/stock';
import { Disclosure } from '@/types/disclosure';

// jp: StockDisclosurePage, handleGoToDisclosures 제거 — 공시 클릭은 분석 시트로 통일
// jp: 호출처 없는 죽은 코드였음 (handleGoToDisclosures → setScreen stockDisclosure)

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

type AppScreen =
  | { type: 'home' }
  | { type: 'stockDetail'; stock: Stock };

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

  // jp: 공시 AI분석 시트 열기 — 공시 객체를 직접 받으면 바로 열고(권장), receiptNo 문자열이면 API로 1건 조회
  const handleOpenDisclosure = async (
    arg: Disclosure | string,
    stockCode?: string,
    _stockName?: string,
  ) => {
    // jp: 공시 객체를 통째로 받은 경우 — 재조회 없이 바로 시트 열기
    if (typeof arg !== 'string') {
      setOpenedDisclosure(arg);
      return;
    }
    // jp: receiptNo만 받은 경우(알림 등) — 종목 공시 목록에서 receiptNo 매칭
    const receiptNo = (arg || '').trim();
    if (!receiptNo) return;
    if (!stockCode) return;
    if (!/^\d{6}$/.test(stockCode)) return;

    try {
      const url = `${API_URL}/api/disclosures/stock/${stockCode}?limit=200`;
      const res = await fetch(url);
      const json = await res.json();
      const list: Disclosure[] = (json?.data ?? json ?? []) as Disclosure[];
      const found = Array.isArray(list) ? list.find((d) => d.receiptNo === receiptNo) : null;
      if (found) setOpenedDisclosure(found);
    } catch {
      /* noop */
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

  return (
    <AppShell showHeader={activeTab === 'stocks'}>
      <main style={{ paddingBottom: 'calc(60px + env(safe-area-inset-bottom))' }}>
        {activeTab === 'stocks' && (
          <AiAnalysisPage
            onOpenDisclosure={handleOpenDisclosure}
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
