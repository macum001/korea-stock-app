// jp: 최근 분석 히스토리 - 공시분석/종목분석 공용 (kind로 구분)
// jp: 5개씩 표시 + 더보기 / 단건 X 삭제 / 전체 삭제 / 클릭하면 결과 펼침
// jp: 항목 글자수: 타이틀 + 서브타이틀 + 시간 + X

import { useState, useEffect, useCallback, useRef } from 'react';
import { Clock, Trash2, X, ChevronDown } from 'lucide-react';
import { aiService, AiHistoryItem } from '@/services/aiService';
import { useAuthStore } from '@/store/authStore';
import { AnalysisResultCard } from '@/components/ai/AnalysisResultCard';
import { StockHistoryCard } from '@/components/ai/StockHistoryCard';

interface Props {
  kind: 'receipt' | 'stock';
  refreshKey: number;
  accent: string;
  // jp: 종목분석 히스토리에서 공시 클릭 시 AI분석 시트 열기
  onOpenDisclosure?: (receiptNo: string, stockCode: string, stockName?: string) => void;
}

const PAGE = 5;

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return '방금';
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day === 1) return '어제';
  if (day < 30) return `${day}일 전`;
  return new Date(iso).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
}

function titleOf(item: AiHistoryItem): string {
  if (item.kind === 'stock') {
    const code = item.stockCode ? ` (${item.stockCode})` : '';
    return `${item.stockName || item.question}${code}`;
  }
  return item.receiptNo || item.question;
}

function subtitleOf(item: AiHistoryItem): string {
  if (item.kind === 'stock') return item.answer?.reportName || '종목 분석';
  const name = item.stockName ? `${item.stockName} ` : '';
  return `${name}${item.answer?.reportName || ''}`.trim() || item.question;
}

