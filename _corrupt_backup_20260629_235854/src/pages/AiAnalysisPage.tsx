// jp: AI인사이트 탭 - 상단 서브탭 4개
// jp: AI종목분석 / AI시황분석(BriefingCurrent+BriefingHistoryList 직접) / AI공시분석(FeedPage 내부 직접) / 종목뉴스
// jp: onGoToDisclosures 제거 — 공시 클릭은 분석 시트로 통일 (App.tsx와 동일 방향)
import { useState, useEffect, useRef } from 'react';
import {
  Info, X, TrendingUp, TrendingDown, FileText,
  Sparkles, ArrowRight, Newspaper,
  Search, AlertTriangle,
} from 'lucide-react';
import { aiService, StockAnalysisResult } from '@/services/aiService';
import { StreamingStockTab } from '@/components/ai/StreamingStockTab';
import { newsService, StockNewsItem } from '@/services/aiService';
import { RecentAnalysis } from '@/components/ai/RecentAnalysis';
import { AuthModal } from '@/components/auth/AuthModal';
import { useAuthStore } from '@/store/authStore';
import { apiClient } from '@/services/apiClient';

// jp: AI시황분석용
import { BriefingCurrent } from '@/components/briefing/BriefingCurrent';
import { BriefingHistoryList } from '@/components/briefing/BriefingHistoryList';

// jp: AI공시분석용 (FeedPage 내부 그대로 재사용)
import { Stock } from '@/types/stock';
import { stockService } from '@/services/stockService';
import { useWatchlistStore, WATCHLIST_DEFAULT_GROUP_ID } from '@/store/watchlistStore';
import { disclosureAlertService } from '@/services/disclosureAlertService';
import { enablePushNotifications } from '@/services/fcm/fcmService';
import { Star, Plus, ChevronRight, BellRing, Trash2, ArrowUp } from 'lucide-react';
import { AlertBell } from '@/components/common/AlertBell';
import { disclosureService } from '@/services/disclosureService';
import { Disclosure } from '@/types/disclosure';
import { getDisclosureClassification, ISSUER_LABEL, ISSUER_STYLE } from '@/utils/disclosureClassify';
import { ChevronDown } from 'lucide-react';

const C = {
  purple: '#ffffff',
  pink: '#ffffff',
  green: '#ffffff',
  amber: '#ffffff',
  heroGrad: '#161B22',
  btnGrad: '#ffffff',
};

type SubTab = 'stock' | 'market' | 'disclosure' | 'news';

const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: 'stock',      label: 'AI종목' },
  { id: 'market',     label: 'AI시황' },
  { id: 'disclosure', label: 'AI공시' },
  { id: 'news',       label: '뉴스' },
];

interface AiAnalysisPageProps {
  onOpenDisclosure?: (arg: Disclosure | string, stockCode?: string, stockName?: string) => void;
  // jp: onGoToDisclosures 제거 — 호출처 없는 죽은 prop이었음 (App.tsx handleGoToDisclosures와 함께 제거)
}

