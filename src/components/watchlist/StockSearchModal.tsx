// jp: 종목 검색 모달 - 전 종목 DB 검색 + 관심종목 추가
// jp: ★ 방식 C - 자동완성 + 다중 선택 (여러 종목 골라 하단 버튼으로 한 번에 등록)
// jp: ★ 회원 전용 - 비로그인이면 추가 시 로그인 모달
// jp: ★ 검색 결과 왼쪽 동그란 글자 아바타 제거

import { useState, useEffect } from 'react';
import { Search, X, Plus, Check } from 'lucide-react';
import { Stock } from '@/types/stock';
import { stockService } from '@/services/stockService';
import { useWatchlistStore } from '@/store/watchlistStore';
import { useAuthStore } from '@/store/authStore';
import { AuthModal } from '@/components/auth/AuthModal';

interface StockSearchModalProps {
  open: boolean;
  onClose: () => void;
  groupId?: string; // jp: 추가할 그룹 (없으면 기본 그룹)
}

export function StockSearchModal({ open, onClose, groupId }: StockSearchModalProps) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Stock[]>([]);
  const [searching, setSearching] = useState(false);
  // jp: ★ 다중 선택 - 아직 등록 전 임시 선택 목록 (code → Stock)
  const [picked, setPicked] = useState<Record<string, Stock>>({});
  const [toast, setToast] = useState('');

  const { hasItem, addItem } = useWatchlistStore();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [showLogin, setShowLogin] = useState(false);

  // jp: 모달 닫히면 초기화
  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQ(''); setResults([]); setPicked({}); setToast('');
    }
  }, [open]);

  // jp: 검색 (300ms 디바운스)
  useEffect(() => {
    const kw = q.trim();
    if (!kw) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults([]);
      return;
    }
    let active = true;
    const t = setTimeout(async () => {
      if (active) setSearching(true);
      const r = await stockService.searchStocks(kw);
      if (active) { setResults(r); setSearching(false); }
    }, 300);
    return () => { active = false; clearTimeout(t); };
  }, [q]);

  if (!open) return null;

  const pickedList = Object.values(picked);

  // jp: 결과 행 탭 → 선택 토글 (비로그인이면 로그인 유도)
  const toggle = (stock: Stock) => {
    if (!isAuthenticated) { setShowLogin(true); return; }
    if (hasItem(stock.code)) return; // jp: 이미 관심에 있는 종목은 무시
    setPicked((prev) => {
      const next = { ...prev };
      if (next[stock.code]) delete next[stock.code];
      else next[stock.code] = stock;
      return next;
    });
  };

  // jp: 하단 버튼 - 선택한 종목 일괄 등록
  const handleAddAll = () => {
    if (!isAuthenticated) { setShowLogin(true); return; }
    if (pickedList.length === 0) return;

    let added = 0;
    let failed = 0;
    for (const s of pickedList) {
      const ok = addItem(s.code, s.name, groupId);
      if (ok) added++; else failed++;
    }

    if (failed > 0) {
      // jp: 그룹당 10개 제한 등으로 일부 실패
      setToast(`${added}개 추가됨 · ${failed}개는 한도(그룹당 10개) 초과로 제외`);
      setPicked({});
      return;
    }
    onClose(); // jp: 전부 성공이면 닫기 (FeedPage가 refetch)
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'var(--bg-primary)' }}>
      {/* jp: 검색 헤더 */}
      <div className="flex items-center gap-2 px-4 pt-4 pb-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <div
          className="flex items-center gap-2 flex-1 px-3 py-2.5 rounded-xl"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
        >
          <Search size={16} style={{ color: 'var(--text-tertiary)' }} />
          <input
            autoFocus
            type="text"
            placeholder="종목명 또는 코드 검색"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="flex-1 bg-transparent outline-none text-sm"
            style={{ color: 'var(--text-primary)' }}
          />
        </div>
        <button onClick={onClose} className="p-1" aria-label="닫기">
          <X size={22} style={{ color: 'var(--text-tertiary)' }} />
        </button>
      </div>

      {/* jp: 비로그인 안내 배너 */}
      {!isAuthenticated && (
        <button
          onClick={() => setShowLogin(true)}
          className="mx-4 mt-3 px-3.5 py-2.5 rounded-xl text-left flex items-center gap-2 active:opacity-80"
          style={{ background: 'rgba(79,70,229,0.1)', border: '1px solid rgba(79,70,229,0.25)' }}
        >
          <span className="text-xs leading-relaxed" style={{ color: 'var(--accent)' }}>
            <strong>회원가입</strong>하면 관심종목을 등록하고 알림을 받을 수 있어요. 탭하여 로그인 →
          </span>
        </button>
      )}

      {/* jp: ★ 선택한 종목 pill (다중 선택) */}
      {pickedList.length > 0 && (
        <div
          className="mx-4 mt-3 p-2.5 rounded-xl flex flex-wrap gap-2"
          style={{ background: 'var(--accent-bg)', border: '1px solid var(--accent-border)' }}
        >
          {pickedList.map((s) => (
            <button
              key={s.code}
              onClick={() => toggle(s)}
              className="flex items-center gap-1.5 text-xs font-bold pl-2.5 pr-2 py-1.5 rounded-lg active:scale-95"
              style={{ background: '#ffffff', color: '#000000' }}
            >
              {s.name}
              <X size={12} style={{ opacity: 0.85 }} />
            </button>
          ))}
        </div>
      )}

      {/* jp: 토스트 (일부 실패 안내) */}
      {toast && (
        <div className="mx-4 mt-3 px-3.5 py-2.5 rounded-xl text-xs" style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
          {toast}
        </div>
      )}

      {/* jp: 검색 결과 */}
      <div className="flex-1 overflow-y-auto" style={{ paddingBottom: pickedList.length > 0 ? 90 : 0 }}>
        {!q.trim() ? (
          <p className="text-center text-xs py-10" style={{ color: 'var(--text-tertiary)' }}>
            종목명이나 코드를 입력하세요
          </p>
        ) : searching ? (
          <p className="text-center text-xs py-10" style={{ color: 'var(--text-tertiary)' }}>검색 중...</p>
        ) : results.length === 0 ? (
          <p className="text-center text-xs py-10" style={{ color: 'var(--text-tertiary)' }}>검색 결과가 없어요</p>
        ) : (
          results.map((stock) => {
            const already = hasItem(stock.code);     // jp: 이미 관심에 있음
            const isPicked = !!picked[stock.code];    // jp: 이번에 선택함
            return (
              <button
                key={stock.code}
                onClick={() => toggle(stock)}
                disabled={already}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:opacity-80"
                style={{ borderBottom: '1px solid var(--border-subtle)', opacity: already ? 0.5 : 1 }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>{stock.name}</p>
                    {stock.market && (
                      <span
                        className="flex-shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded"
                        style={{
                          background: stock.market === 'KOSPI' ? 'rgba(77,124,254,0.15)' : 'rgba(16,185,129,0.15)',
                          color: stock.market === 'KOSPI' ? 'var(--accent)' : '#10b981',
                        }}
                      >
                        {stock.market}
                      </span>
                    )}
                  </div>
                  <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{stock.code}</p>
                </div>
                {/* jp: 상태별 우측 표시 - 이미있음 / 선택됨 / 추가가능 */}
                <span
                  className="w-9 h-9 flex items-center justify-center rounded-full flex-shrink-0 text-xs font-bold"
                  style={{
                    background: already ? 'var(--bg-elevated)' : isPicked ? '#ffffff' : 'var(--bg-elevated)',
                    color: already ? 'var(--text-tertiary)' : isPicked ? '#000000' : 'var(--text-secondary)',
                    border: isPicked ? 'none' : '1px solid var(--border)',
                  }}
                >
                  {already ? '있음' : isPicked ? <Check size={16} /> : <Plus size={16} />}
                </span>
              </button>
            );
          })
        )}
      </div>

      {/* jp: ★ 하단 일괄 등록 버튼 */}
      {pickedList.length > 0 && (
        <div className="absolute left-0 right-0 bottom-0 px-4 pt-3 pb-5" style={{ background: 'linear-gradient(to top, var(--bg-primary) 72%, transparent)' }}>
          <button
            onClick={handleAddAll}
            className="w-full py-3.5 rounded-2xl text-sm font-extrabold active:scale-[0.99] transition-all"
            style={{ background: '#ffffff', color: '#000000', boxShadow: '0 8px 24px rgba(255,255,255,0.3)' }}
          >
            {pickedList.length}개 관심종목 추가
          </button>
        </div>
      )}

      {/* jp: 비회원 로그인 유도 모달 */}
      <AuthModal open={showLogin} onClose={() => setShowLogin(false)} />
    </div>
  );
}
