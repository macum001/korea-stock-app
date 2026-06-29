// jp: 공시 필터 - 전체/중요/자본조달/호재/악재 5개 탭 (명세 기준)
// jp: ★ 선택 시 칩 색을 내용에 맞게: 중요=주황, 자본조달=마젠타, 호재=빨강, 악재=파랑, 전체=회색
import { DisclosureFilter } from '@/types/disclosure';

interface DisclosureFilterBarProps {
  filter: DisclosureFilter;
  onChange: (filter: DisclosureFilter) => void;
}

// jp: 화면 탭 정의 - 순서 고정: 전체 → 중요 → 자본조달 → 호재 → 악재
type TabId = 'all' | 'important' | 'capital' | 'good' | 'bad';
const TABS: { id: TabId; label: string }[] = [
  { id: 'all',       label: '전체' },
  { id: 'important', label: '중요' },
  { id: 'capital',   label: '자본조달' },
  { id: 'good',      label: '호재' },
  { id: 'bad',       label: '악재' },
];

// jp: ★ 선택(활성) 시 칩 배경색 - 은은한 톤 (B안)
// jp: 호재/악재만 차분한 색으로 방향 힌트, 나머지는 짙은 회색 (화려하지 않게)
const ACTIVE_BG: Record<TabId, string> = {
  all:       '#3f3f4a', // jp: 짙은 회색
  important: '#3f3f4a', // jp: 짙은 회색
  capital:   '#3f3f4a', // jp: 짙은 회색
  good:      '#c0392b', // jp: 차분한 빨강 (호재/상승)
  bad:       '#2563eb', // jp: 완전 파랑 (악재/하락)
};

// jp: 현재 filter 상태로 활성 탭 판별
function activeTab(filter: DisclosureFilter): TabId {
  if (filter.flagCapital)   return 'capital';
  if (filter.flagImportant) return 'important';
  if (filter.flagGood)      return 'good';
  if (filter.flagBad)       return 'bad';
  return 'all';
}

// jp: 탭 선택 시 filter 변환 (플래그 기반). 전체는 플래그 없음
function tabToFilter(tab: TabId, base: DisclosureFilter): DisclosureFilter {
  const next: DisclosureFilter = {
    ...base,
    flagImportant: undefined, flagCapital: undefined, flagGood: undefined, flagBad: undefined,
    // jp: 구 필터 제거 (호환)
    importance: undefined, sentiment: undefined, capitalRaising: undefined,
  };
  if (tab === 'important')    next.flagImportant = true;
  else if (tab === 'capital') next.flagCapital = true;
  else if (tab === 'good')    next.flagGood = true;
  else if (tab === 'bad')     next.flagBad = true;
  // jp: all이면 전부 undefined (전체 조회)
  return next;
}

export function DisclosureFilterBar({ filter, onChange }: DisclosureFilterBarProps) {
  const current = activeTab(filter);
  return (
    <div className="px-4 py-2">
      {/* btnGrad-chip: 가로 스크롤 칩 (전체=그라데이션) */}
      <div className="flex items-center gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        {TABS.map(({ id, label }) => {
          const active = current === id;
          const isAll = id === 'all';
          return (
            <button
              key={id}
              onClick={() => onChange(tabToFilter(id, filter))}
              className="px-4 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap flex-shrink-0"
              style={{
                background: active
                  ? (isAll ? '#A78BFA' : ACTIVE_BG[id])
                  : 'var(--bg-elevated)',
                color: active ? (isAll ? '#1a1530' : '#ffffff') : 'var(--text-secondary)',
                border: active ? '1px solid transparent' : '1px solid var(--border)',
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
