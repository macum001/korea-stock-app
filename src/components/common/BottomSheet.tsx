// jp: 공통 모달 컴포넌트 (이름은 BottomSheet지만 실제 동작은 "중앙 모달")
// jp: ★ 화면 한가운데 떠서 하단 탭바와 안 겹침 → 내용/버튼 항상 보임
// jp: 이 파일 하나만 고치면 이걸 쓰는 모든 시트가 다 중앙 모달이 됨
// jp:   (공시 상세 / 종목 알림 설정 / 메모 / 그룹 관리 / 내 정보 관리 등)

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  snapPoints?: number[]; // jp: (구버전 호환용, 미사용)
}

export function BottomSheet({ isOpen, onClose, title, children }: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: 9999, maxWidth: 430, margin: '0 auto' }}
      onClick={onClose}  // jp: 배경 클릭 → 닫기
    >
      {/* jp: 배경 오버레이 */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* jp: 중앙 모달 본체 */}
      <div
        ref={sheetRef}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full rounded-3xl overflow-hidden"
        style={{
          maxWidth: 400,
          backgroundColor: 'var(--bg-card)',
          maxHeight: '85dvh',
          border: '1px solid var(--border)',
          animation: 'sheetPop 0.2s cubic-bezier(0.32, 0.72, 0, 1)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* jp: 헤더 (제목 + X) */}
        {title && (
          <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            <h3 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
              {title}
            </h3>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full"
              style={{ backgroundColor: 'var(--bg-elevated)' }}
            >
              <X size={16} style={{ color: 'var(--text-secondary)' }} />
            </button>
          </div>
        )}

        {/* jp: 컨텐츠 (스크롤) */}
        <div className="overflow-y-auto" style={{ flex: 1 }}>
          {children}
        </div>
      </div>

      <style>{`
        @keyframes sheetPop {
          from { transform: scale(0.96); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
