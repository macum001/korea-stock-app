// jp: 스와이프 래퍼 (목업 ⑥) - 관심/증권 탭 공용
// jp: WatchlistCard/StockCard를 감싸기만. 왼쪽으로 밀면 액션 노출
// jp: 한 번에 한 행만 열림. 카드 내부는 안 건드림
// jp: 닫혀있을 땐 액션 버튼 숨김 (카드 하단 비침 방지)
// jp: 세 번째 액션은 커스텀 (관심탭=삭제, 증권탭=관심추가)

import { useRef, useState, ReactNode } from 'react';
import { Bell, Pencil, Trash2, Heart, Check } from 'lucide-react';

// jp: 세 번째 액션 종류
type ThirdAction =
  | { kind: 'delete'; onAct: () => void }
  | { kind: 'addWatch'; onAct: () => void; alreadyAdded: boolean };

interface SwipeableRowProps {
  rowId: string;
  openId: string | null;
  setOpenId: (id: string | null) => void;
  onAlert: () => void;
  onMemo: () => void;
  third: ThirdAction;     // jp: 삭제 또는 관심추가
  children: ReactNode;
}

const ACTION_WIDTH = 72;
const ACTIONS_TOTAL = ACTION_WIDTH * 3;

export function SwipeableRow({
  rowId, openId, setOpenId, onAlert, onMemo, third, children,
}: SwipeableRowProps) {
  const isOpen = openId === rowId;
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startX = useRef(0);
  const dragging = useRef(false);
  const moved = useRef(false);

  const translateX = dragging.current ? dragX : (isOpen ? -ACTIONS_TOTAL : 0);
  const showActions = isDragging || isOpen || translateX < 0;

  const onStart = (clientX: number) => {
    startX.current = clientX;
    dragging.current = true;
    moved.current = false;
    setIsDragging(true);
  };

  const onMove = (clientX: number) => {
    if (!dragging.current) return;
    const delta = clientX - startX.current;
    const base = isOpen ? -ACTIONS_TOTAL : 0;
    let next = base + delta;
    if (next > 0) next = 0;
    if (next < -ACTIONS_TOTAL) next = -ACTIONS_TOTAL - (next + ACTIONS_TOTAL) * 0.2;
    if (Math.abs(delta) > 5) moved.current = true;
    setDragX(next);
  };

  const onEnd = () => {
    if (!dragging.current) return;
    dragging.current = false;
    setIsDragging(false);
    if (translateX < -ACTIONS_TOTAL / 2) setOpenId(rowId);
    else setOpenId(null);
    setDragX(0);
  };

  const act = (fn: () => void) => {
    fn();
    setOpenId(null);
  };

  // jp: 세 번째 버튼 렌더 정보
  const renderThird = () => {
    if (third.kind === 'delete') {
      return (
        <button
          onClick={() => act(third.onAct)}
          className="flex flex-col items-center justify-center gap-1"
          style={{ width: ACTION_WIDTH, background: '#ff5252', color: '#fff' }}
        >
          <Trash2 size={18} />
          <span className="text-[11px] font-bold">삭제</span>
        </button>
      );
    }
    // jp: 관심추가 (이미 등록이면 회색 + 체크 + "등록됨")
    const added = third.alreadyAdded;
    return (
      <button
        onClick={() => { if (!added) act(third.onAct); else setOpenId(null); }}
        className="flex flex-col items-center justify-center gap-1"
        style={{ width: ACTION_WIDTH, background: added ? '#6b7280' : '#10b981', color: '#fff' }}
      >
        {added ? <Check size={18} /> : <Heart size={18} />}
        <span className="text-[10px] font-bold leading-tight text-center px-1">
          {added ? '등록됨' : '관심추가'}
        </span>
      </button>
    );
  };

  return (
    <div className="relative overflow-hidden">
      {/* jp: 뒤 액션 버튼 - 닫힘 시 숨김 */}
      <div
        className="absolute top-0 right-0 bottom-0 flex"
        style={{
          opacity: showActions ? 1 : 0,
          pointerEvents: showActions ? 'auto' : 'none',
          marginBottom: 8,
        }}
      >
        <button
          onClick={() => act(onAlert)}
          className="flex flex-col items-center justify-center gap-1"
          style={{ width: ACTION_WIDTH, background: '#f59e0b', color: '#fff' }}
        >
          <Bell size={18} />
          <span className="text-[11px] font-bold">알림</span>
        </button>
        <button
          onClick={() => act(onMemo)}
          className="flex flex-col items-center justify-center gap-1"
          style={{ width: ACTION_WIDTH, background: '#8b5cf6', color: '#fff' }}
        >
          <Pencil size={18} />
          <span className="text-[11px] font-bold">메모</span>
        </button>
        {renderThird()}
      </div>

      {/* jp: 앞 카드 */}
      <div
        style={{
          transform: `translateX(${translateX}px)`,
          transition: dragging.current ? 'none' : 'transform 0.25s ease',
          position: 'relative',
          zIndex: 1,
        }}
        onTouchStart={(e) => onStart(e.touches[0].clientX)}
        onTouchMove={(e) => onMove(e.touches[0].clientX)}
        onTouchEnd={onEnd}
        onMouseDown={(e) => onStart(e.clientX)}
        onMouseMove={(e) => { if (dragging.current) onMove(e.clientX); }}
        onMouseUp={onEnd}
        onMouseLeave={() => { if (dragging.current) onEnd(); }}
        onClickCapture={(e) => {
          if (moved.current) { e.stopPropagation(); e.preventDefault(); moved.current = false; }
        }}
      >
        {children}
      </div>
    </div>
  );
}
