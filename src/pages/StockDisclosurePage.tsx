// jp: 종목별 공시 화면 - 차트/호가 없이 '그 종목 공시만' + 무한스크롤(보유분 전체)
// jp: ★ 스크롤 끝에 닿으면 다음 페이지 자동 로드 → 보유한 공시를 끝까지 노출
// jp: ★ 전체/중요/자본조달/호재/악재 필터 탭 제거 (공시는 최신순 전체)
// jp: ★ 뒤로가기 = 텍스트 없는 글래스 그라데이션 버튼
import { useState, useEffect, useCallback, useRef } from 'react';
import { Disclosure } from '@/types/disclosure';
import { DisclosureCard } from '@/components/disclosure/DisclosureCard';
import { DisclosureSummarySheet } from '@/components/disclosure/DisclosureSummarySheet';
import { SkeletonCard } from '@/components/common/SkeletonCard';
import { ChevronLeft } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const PAGE_SIZE = 50;

interface StockDisclosurePageProps {
  stockCode: string;
  stockName: string;
  onBack: () => void;
}

interface PageMeta { total: number; limit: number; offset: number; hasMore: boolean; }

// jp: 한 페이지 가져오기 (공시 조회 라우트는 비인증 → fetch 직접 사용 OK)
async function fetchPage(stockCode: string, offset: number): Promise<{ items: Disclosure[]; page: PageMeta }> {
  const res = await fetch(`${API_URL}/api/disclosures/stock/${stockCode}?limit=${PAGE_SIZE}&offset=${offset}`);
  if (!res.ok) throw new Error(`API ${res.status}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error || '오류');
  return {
    items: (json.data ?? []) as Disclosure[],
    page: (json.page ?? { total: json.data?.length ?? 0, limit: PAGE_SIZE, offset, hasMore: false }) as PageMeta,
  };
}

export function StockDisclosurePage({ stockCode, stockName, onBack }: StockDisclosurePageProps) {
  const [items, setItems] = useState<Disclosure[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selected, setSelected] = useState<Disclosure | null>(null);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const offsetRef = useRef(0);
  const loadingRef = useRef(false);

  const loadFirst = useCallback(async () => {
    setLoading(true);
    offsetRef.current = 0;
    try {
      const { items: first, page } = await fetchPage(stockCode, 0);
      setItems(first);
      setTotal(page.total);
      setHasMore(page.hasMore);
      offsetRef.current = first.length;
    } catch {
      setItems([]); setTotal(0); setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [stockCode]);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMore) return;
    loadingRef.current = true;
    setLoadingMore(true);
    try {
      const { items: more, page } = await fetchPage(stockCode, offsetRef.current);
      setItems(prev => {
        const seen = new Set(prev.map(d => d.receiptNo));
        const fresh = more.filter(d => !seen.has(d.receiptNo));
        return [...prev, ...fresh];
      });
      setHasMore(page.hasMore);
      offsetRef.current += more.length;
    } catch {
      setHasMore(false);
    } finally {
      setLoadingMore(false);
      loadingRef.current = false;
    }
  }, [stockCode, hasMore]);

  useEffect(() => { void loadFirst(); }, [loadFirst]);

  // jp: 스크롤 끝 감지 (IntersectionObserver)
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const ob = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) void loadMore(); },
      { rootMargin: '300px' }
    );
    ob.observe(el);
    return () => ob.disconnect();
  }, [loadMore]);

  return (
    <>
      <div className="min-h-dvh pb-24">
        <header
          className="sticky top-0 z-30 px-4 pt-4 pb-3"
          style={{ background: 'radial-gradient(circle at 85% 0%, #6D28D9 0%, transparent 60%), var(--bg-primary)' }}
        >
          {/* jp: 이색 뒤로가기 - 글래스 + 그라데이션 테두리 (텍스트 없음) */}
          <button onClick={onBack} aria-label="뒤로"
            className="w-[38px] h-[38px] rounded-[12px] mb-3 flex items-center justify-center active:scale-95 transition-all"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid transparent',
              backgroundImage: 'linear-gradient(var(--bg-primary),var(--bg-primary)), linear-gradient(135deg,#7F77DD,#DB2777)',
              backgroundOrigin: 'border-box',
              backgroundClip: 'padding-box, border-box',
            }}>
            <ChevronLeft size={19} style={{ color: '#F9A8D4' }} />
          </button>

          <div className="flex items-baseline gap-2 mb-1">
            <h1 className="text-[22px] font-extrabold" style={{ color: 'var(--text-primary)' }}>{stockName}</h1>
            <span className="text-xs font-semibold" style={{ color: 'var(--text-tertiary)' }}>{stockCode}</span>
          </div>
          <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
            {loading ? '공시 불러오는 중…' : `공시 ${total}건`}
          </p>
        </header>

        <div className="px-4 mt-3 space-y-3">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)
          ) : items.length === 0 ? (
            <div className="py-16 text-center px-6">
              <p className="text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>아직 공시가 없어요</p>
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{stockName}의 새 공시가 올라오면 여기에 떠요</p>
            </div>
          ) : (
            <>
              {items.map((d) => (
                <DisclosureCard key={d.receiptNo || d.id} disclosure={d} onClick={setSelected} />
              ))}

              {/* jp: 무한스크롤 센티넬 */}
              {hasMore && (
                <div ref={sentinelRef} className="py-4">
                  {loadingMore && <SkeletonCard />}
                </div>
              )}
              {!hasMore && items.length > 0 && (
                <p className="text-center text-[11px] py-4" style={{ color: 'var(--text-tertiary)' }}>
                  공시 {total}건을 모두 불러왔어요
                </p>
              )}
            </>
          )}
        </div>
      </div>

      <DisclosureSummarySheet disclosure={selected} isOpen={!!selected} onClose={() => setSelected(null)} />
    </>
  );
}