export function AiAnalysisPage({ onOpenDisclosure }: AiAnalysisPageProps) {
  const [subTab, setSubTab] = useState<SubTab>('stock');

  return (
    <div style={{ minHeight: 'calc(100dvh - 60px - env(safe-area-inset-bottom))', background: 'var(--bg-primary)' }}>
      {/* jp: 서브탭만 — 타이틀 제거, 한 줄 컴팩트 */}
      <div style={{ background: C.heroGrad, padding: '8px 10px', borderBottom: '0.5px solid var(--border)' }}>
        <div className="flex gap-[9px]">
          {SUB_TABS.map(({ id, label }) => {
            const on = subTab === id;
            return (
              <button key={id} onClick={() => setSubTab(id)}
                className="flex-1 text-[15px] font-bold p-[16px] rounded-[14px] transition-all"
                style={{
                  color: on ? '#000000' : 'var(--text-tertiary)',
                  background: on ? '#ffffff' : 'transparent',
                  border: on ? '1px solid #ffffff' : '1px solid var(--border)',
                }}>
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* jp: 서브탭 콘텐츠 */}
      {subTab === 'stock'      && <StreamingStockTab onOpenDisclosure={onOpenDisclosure} />}
      {subTab === 'market'     && <MarketTab />}
      {subTab === 'disclosure' && <DisclosureTab onOpenDisclosure={onOpenDisclosure} />}
      {subTab === 'news'       && <NewsTab />}
    </div>
  );
}

// ===== AI종목분석 =====
// jp: 예시 색상 풀 - 순환 사용
const EXAMPLE_STYLES = [
  { bg: 'var(--bg-elevated)', border: 'var(--border)', iconColor: '#ffffff', subColor: 'var(--text-tertiary)' },
  { bg: 'var(--bg-elevated)', border: 'var(--border)', iconColor: '#ffffff', subColor: 'var(--text-tertiary)' },
  { bg: 'var(--bg-elevated)', border: 'var(--border)', iconColor: '#ffffff', subColor: 'var(--text-tertiary)' },
  { bg: 'var(--bg-elevated)', border: 'var(--border)', iconColor: '#ffffff', subColor: 'var(--text-tertiary)' },
  { bg: 'var(--bg-elevated)', border: 'var(--border)', iconColor: '#ffffff', subColor: 'var(--text-tertiary)' },
];

// jp: 폴백 예시 (API 실패 시)
const FALLBACK_EXAMPLES = [
  { text: '삼성전자 최근 공시 중 주가에 영향줄 내용 있어?', sub: '공시 + 뉴스 분석' },
  { text: 'SK하이닉스 이번 분기 실적 공시 어떻게 나왔어?', sub: '실적 공시 해석' },
  { text: '현대차 오늘 뉴스랑 공시 같이 보면 어때?', sub: '공시 + 뉴스 크로스체크' },
  { text: '오늘 반도체 관련주 흐름 어때?', sub: '섹터 흐름 분석' },
  { text: '삼성바이오로직스 최근 뉴스랑 공시 종합해줘', sub: '뉴스 + 공시 종합' },
];

function StockTab({ onOpenDisclosure }: { onOpenDisclosure?: (arg: Disclosure | string, c?: string, n?: string) => void }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<StockAnalysisResult | null>(null);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [showLogin, setShowLogin] = useState(false);
  // jp: 오늘의 예시 - API에서 로드 (새벽 5시 크론잡으로 매일 갱신)
  const [examples, setExamples] = useState(FALLBACK_EXAMPLES);

  useEffect(() => {
    apiClient.get<{ text: string; sub: string }[]>('/api/ai/daily-examples')
      .then((data) => { if (Array.isArray(data) && data.length > 0) setExamples(data); })
      .catch(() => { /* 폴백 유지 */ });
  }, []);

  const analyze = async (v: string) => {
    const q = v.trim();
    if (!q || busy) return;
    if (!isAuthenticated) { setShowLogin(true); return; }
    setBusy(true); setError(''); setResult(null);
    try {
      const r = await aiService.analyzeStock(q);
      setResult(r);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('401') || msg.includes('로그인') || msg.includes('인증')) {
        setShowLogin(true);
      } else {
        setError(msg.includes('찾을 수 없') ? '종목을 찾을 수 없어요.' : '분석 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.');
      }
    } finally { setBusy(false); }
  };

  return (
    <div className="px-4 pt-[18px] pb-6">
      <div className="flex gap-2 mb-[9px]">
        <input value={input} onChange={(e) => setInput(e.target.value)}
          placeholder="종목명 또는 질문을 입력"
          className="flex-1 px-4 py-[14px] rounded-[14px] text-[13px] outline-none"
          style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
          onKeyDown={(e) => { if (e.key === 'Enter') void analyze(input); }} />
        <button onClick={() => void analyze(input)} disabled={!input.trim() || busy}
          className="w-[50px] rounded-[14px] flex items-center justify-center disabled:opacity-50"
          style={{ background: C.btnGrad }}>
          <ArrowRight size={16} color="#000" />
        </button>
      </div>
      <p className="text-[10px] flex items-center gap-1 mb-[18px]" style={{ color: 'var(--text-tertiary)' }}>
        <Sparkles size={11} /> 종목코드/종목명 OK, 자연어 질문도 OK
      </p>
      <p className="text-[11px] mb-[9px]" style={{ color: 'var(--text-tertiary)' }}>이렇게 물어보세요</p>
      <div className="flex flex-col gap-2 mb-5">
        {examples.map((ex, i) => {
          const style = EXAMPLE_STYLES[i % EXAMPLE_STYLES.length];
          return (
            <button key={ex.text} onClick={() => setInput(ex.text)}
              className="rounded-xl px-3.5 py-[11px] flex items-center gap-2.5 text-left active:opacity-70"
              style={{ background: style.bg, border: `1px solid ${style.border}` }}>
              <span style={{ color: style.iconColor, flexShrink: 0 }}>
                <Sparkles size={15} />
              </span>
              <div>
                <p className="text-[12px]" style={{ color: 'var(--text-primary)' }}>{ex.text}</p>
                <p className="text-[10px] mt-0.5" style={{ color: style.subColor }}>{ex.sub}</p>
              </div>
            </button>
          );
        })}
      </div>
      <AuthModal open={showLogin} onClose={() => setShowLogin(false)} />
      {busy && <LoadingDots text="종목을 분석하고 있어요.." />}
      {error && <ErrorBox msg={error} onClose={() => setError('')} />}
      {result && <StockResultCard result={result} onOpenDisclosure={onOpenDisclosure} />}
      <div className="mt-1">
        <RecentAnalysis kind="stock" refreshKey={refreshKey} accent={C.purple} onOpenDisclosure={onOpenDisclosure} />
      </div>
    </div>
  );
}

// ===== AI시황분석 — BriefingCurrent + BriefingHistoryList 직접 =====
function MarketTab() {
  const [tab, setTab] = useState<'current' | 'history'>('current');

  return (
    <div style={{ paddingBottom: 24 }}>
      <div className="px-4 py-3 sticky top-0 z-10"
        style={{ background: 'var(--bg-primary)', borderBottom: '1px solid var(--border-subtle)' }}>
        <div className="flex p-1 rounded-[15px] gap-1"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
          {(['current', 'history'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className="flex-1 text-center py-2.5 rounded-[11px] text-[13px] font-extrabold transition-all"
              style={{
                background: tab === t ? '#ffffff' : 'transparent',
                color: tab === t ? '#000000' : 'var(--text-secondary)',
              }}>
              {t === 'current' ? '현재 시황' : '과거 기록'}
            </button>
          ))}
        </div>
      </div>
      {tab === 'current'  && <BriefingCurrent />}
      {tab === 'history'  && <BriefingHistoryList />}
    </div>
  );
}

// ===== AI공시분석 — FeedPage 내부 로직 직접 =====
const GUEST_DEFAULT_STOCKS = [
  { code: '005930', name: '삼성전자' },
  { code: '000660', name: 'SK하이닉스' },
  { code: '006260', name: 'LS' },
];

// jp: 공시 6대 카테고리 — reportName 키워드 기반 분류
// jp: 탭 key = 백엔드 category_type 값과 1:1 일치 ('all'은 전체). 변환 레이어 없음.
const DISCLOSURE_CATEGORIES = [
  { key: 'all',      label: '전체' },
  { key: '투자위험', label: '투자위험' },
  { key: '지분변동', label: '지분변동' },
  { key: '합병분할', label: '합병·분할' },
  { key: '증자감자', label: '증자·감자' },
  { key: '실적재무', label: '실적·재무' },
  { key: '계약소송', label: '계약·소송' },
  { key: '배당주총', label: '배당·주총' },
  { key: '기타', label: 'IR·기타' },
] as const;

// jp: 카테고리별 색상 (탭 + 카드 색바/배지 공용) — 앱 색 토큰 기반
const CATEGORY_COLORS: Record<string, string> = {
  '투자위험': '#ff5252',
  '지분변동': '#5DCAA5',
  '합병분할': '#5c8aff',
  '증자감자': '#ffffff',
  '실적재무': '#97C459',
  '계약소송': '#e08a5a',
  '배당주총': '#9DA7B3',
  '기타': '#888888',
};
type DiscCategory = typeof DISCLOSURE_CATEGORIES[number]['key'];

// jp: 위험 카테고리 (알림 카드로 강조)
const RISK_KEYWORDS = ['상장폐지', '관리종목', '부도', '당좌거래정지', '회생', '파산', '거래정지', '감사의견', '자본잠식', '불성실공시', '투자주의', '투자경고', '투자위험'];

// jp: 위험 공시 여부 (빨간 알림 카드용)
function isRiskDisclosure(reportName: string): boolean {
  return RISK_KEYWORDS.some((k) => (reportName || '').includes(k));
}

// jp: onGoToDisclosures prop 제거 — 공시 클릭은 onOpenDisclosure(분석 시트)로 통일
function DisclosureTab({ onOpenDisclosure }: { onOpenDisclosure?: (arg: Disclosure | string, stockCode?: string, stockName?: string) => void }) {
  const [search, setSearch] = useState('');
  const [showTopBtn, setShowTopBtn] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [stockResults, setStockResults] = useState<Stock[]>([]);
  const [stockSearching, setStockSearching] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [toast, setToast] = useState('');
  const [alertOn, setAlertOn] = useState<Record<string, boolean>>({});
  const [permAsk, setPermAsk] = useState<{ code: string; name: string } | null>(null);
  // jp: 공시 피드 상태
  const [feedMode, setFeedMode] = useState<'watch' | 'all'>('watch');
  const [category, setCategory] = useState<DiscCategory>('all');
  const [feed, setFeed] = useState<Disclosure[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [selectedStock, setSelectedStock] = useState<string | null>(null);
  const [chipPage, setChipPage] = useState(0);
  const touchStartX = useRef(0);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lpFired = useRef(false);
  const [pressingCode, setPressingCode] = useState<string | null>(null);
  const [undoData, setUndoData] = useState<{ code: string; name: string; groupId?: string } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [feedOffset, setFeedOffset] = useState(0);
  const [feedHasMore, setFeedHasMore] = useState(false);
  const [feedMoreLoading, setFeedMoreLoading] = useState(false);

  const isLoggedIn = useAuthStore((s) => s.isAuthenticated);
  const items = useWatchlistStore((s) => s.items);
  const { hasItem, addItem, removeItem } = useWatchlistStore();
  const myStocks = items.filter((i) => i.assetType !== 'index' && /^\d{6}$/.test(i.code));
  const displayStocks = isLoggedIn ? myStocks : GUEST_DEFAULT_STOCKS;

  const didInitDefaultRef = useRef(false);
  useEffect(() => {
    if (didInitDefaultRef.current) return;
    if (!isLoggedIn) { setFeedMode('all'); didInitDefaultRef.current = true; return; }
    if (myStocks.length > 0) {
      const firstStock = [...myStocks].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))[0];
      if (firstStock) { setSelectedStock(firstStock.code); didInitDefaultRef.current = true; }
    }
  }, [isLoggedIn, myStocks]);

  useEffect(() => {
    if (!isLoggedIn) { setAlertOn({}); return; }
    let active = true;
    (async () => {
      const entries = await Promise.all(
        myStocks.map(async (s) => {
          const p = await disclosureAlertService.getPrefs(s.code);
          return [s.code, !!p?.isEnabled] as const;
        })
      );
      if (active) setAlertOn(Object.fromEntries(entries));
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn, myStocks.length]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 2400);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    const kw = search.trim();
    if (!kw) { setStockResults([]); return; }
    let active = true;
    const t = setTimeout(async () => {
      setStockSearching(true);
      const r = await stockService.searchStocks(kw);
      if (active) { setStockResults(r); setStockSearching(false); }
    }, 300);
    return () => { active = false; clearTimeout(t); };
  }, [search]);

  const handleAddStock = (stock: Stock) => {
    if (!isLoggedIn) { setShowLogin(true); return; }
    if (hasItem(stock.code)) { setToast('이미 관심종목에 있어요'); return; }
    const ok = addItem(stock.code, stock.name, WATCHLIST_DEFAULT_GROUP_ID);
    if (ok) { setSearch(''); setStockResults([]); setToast(`${stock.name} 추가됨`); }
    else setToast('관심종목이 가득 찼어요');
  };

  const handleRemove = (e: React.MouseEvent, code: string, name: string) => {
    e.stopPropagation(); removeItem(code); setToast(`${name} 제거됨`);
  };

  const removeWithUndo = (code: string, name: string) => {
    const item = items.find((i) => i.code === code);
    if (navigator.vibrate) navigator.vibrate(50);
    removeItem(code);
    if (selectedStock === code) setSelectedStock(null);
    setUndoData({ code, name, groupId: item?.groupId });
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndoData(null), 5000);
  };

  const undoRemove = () => {
    if (!undoData) return;
    addItem(undoData.code, undoData.name, undoData.groupId);
    setUndoData(null);
    if (undoTimer.current) clearTimeout(undoTimer.current);
  };

  const enableAlert = async (code: string, name: string) => {
    setAlertOn((p) => ({ ...p, [code]: true }));
    const ok = await disclosureAlertService.enable(code);
    if (!ok) { setAlertOn((p) => ({ ...p, [code]: false })); setToast('알림 설정 실패'); return; }
    try {
      const res = await enablePushNotifications();
      setToast(res.ok ? `${name} 공시 알림 켜짐` : `${name} 공시 알림 켜짐 (앱알림 미허용)`);
    } catch { setToast(`${name} 공시 알림 켜짐`); }
  };

  const handleToggleAlert = async (e: React.MouseEvent, code: string, name: string) => {
    e.stopPropagation();
    if (!isLoggedIn) { setShowLogin(true); return; }
    if (alertOn[code]) {
      setAlertOn((p) => ({ ...p, [code]: false }));
      const ok = await disclosureAlertService.disable(code);
      if (ok) setToast(`${name} 알림 꺼짐`);
      else { setAlertOn((p) => ({ ...p, [code]: true })); setToast('알림 해제 실패'); }
    } else {
      const granted = typeof Notification !== 'undefined' && Notification.permission === 'granted';
      if (!granted) { setPermAsk({ code, name }); return; }
      await enableAlert(code, name);
    }
  };

  useEffect(() => {
    let active = true;
    setFeedLoading(true);
    setFeedOffset(0);
    if (selectedStock) {
      disclosureService.getStockDisclosurePage(selectedStock, 50, 0, category)
        .then((res) => { if (active) { setFeed(res.items); setFeedHasMore(res.hasMore); setFeedOffset(res.items.length); } })
        .catch(() => { if (active) { setFeed([]); setFeedHasMore(false); } })
        .finally(() => { if (active) setFeedLoading(false); });
    } else if (feedMode === 'all') {
      const first = category !== 'all'
        ? disclosureService.getCategoryPage(category, 50, 0)
        : disclosureService.getLatestPage(50, 0);
      first
        .then((res) => { if (active) { setFeed(res.items); setFeedHasMore(res.hasMore); setFeedOffset(res.items.length); } })
        .catch(() => { if (active) { setFeed([]); setFeedHasMore(false); } })
        .finally(() => { if (active) setFeedLoading(false); });
    } else {
      setFeedHasMore(false);
      disclosureService.getMyFeed(undefined, category)
        .then((list) => { if (active) setFeed(list || []); })
        .catch(() => { if (active) setFeed([]); })
        .finally(() => { if (active) setFeedLoading(false); });
    }
    return () => { active = false; };
  }, [feedMode, isLoggedIn, selectedStock, category]);

  const loadMoreFeed = () => {
    if (feedMoreLoading || !feedHasMore) return;
    if (!selectedStock && feedMode !== 'all') return;
    setFeedMoreLoading(true);
    let next;
    if (selectedStock) {
      next = disclosureService.getStockDisclosurePage(selectedStock, 50, feedOffset, category);
    } else if (category !== 'all') {
      next = disclosureService.getCategoryPage(category, 50, feedOffset);
    } else {
      next = disclosureService.getLatestPage(50, feedOffset);
    }
    next
      .then((res) => {
        setFeed((prev) => { const ids = new Set(prev.map((d) => d.receiptNo)); return [...prev, ...res.items.filter((d) => !ids.has(d.receiptNo))]; });
        setFeedHasMore(res.hasMore);
        setFeedOffset((prev) => prev + res.items.length);
      })
      .catch(() => setFeedHasMore(false))
      .finally(() => setFeedMoreLoading(false));
  };

  const loadMoreRef = useRef(loadMoreFeed);
  loadMoreRef.current = loadMoreFeed;

  const feedSentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if ((!selectedStock && feedMode !== 'all') || !feedHasMore) return;
    let ticking = false;
    const onScroll = () => {
      setShowTopBtn(window.scrollY > 400);
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const nearBottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 600;
        if (nearBottom) loadMoreRef.current();
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [selectedStock, feedMode, feedHasMore, category]);

  const showingResults = search.trim().length > 0;

  return (
    <div className="pb-6">
      {/* 검색바 */}
      <div className="px-4 pt-4 pb-3 sticky top-0 z-10"
        style={{ background: 'var(--bg-primary)', borderBottom: '1px solid var(--border-subtle)' }}>
        <p className="text-[11px] mb-2" style={{ color: 'var(--text-tertiary)' }}>
          종목을 등록하면 새 공시가 올 때 알림을 받을 수 있어요
        </p>
        <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl"
          style={{ background: 'var(--bg-elevated)', border: `1px solid ${showingResults ? 'rgba(219,39,119,0.45)' : 'var(--border)'}` }}>
          <Search size={16} style={{ color: 'var(--text-tertiary)' }} />
          <input ref={searchInputRef} type="text" placeholder="종목명으로 관심종목 추가"
            value={search} onChange={(e) => setSearch(e.target.value)}
            className="flex-1 text-sm bg-transparent outline-none"
            style={{ color: 'var(--text-primary)' }} />
          {search && (
            <button onClick={() => { setSearch(''); setStockResults([]); }}
              className="w-5 h-5 flex items-center justify-center rounded-full flex-shrink-0"
              style={{ background: 'var(--bg-card)', color: 'var(--text-tertiary)' }}>
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {toast && (
        <div className="px-4 mt-2">
          <div className="px-3.5 py-2.5 rounded-xl text-xs font-semibold text-center"
            style={{ background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
            {toast}
          </div>
        </div>
      )}

      {undoData && (
        <div className="px-4 mt-2">
          <div className="px-3.5 py-2.5 rounded-xl text-xs flex items-center justify-between"
            style={{ background: '#2a2640', color: '#fff', border: '1px solid rgba(255,255,255,0.12)' }}>
            <span className="flex items-center gap-2">
              <Trash2 size={13} style={{ color: '#9DA7B3' }} />
              <span>{undoData.name} 삭제됨</span>
            </span>
            <button onClick={undoRemove} className="font-bold" style={{ color: '#ffffff' }}>실행취소</button>
          </div>
        </div>
      )}

      {permAsk && (
        <div className="px-4 mt-3">
          <div className="rounded-2xl p-4 text-center"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--accent-border)' }}>
            <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-2.5"
              style={{ background: '#ffffff' }}>
              <BellRing size={22} color="#000" />
            </div>
            <p className="text-sm font-extrabold mb-1" style={{ color: 'var(--text-primary)' }}>공시 알림을 허용할까요?</p>
            <p className="text-[11px] mb-3" style={{ color: 'var(--text-tertiary)' }}>{permAsk.name} 새 공시가 오면 바로 알려드릴게요</p>
            <button onClick={async () => { const p = { ...permAsk }; setPermAsk(null); await enableAlert(p.code, p.name); }}
              className="w-full py-3 rounded-xl text-sm font-extrabold mb-1.5"
              style={{ background: '#ffffff', color: '#000000' }}>
              알림 허용하기
            </button>
            <button onClick={() => setPermAsk(null)} className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>나중에</button>
          </div>
        </div>
      )}

      <div className="px-4 mt-2">
        {showingResults ? (
          <>
            <p className="text-[11px] font-bold mb-2 px-1" style={{ color: 'var(--text-tertiary)' }}>종목 선택 후 관심종목에 추가하세요</p>
            {stockSearching ? (
              <p className="text-center text-xs py-10" style={{ color: 'var(--text-tertiary)' }}>검색 중..</p>
            ) : stockResults.length === 0 ? (
              <p className="text-center text-xs py-10" style={{ color: 'var(--text-tertiary)' }}>검색 결과가 없어요</p>
            ) : (
              <div className="space-y-1.5">
                {stockResults.map((stock) => {
                  const already = hasItem(stock.code);
                  return (
                    <button key={stock.code} onClick={() => handleAddStock(stock)} disabled={already}
                      className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left active:scale-[0.99]"
                      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', opacity: already ? 0.55 : 1 }}>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>{stock.name}</p>
                        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{stock.code}</p>
                      </div>
                      <span className="w-9 h-9 flex items-center justify-center rounded-full flex-shrink-0 text-[11px] font-bold"
                        style={{ background: already ? 'var(--bg-elevated)' : '#ffffff', color: already ? 'var(--text-tertiary)' : '#000000' }}>
                        {already ? '추가됨' : <Plus size={16} />}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <>
            {isLoggedIn && myStocks.length === 0 ? (
              <div className="py-16 text-center px-6">
                <Star size={28} style={{ color: 'var(--text-tertiary)', margin: '0 auto 12px' }} />
                <p className="text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>아직 관심종목이 없어요</p>
                <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>위 검색창에 종목명을 입력해 추가하면<br/>새 공시 목록으로 알려드려요</p>
              </div>
            ) : (
              <>
                {!isLoggedIn && (
                  <div className="flex items-center gap-2.5 p-3 rounded-xl mb-3"
                    style={{ background: 'var(--bg-card)', border: '1px solid var(--accent-border)' }}>
                    <p className="flex-1 text-[11px] leading-snug" style={{ color: 'var(--text-primary)' }}>
                      <b style={{ color: '#ffffff' }}>미리보기</b>로 보고 있어요. 로그인하면 내 종목으로 알림 받을 수 있어요
                    </p>
                    <button onClick={() => setShowLogin(true)}
                      className="flex-shrink-0 text-[11px] font-extrabold px-3 py-2 rounded-lg"
                      style={{ background: '#ffffff', color: '#000000' }}>
                      로그인
                    </button>
                  </div>
                )}
                <p className="text-[11px] font-bold mb-2.5 px-1" style={{ color: 'var(--text-tertiary)' }}>
                  {isLoggedIn ? `내 관심종목 ${myStocks.length}개` : '종목별 최신 공시를 AI로 분석해드려요'}
                </p>
                {isLoggedIn && myStocks.length > 0 && (
                  <div className="flex items-center gap-1.5 mb-2 px-2 py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.08)' }}>
                    <Info size={11} style={{ color: '#ffffff', flexShrink: 0 }} />
                    <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>종목을 길게 누르면 삭제할 수 있어요</span>
                  </div>
                )}
                {(() => {
                  const PER = 6;
                  const pages = [];
                  for (let i = 0; i < displayStocks.length; i += PER) pages.push(displayStocks.slice(i, i + PER));
                  if (pages.length === 0) pages.push([]);
                  const pg = Math.min(chipPage, pages.length - 1);
                  const cur = pages[pg] || [];
                  return (
                    <div>
                      <div
                        onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; }}
                        onTouchEnd={(e) => {
                          const dx = e.changedTouches[0].clientX - touchStartX.current;
                          if (dx < -40 && pg < pages.length - 1) setChipPage(pg + 1);
                          else if (dx > 40 && pg > 0) setChipPage(pg - 1);
                        }}
                        className="grid grid-cols-3 gap-2"
                        style={{ touchAction: 'pan-y' }}>
                        {cur.map((it) => {
                          const on = alertOn[it.code];
                          const sel = selectedStock === it.code;
                          return (
                            <button key={it.code}
                              onClick={() => { if (lpFired.current) { lpFired.current = false; return; } setSelectedStock(sel ? null : it.code); }}
                              onPointerDown={() => { lpFired.current = false; if (isLoggedIn) { setPressingCode(it.code); pressTimer.current = setTimeout(() => { lpFired.current = true; setPressingCode(null); removeWithUndo(it.code, it.name); }, 500); } }}
                              onPointerUp={() => { if (pressTimer.current) clearTimeout(pressTimer.current); setPressingCode(null); }}
                              onPointerLeave={() => { if (pressTimer.current) clearTimeout(pressTimer.current); setPressingCode(null); }}
                              className="relative flex flex-col items-start justify-center px-2.5 py-2 rounded-xl active:scale-[0.97] transition-all"
                              style={{ minHeight: 46, background: pressingCode === it.code ? 'rgba(255,82,82,0.18)' : (sel ? 'rgba(255,255,255,0.16)' : 'var(--bg-card)'), border: `1px solid ${pressingCode === it.code ? '#ff5252' : (sel ? '#ffffff' : 'var(--border)')}` }}>
                              <span className="text-[14px] font-bold leading-tight truncate w-full text-left" style={{ color: sel ? '#ffffff' : 'var(--text-primary)', paddingRight: 16 }}>{it.name}</span>
                              <span className="text-[9px] leading-tight" style={{ color: 'var(--text-tertiary)' }}>{it.code}</span>
                              <span onClick={(e) => handleToggleAlert(e, it.code, it.name)} className="absolute top-1.5 right-1.5 flex items-center justify-center" aria-label={on ? `${it.name} 알림 끄기` : `${it.name} 알림 켜기`}>
                                <AlertBell on={!!on} size={15} />
                                {on && <span className="absolute -top-0.5 -right-0.5 w-[6px] h-[6px] rounded-full" style={{ background: 'var(--success)' }} />}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      {pages.length > 1 && (
                        <div className="flex items-center justify-center gap-1.5 mt-2.5">
                          {pages.map((_, i) => (
                            <button key={i} onClick={() => setChipPage(i)} aria-label={`${i + 1}페이지`} className="transition-all" style={{ height: 6, width: i === pg ? 16 : 6, borderRadius: 3, background: i === pg ? '#ffffff' : 'var(--border)', border: 'none', padding: 0 }} />
                          ))}
                          <span className="text-[9px] ml-1" style={{ color: 'var(--text-tertiary)' }}>{pg + 1}/{pages.length}</span>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </>
            )}
          </>
        )}
      </div>

      {/* ── 공시 피드 섹션 ── */}
      {!showingResults && (
        <div className="px-4 mt-4">
          {/* 관심/전체 토글 */}
          <div className="grid grid-cols-2 gap-1.5 mb-3">
            {([{ k: 'watch', label: '관심종목', icon: Star }, { k: 'all', label: '전체종목', icon: FileText }] as const).map(({ k, label, icon: Icon }) => {
              const on = feedMode === k;
              return (
                <button key={k} onClick={() => { setFeedMode(k); setSelectedStock(null); }}
                  className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[12px] font-bold active:scale-[0.99] transition-all"
                  style={{ color: on ? '#ffffff' : 'var(--text-tertiary)', background: on ? 'rgba(255,255,255,0.14)' : 'transparent', border: on ? '1px solid rgba(255,255,255,0.4)' : '1px solid var(--border)' }}>
                  <Icon size={13} /> {label}
                </button>
              );
            })}
          </div>

          {/* 카테고리 탭 */}
          <div className="flex flex-wrap gap-1.5 pb-2 mb-1" style={{ scrollbarWidth: 'none' }}>
            {DISCLOSURE_CATEGORIES.map((c) => {
              const on = category === c.key;
              const isRisk = c.key === '투자위험';
              const catColor = CATEGORY_COLORS[c.key] || '#ffffff';
              return (
                <button key={c.key} onClick={() => setCategory(c.key)}
                  className="flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold active:scale-95 transition-all whitespace-nowrap"
                  style={{
                    color: c.key === 'all' ? (on ? '#fff' : 'var(--text-tertiary)') : (on ? catColor : `${catColor}99`),
                    background: c.key === 'all' ? (on ? 'rgba(255,255,255,0.10)' : 'transparent') : (on ? `${catColor}22` : 'transparent'),
                    border: c.key === 'all' ? `1px solid ${on ? 'rgba(255,255,255,0.25)' : 'var(--border)'}` : `1px solid ${on ? catColor : catColor + '2e'}`,
                  }}>
                  {isRisk && <AlertTriangle size={9} style={{ display: 'inline', marginRight: 2, marginTop: -2 }} />}{c.label}
                </button>
              );
            })}
          </div>

          {/* 피드 리스트 */}
          {feedLoading ? (
            <p className="text-center text-xs py-10" style={{ color: 'var(--text-tertiary)' }}>공시 불러오는 중…</p>
          ) : (() => {
            const seen = new Set<string>(); const filtered = feed.filter((d) => { if (seen.has(d.receiptNo)) return false; seen.add(d.receiptNo); return true; });
            if (filtered.length === 0) {
              return <p className="text-center text-xs py-10" style={{ color: 'var(--text-tertiary)' }}>{feedMode === 'watch' ? '관심종목의 공시가 없어요' : '해당 공시가 없어요'}</p>;
            }
            return (
              <div className="space-y-2">
                {filtered.map((d) => {
                  const catType = d.categoryType || '';
                  const catColor = CATEGORY_COLORS[catType];
                  // jp: 주석검색 가능 공시 — 사업/분기/반기보고서로 시작하는 정기보고서 (한글 깨짐 방지: 유니코드 이스케이프)
                  const hasNotes = /^(\uC0AC\uC5C5\uBCF4\uACE0\uC11C|\uBD84\uAE30\uBCF4\uACE0\uC11C|\uBC18\uAE30\uBCF4\uACE0\uC11C)/.test((d.reportName || '').trim());
                  const cls = getDisclosureClassification(d);
                  return (
                    <div key={d.receiptNo} onClick={() => onOpenDisclosure?.(d)}
                      className="rounded-xl overflow-hidden cursor-pointer active:scale-[0.99] transition-all"
                      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderLeft: catColor ? `3px solid ${catColor}` : '1px solid var(--border)' }}>
                      <div className="px-3 py-2.5">
                        {/* jp: 시장 배지 (코스피/코스닥) — 회사명 위 좌측 고정 */}
                        {cls && (cls.issuerType === 'kospi' || cls.issuerType === 'kosdaq' || cls.issuerType === 'konex' || cls.issuerType === 'unlisted') && (
                          <div className="mb-1">
                            <span className="inline-flex items-center text-[9px] font-bold px-1.5 py-0.5 rounded"
                              style={{ background: ISSUER_STYLE[cls.issuerType].bg, color: ISSUER_STYLE[cls.issuerType].color }}>
                              {ISSUER_LABEL[cls.issuerType]}
                            </span>
                          </div>
                        )}
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-[14px] font-bold truncate" style={{ color: 'var(--text-primary)' }}>{d.stockName}</span>
                          <span className="flex items-center gap-1.5 flex-shrink-0">
                            {/* jp: 주석검색 가능 배지 — 실적재무 배지 좌측 고정 */}
                            {hasNotes && (
                              <span className="inline-flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded"
                                style={{ background: 'rgba(176,94,124,0.14)', color: '#B05E7C', border: '0.5px solid rgba(176,94,124,0.4)' }}>
                                {'\uD83D\uDCC4 \uC8FC\uC11D\uAC80\uC0C9'}
                              </span>
                            )}
                            <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>{d.disclosedAt?.slice(0, 10).replace(/-/g, '.')}</span>
                          </span>
                        </div>
                        <p className="text-[11px] leading-snug truncate" style={{ color: 'var(--text-secondary)' }}>{d.reportName}</p>
                      </div>
                    </div>
                  );
                })}
                {(selectedStock || feedMode === 'all') && feedHasMore && (
                  <div ref={feedSentinelRef} className="py-4 text-center text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                    {feedMoreLoading ? '공시 더 불러오는 중…' : ''}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      <AuthModal open={showLogin} onClose={() => setShowLogin(false)} />
      {showTopBtn && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label="맨 위로"
          style={{
            position: 'fixed', right: 16,
            bottom: 'calc(72px + env(safe-area-inset-bottom))',
            width: 44, height: 44, borderRadius: '50%',
            background: 'var(--accent, #ffffff)', border: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 14px rgba(255,255,255,0.45)',
            cursor: 'pointer', zIndex: 40,
          }}
        >
          <ArrowUp size={20} color="#000" strokeWidth={2.6} />
        </button>
      )}
    </div>
  );
}

// ===== 종목뉴스 =====
const CATEGORY_RULES: { label: string; bg: string; color: string; keywords: string[] }[] = [
  { label: '반도체', bg: 'rgba(219,39,119,0.15)', color: '#ffffff', keywords: ['반도체','HBM','파운드리','D램','낸드','TSMC','삼성전자','SK하이닉스','마이크론','엔비디아'] },
  { label: '바이오', bg: 'rgba(255,255,255,0.15)', color: '#ffffff', keywords: ['바이오','제약','임상','허가','FDA','항암','신약','셀트리온','삼성바이오','에이치엘비'] },
  { label: '2차전지', bg: 'rgba(74,222,128,0.13)', color: '#9DA7B3', keywords: ['2차전지','배터리','IRA','LG에너지','삼성SDI','SK온','양극재','음극재','전고체'] },
  { label: '자동차', bg: 'rgba(232,137,63,0.13)', color: '#e8893f', keywords: ['자동차','현대차','기아','전기차','EV','완성차','모빌리티','IPO','자율주행'] },
  { label: 'AI·플랫폼', bg: 'rgba(255,255,255,0.1)', color: '#ffffff', keywords: ['AI','인공지능','플랫폼','카카오','네이버','광고','데이터','클라우드','소프트웨어'] },
  { label: '에너지', bg: 'rgba(232,137,63,0.1)', color: '#e8893f', keywords: ['에너지','태양광','풍력','원전','수소','LS','한화','두산'] },
  { label: '금융', bg: 'rgba(59,130,246,0.13)', color: '#93C5FD', keywords: ['금융','은행','증권','보험','카드','금리','채권','주가'] },
];

function getCategoryForTitle(title: string): { label: string; bg: string; color: string } {
  const t = title.replace(/<[^>]*>/g, '');
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some((kw) => t.includes(kw))) return rule;
  }
  return { label: '증시', bg: 'rgba(152,152,168,0.15)', color: '#9898a8' };
}

function NewsTab() {
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [news, setNews] = useState<StockNewsItem[]>([]);
  const [searched, setSearched] = useState(false);
  const [latestNews, setLatestNews] = useState<StockNewsItem[]>([]);
  const [latestBusy, setLatestBusy] = useState(true);

  useEffect(() => {
    const keywords = ['삼성전자', 'SK하이닉스', '현대차', '카카오', 'LG에너지솔루션'];
    const pick = keywords[Math.floor(Math.random() * keywords.length)];
    newsService.getStockNews(pick)
      .then((items) => { setLatestNews(items); setLatestBusy(false); })
      .catch(() => setLatestBusy(false));
  }, []);

  const search = async (q: string) => {
    const t = q.trim();
    if (!t || busy) return;
    setBusy(true); setNews([]); setSearched(false);
    try {
      const items = await newsService.getStockNews(t);
      setNews(items);
    } catch { /* noop */ }
    finally { setBusy(false); setSearched(true); }
  };

  const NewsCard = ({ item }: { item: StockNewsItem }) => {
    const cat = getCategoryForTitle(item.title);
    const cleanTitle = item.title.replace(/<[^>]*>/g, '');
    return (
      <a href={item.link} target="_blank" rel="noopener noreferrer"
        className="block rounded-[14px] p-3.5 mb-2 active:opacity-70"
        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
        <span className="inline-block text-[9px] font-bold px-2 py-0.5 rounded-full mb-2"
          style={{ background: cat.bg, color: cat.color }}>{cat.label}</span>
        <p className="text-[12px] font-semibold leading-[1.45] mb-1.5"
          style={{ color: 'var(--text-primary)' }}>{cleanTitle}</p>
        <div className="flex justify-between items-center">
          <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>{item.source}</span>
          <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
            {new Date(item.pubDate).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
          </span>
        </div>
      </a>
    );
  };

  return (
    <div className="px-4 pt-[18px] pb-6">
      <div className="flex gap-2 mb-[9px]">
        <div className="flex-1 relative">
          <input value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="종목명 또는 키워드 입력"
            className="w-full px-4 py-[14px] rounded-[14px] text-[13px] outline-none"
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)', paddingRight: query ? 38 : 16 }}
            onKeyDown={(e) => { if (e.key === 'Enter') void search(query); }} />
          {query && (
            <button onClick={() => setQuery('')}
              className="absolute top-1/2 -translate-y-1/2 flex items-center justify-center"
              style={{ right: 12, width: 20, height: 20, borderRadius: 10, background: 'var(--bg-secondary)' }}
              aria-label="입력 지우기">
              <X size={12} color="var(--text-tertiary)" />
            </button>
          )}
        </div>
        <button onClick={() => void search(query)} disabled={!query.trim() || busy}
          className="w-[50px] rounded-[14px] flex items-center justify-center disabled:opacity-50"
          style={{ background: C.btnGrad }}>
          <Search size={16} color="#000" />
        </button>
      </div>
      <p className="text-[10px] flex items-center gap-1 mb-[18px]" style={{ color: 'var(--text-tertiary)' }}>
        <Sparkles size={11} /> 삼성전자, 005930, 반도체 모두 가능
      </p>

      {busy && <LoadingDots text="뉴스를 가져오는 중.." />}

      {searched && !busy && (
        <>
          {news.length === 0 ? (
            <div className="rounded-xl p-4 text-center mb-4"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
              <p className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>관련 뉴스를 찾을 수 없어요.</p>
            </div>
          ) : (
            <>
              <p className="text-[11px] mb-2 flex items-center gap-1" style={{ color: 'var(--text-tertiary)' }}>
                <Newspaper size={12} /> 검색 결과 {news.length}건
              </p>
              {news.map((item, i) => <NewsCard key={i} item={item} />)}
            </>
          )}
        </>
      )}

      {!searched && (
        <>
          <p className="text-[11px] mb-2 flex items-center gap-1" style={{ color: 'var(--text-tertiary)' }}>
            <Sparkles size={12} style={{ color: C.pink }} /> 지금 주목받는 뉴스
          </p>
          {latestBusy && <LoadingDots text="최신 뉴스 불러오는 중.." />}
          {!latestBusy && latestNews.length === 0 && (
            <p className="text-[12px] text-center py-6" style={{ color: 'var(--text-tertiary)' }}>뉴스를 불러올 수 없어요.</p>
          )}
          {latestNews.map((item, i) => <NewsCard key={i} item={item} />)}
        </>
      )}
    </div>
  );
}

// ===== 공통 =====
function StockResultCard({ result, onOpenDisclosure }: { result: StockAnalysisResult; onOpenDisclosure?: (arg: Disclosure | string, c?: string, n?: string) => void }) {
  const { stockName, stockCode, price, recentDisclosures, analysis } = result;
  const up = price ? price.change > 0 : false;
  const down = price ? price.change < 0 : false;
  const priceColor = up ? 'var(--rise)' : down ? 'var(--fall)' : 'var(--text-tertiary)';

  return (
    <div className="rounded-[16px] p-4 mb-3" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-[15px] font-bold" style={{ color: 'var(--text-primary)' }}>{stockName}</p>
          <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{stockCode}</p>
        </div>
        {price && (
          <div className="text-right">
            <p className="text-[15px] font-bold tabular-nums" style={{ color: priceColor }}>{price.current.toLocaleString()}원</p>
            <p className="text-[12px] flex items-center justify-end gap-0.5" style={{ color: priceColor }}>
              {up ? <TrendingUp size={12} /> : down ? <TrendingDown size={12} /> : null}
              {price.change >= 0 ? '+' : ''}{price.change.toLocaleString()} ({price.changeRate >= 0 ? '+' : ''}{price.changeRate}%)
            </p>
          </div>
        )}
      </div>
      <div className="rounded-xl p-3 mb-3" style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.25)' }}>
        <p className="text-[13px] leading-[1.6]" style={{ color: 'var(--text-primary)' }}>{analysis.summary}</p>
      </div>
      {analysis.detail && <p className="text-[12px] leading-[1.6] mb-3" style={{ color: 'var(--text-secondary)' }}>{analysis.detail}</p>}
      {analysis.recentMoves && (
        <div className="rounded-xl p-3 mb-3" style={{ background: 'var(--bg-secondary)' }}>
          <p className="text-[11px] mb-1.5" style={{ color: 'var(--text-primary)' }}>최근 공시 흐름</p>
          <p className="text-[11px] leading-[1.5]" style={{ color: 'var(--text-secondary)' }}>{analysis.recentMoves}</p>
        </div>
      )}
      {analysis.notes && analysis.notes.length > 0 && (
        <div className="mb-3">
          {analysis.notes.map((note, i) => (
            <div key={i} className="flex gap-2 items-start mb-1.5">
              <span className="w-1 h-1 rounded-full mt-2 flex-shrink-0" style={{ background: 'var(--text-tertiary)' }} />
              <p className="text-[11px] leading-[1.5]" style={{ color: 'var(--text-secondary)' }}>{note}</p>
            </div>
          ))}
        </div>
      )}
      {recentDisclosures.length > 0 && (
        <div className="rounded-xl p-3" style={{ background: 'var(--bg-secondary)' }}>
          <p className="text-[11px] flex items-center gap-1.5 mb-2" style={{ color: 'var(--text-primary)' }}>
            <FileText size={13} /> 최근 공시 {recentDisclosures.length}건
          </p>
          {recentDisclosures.slice(0, 5).map((d) => (
            <button key={d.receiptNo}
              className="w-full flex items-center justify-between py-1.5 text-left active:opacity-70"
              style={{ borderTop: '1px solid var(--border-subtle)', cursor: onOpenDisclosure ? 'pointer' : 'default' }}
              onClick={() => onOpenDisclosure?.(d.receiptNo, stockCode, stockName)}>
              <p className="text-[11px] truncate flex-1 mr-2" style={{ color: onOpenDisclosure ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{d.reportName}</p>
              <p className="text-[10px] flex-shrink-0" style={{ color: 'var(--text-tertiary)' }}>
                {new Date(d.disclosedAt).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function LoadingDots({ text }: { text: string }) {
  return (
    <div className="rounded-[16px] p-4 mb-3 flex items-center gap-2" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
      <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: C.purple, animation: 'aiBlink 1s infinite 0ms' }} />
      <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: C.purple, animation: 'aiBlink 1s infinite 150ms' }} />
      <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: C.purple, animation: 'aiBlink 1s infinite 300ms' }} />
      <span className="text-[13px] ml-1" style={{ color: 'var(--text-secondary)' }}>{text}</span>
    </div>
  );
}

function ErrorBox({ msg, onClose }: { msg: string; onClose: () => void }) {
  return (
    <div className="rounded-[16px] p-3.5 mb-3 flex items-start gap-2" style={{ background: 'rgba(232,137,63,0.12)', border: '1px solid rgba(232,137,63,0.25)' }}>
      <Info size={16} color="#e8893f" style={{ flexShrink: 0, marginTop: 1 }} />
      <span className="text-[13px] flex-1" style={{ color: 'var(--text-primary)' }}>{msg}</span>
      <button onClick={onClose}><X size={15} color="var(--text-tertiary)" /></button>
    </div>
  );
}