export function RecentAnalysis({ kind, refreshKey, accent, onOpenDisclosure }: Props) {
  const [items, setItems] = useState<AiHistoryItem[]>([]);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated || !!s.accessToken);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isAuthenticated) { setItems([]); setLoading(false); return; }
    setLoading(true);
    try {
      setItems(await aiService.getHistory(kind));
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [kind, isAuthenticated]);

  useEffect(() => { void load(); }, [load, refreshKey]);

  const handleDelete = async (id: string) => {
    const prev = items;
    setItems((l) => l.filter((i) => i.id !== id));
    if (openId === id) setOpenId(null);
    try { await aiService.deleteHistory(id); } catch { setItems(prev); }
  };

  // jp: 꾹 눌러 삭제 + 실행취소 (5초 지연 후 실제 DB 삭제 → 진짜 복구). 삭제 항목 기억 → 즉시 복구
  const [pressingId, setPressingId] = useState<string | null>(null);
  const [undoItem, setUndoItem] = useState<{ item: AiHistoryItem; title: string } | null>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lpFired = useRef(false);
  const delTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startPress = (id: string) => {
    lpFired.current = false; setPressingId(id);
    pressTimer.current = setTimeout(() => {
      lpFired.current = true; setPressingId(null);
      if (navigator.vibrate) navigator.vibrate(50);
      const it = items.find((x) => x.id === id);
      if (!it) return;
      setItems((l) => l.filter((x) => x.id !== id));
      if (openId === id) setOpenId(null);
      setUndoItem({ item: it, title: titleOf(it) });
      if (delTimer.current) clearTimeout(delTimer.current);
      delTimer.current = setTimeout(() => {
        aiService.deleteHistory(id).catch(() => {});
        setUndoItem(null);
      }, 5000);
    }, 500);
  };
  const cancelPress = () => { if (pressTimer.current) clearTimeout(pressTimer.current); setPressingId(null); };
  const undoDelete = () => {
    if (!undoItem) return;
    if (delTimer.current) clearTimeout(delTimer.current);
    setItems((l) => [undoItem.item, ...l].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
    setUndoItem(null);
  };

  const handleClearAll = async () => {
    if (items.length === 0) return;
    if (!window.confirm('최근 분석을 전체 삭제할까요?')) return;
    const prev = items;
    setItems([]);
    setOpenId(null);
    try { await aiService.clearHistory(); } catch { setItems(prev); }
  };

  const Wrap = ({ children }: { children: React.ReactNode }) => (
    <div className="rounded-2xl p-4 mb-3" style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)' }}>
      {children}
    </div>
  );

  if (loading) {
    return <Wrap><p className="text-sm text-center py-2" style={{ color: 'var(--text-tertiary)' }}>불러오는 중..</p></Wrap>;
  }

  if (!isAuthenticated) {
    return (
      <Wrap>
        <div className="flex flex-col items-center py-6 gap-2">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--bg-elevated)' }}>
            <Clock size={18} style={{ color: 'var(--text-tertiary)' }} />
          </div>
          <p className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>로그인하면 기록을 볼 수 있어요</p>
          <p className="text-[11px] text-center" style={{ color: 'var(--text-tertiary)' }}>
            분석 기록은 로그인한 계정에만 안전하게 저장돼요
          </p>
        </div>
      </Wrap>
    );
  }
  if (items.length === 0) {
    return (
      <Wrap>
        <div className="flex flex-col items-center py-6 gap-2">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--bg-elevated)' }}>
            <Clock size={18} style={{ color: 'var(--text-tertiary)' }} />
          </div>
          <p className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>아직 분석 기록이 없어요</p>
          <p className="text-[11px] text-center" style={{ color: 'var(--text-tertiary)' }}>
            {kind === 'receipt' ? '공시 접수번호를 분석하면 여기 뜰거에요' : '종목을 분석하면 여기 뜰거에요'}
          </p>
        </div>
      </Wrap>
    );
  }

  const visible = expanded ? items : items.slice(0, PAGE);

  return (
    <Wrap>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>최근 분석</span>
        <button onClick={handleClearAll} className="flex items-center gap-1 text-xs active:opacity-60" style={{ color: 'var(--fall)' }}>
          <Trash2 size={13} /> 전체 삭제
        </button>
      </div>
      {undoItem && (
        <div className="px-3 py-2 mb-2 rounded-xl text-xs flex items-center justify-between" style={{ background: '#2a2640', color: '#fff', border: '1px solid rgba(255,255,255,0.12)' }}>
          <span className="flex items-center gap-2"><Trash2 size={13} style={{ color: '#F472B6' }} /><span>{undoItem.title} 삭제됨</span></span>
          <button onClick={undoDelete} className="font-bold" style={{ color: '#A78BFA' }}>실행취소</button>
        </div>
      )}

      {visible.map((item, idx) => {
        const isOpen = openId === item.id;
        const isLast = idx === visible.length - 1;
        return (
          <div key={item.id} style={{ borderBottom: isLast ? 'none' : '0.5px solid var(--border-subtle)' }}>
            <div className="flex items-center gap-2.5 py-3 px-2 rounded-lg transition-colors" style={{ background: pressingId === item.id ? 'rgba(255,82,82,0.16)' : 'transparent' }}>
              <Clock size={15} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
              <button
                onClick={() => { if (lpFired.current) { lpFired.current = false; return; } setOpenId(isOpen ? null : item.id); }}
                onPointerDown={() => startPress(item.id)}
                onPointerUp={cancelPress}
                onPointerLeave={cancelPress}
                className="flex-1 min-w-0 text-left active:opacity-70">
                <p className="text-[13px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{titleOf(item)}</p>
                <p className="text-[11px] truncate mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{subtitleOf(item)}</p>
              </button>
              <span className="text-[11px] flex-shrink-0" style={{ color: 'var(--text-tertiary)' }}>{relativeTime(item.createdAt)}</span>
            </div>

            {isOpen && item.answer && (
              <div className="pb-3 pt-1">
                {/* jp: kind에 따라 다른 카드 렌더 */}
                {item.kind === 'stock'
                  ? <StockHistoryCard result={item.answer} onOpenDisclosure={onOpenDisclosure} />
                  : <AnalysisResultCard result={item.answer} />
                }
              </div>
            )}
          </div>
        );
      })}

      {items.length > PAGE && (
        <button onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-center gap-1 pt-3 text-xs font-semibold active:opacity-60"
          style={{ color: accent }}>
          {expanded ? '접기' : '더 보기'}
          <ChevronDown size={13} style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
        </button>
      )}
    </Wrap>
  );
}
