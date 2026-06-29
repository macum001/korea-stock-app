// jp: AI 분석 히스토리 목록 - DB 조회, 다시보기, 삭제
// jp: 항목 탭 → 분석 결과 다시 펼침. 휴지통 → 개별 삭제. 전체 삭제 버튼.

import { useState, useEffect, useCallback } from 'react';
import { Clock, Trash2, ChevronRight, History as HistoryIcon } from 'lucide-react';
import { aiService, AiHistoryItem } from '@/services/aiService';
import { AnalysisResultCard } from '@/components/ai/AnalysisResultCard';

// jp: 분류 색상
const CATEGORY_COLOR: Record<string, string> = {
  capital: '#ffffff', good: '#10b981', bad: '#ff5252', important: '#f59e0b', general: '#9898a8',
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return '방금';
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}일 전`;
  return new Date(iso).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
}

export function HistoryList() {
  const [items, setItems] = useState<AiHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await aiService.getHistory();
      setItems(data);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // jp: 개별 삭제 (낙관적)
  const handleDelete = async (id: string) => {
    const prev = items;
    setItems((list) => list.filter((i) => i.id !== id));
    if (openId === id) setOpenId(null);
    try {
      await aiService.deleteHistory(id);
    } catch {
      setItems(prev); // jp: 실패 시 복원
    }
  };

  // jp: 전체 삭제
  const handleClearAll = async () => {
    if (items.length === 0) return;
    if (!window.confirm('히스토리를 전체 삭제할까요?')) return;
    const prev = items;
    setItems([]);
    setOpenId(null);
    try {
      await aiService.clearHistory();
    } catch {
      setItems(prev);
    }
  };

  if (loading) {
    return (
      <div className="px-4 py-10 text-center text-sm" style={{ color: 'var(--text-tertiary)' }}>
        불러오는 중...
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center pt-16">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3"
          style={{ background: 'var(--bg-elevated)' }}>
          <HistoryIcon size={22} style={{ color: 'var(--text-tertiary)' }} />
        </div>
        <p className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>아직 분석 기록이 없어요</p>
        <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
          공시 접수번호를 분석하면 여기에 저장돼요
        </p>
      </div>
    );
  }

  return (
    <div className="px-4 py-3">
      {/* jp: 헤더 - 전체 삭제 */}
      <div className="flex items-center justify-between mb-3 px-1">
        <span className="text-xs font-semibold" style={{ color: 'var(--text-tertiary)' }}>
          분석 기록 {items.length}개
        </span>
        <button onClick={handleClearAll}
          className="text-xs font-medium active:opacity-60" style={{ color: 'var(--fall)' }}>
          전체 삭제
        </button>
      </div>

      <div className="space-y-2">
        {items.map((item) => {
          const cat = item.answer?.analysis?.category ?? 'general';
          const catLabel = item.answer?.analysis?.categoryLabel ?? '일반';
          const color = CATEGORY_COLOR[cat] ?? CATEGORY_COLOR.general;
          const isOpen = openId === item.id;
          return (
            <div key={item.id} className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-elevated)' }}>
              {/* jp: 항목 헤더 (탭하면 펼침) */}
              <div className="flex items-center">
                <button
                  onClick={() => setOpenId(isOpen ? null : item.id)}
                  className="flex-1 flex items-center gap-3 p-3.5 text-left active:opacity-70"
                >
                  <span className="px-2 py-1 rounded-lg text-[11px] font-bold flex-shrink-0"
                    style={{ background: `${color}22`, color }}>
                    {catLabel}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                      {item.stockName || item.question}
                    </p>
                    <p className="text-xs truncate" style={{ color: 'var(--text-tertiary)' }}>
                      {item.answer?.reportName || item.question}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Clock size={11} style={{ color: 'var(--text-tertiary)' }} />
                    <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                      {relativeTime(item.createdAt)}
                    </span>
                    <ChevronRight size={15} style={{
                      color: 'var(--text-tertiary)',
                      transform: isOpen ? 'rotate(90deg)' : 'none',
                      transition: 'transform 0.2s',
                    }} />
                  </div>
                </button>
                <button onClick={() => handleDelete(item.id)}
                  className="px-3 py-3.5 active:opacity-60 flex-shrink-0">
                  <Trash2 size={15} style={{ color: 'var(--text-tertiary)' }} />
                </button>
              </div>

              {/* jp: 펼침 - 분석 결과 다시보기 */}
              {isOpen && item.answer && (
                <div className="px-3 pb-3 pt-1" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                  <div className="mt-3">
                    <AnalysisResultCard result={item.answer} />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
