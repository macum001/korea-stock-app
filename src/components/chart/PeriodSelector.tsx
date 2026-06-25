// jp: 차트 기간 선택 컴포넌트
// jp: 변경: 15min / 120min / 240min 추가

import { PeriodType } from '@/types/stock';

interface PeriodSelectorProps {
  selected: PeriodType;
  onChange: (period: PeriodType) => void;
}

// jp: 분봉 그룹 / 일봉+ 그룹 구분
const PERIODS: { id: PeriodType; label: string }[] = [
  { id: '1min',   label: '1분'   },
  { id: '3min',   label: '3분'   },
  { id: '5min',   label: '5분'   },
  { id: '10min',  label: '10분'  },
  { id: '15min',  label: '15분'  },
  { id: '30min',  label: '30분'  },
  { id: '60min',  label: '60분'  },
  { id: '120min', label: '120분' },
  { id: '240min', label: '240분' },
  { id: 'day',    label: '일'    },
  { id: 'week',   label: '주'    },
  { id: 'month',  label: '월'    },
  { id: 'year',   label: '년'    },
];

// jp: 일봉 이상부터는 구분선 표시
const DIVIDER_BEFORE: Set<PeriodType> = new Set(['day']);

export function PeriodSelector({ selected, onChange }: PeriodSelectorProps) {
  return (
    <div className="flex items-center gap-1 px-4 py-2 overflow-x-auto scrollbar-hide">
      {PERIODS.map(({ id, label }) => {
        const isActive = selected === id;
        const showDivider = DIVIDER_BEFORE.has(id);
        return (
          <div key={id} className="flex items-center flex-shrink-0">
            {showDivider && (
              <div
                className="w-px h-4 mx-1 flex-shrink-0"
                style={{ backgroundColor: 'var(--border)' }}
              />
            )}
            <button
              onClick={() => onChange(id)}
              className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95"
              style={{
                backgroundColor: isActive ? 'var(--text-primary)' : 'transparent',
                color: isActive ? 'var(--bg-primary)' : 'var(--text-tertiary)',
              }}
            >
              {label}
            </button>
          </div>
        );
      })}
    </div>
  );
}
