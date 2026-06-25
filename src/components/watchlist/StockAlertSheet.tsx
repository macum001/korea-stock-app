// jp: 종목 알림 설정 바텀시트 - 조건 추가/삭제/토글

import { useState } from 'react';
import { BottomSheet } from '@/components/common/BottomSheet';
import { useAlertStore } from '@/store/alertStore';
import { StockAlertType, ALERT_TYPE_CONFIG, DEFAULT_COOLDOWN_MINUTES } from '@/types/alert';
import { Plus, Trash2, Bell, BellOff } from 'lucide-react';

interface StockAlertSheetProps {
  stockCode: string;
  stockName: string;
  onClose: () => void;
}

const ALERT_TYPES: StockAlertType[] = [
  'price_above', 'price_below', 'change_rate_above', 'change_rate_below',
  'volume_spike', 'disclosure_all', 'disclosure_important', 'disclosure_keyword',
];

export function StockAlertSheet({ stockCode, stockName, onClose }: StockAlertSheetProps) {
  const { conditions, createCondition, deleteCondition, toggleCondition, getConditionsByStock } = useAlertStore();
  // jp: conditions 의존성으로 리렌더 유도
  void conditions;
  const myConditions = getConditionsByStock(stockCode);

  const [adding, setAdding] = useState(false);
  const [selectedType, setSelectedType] = useState<StockAlertType>('price_above');
  const [value, setValue] = useState('');
  const [keyword, setKeyword] = useState('');

  const config = ALERT_TYPE_CONFIG[selectedType];

  const handleAdd = () => {
    if (config.needsValue && !value) return;
    if (config.needsKeyword && !keyword.trim()) return;

    createCondition({
      stockCode,
      stockName,
      type: selectedType,
      value: config.needsValue ? parseFloat(value) : undefined,
      keyword: config.needsKeyword ? keyword.trim() : undefined,
      cooldownMinutes: DEFAULT_COOLDOWN_MINUTES,
    });
    setValue(''); setKeyword(''); setAdding(false);
  };

  // jp: 조건 설명 텍스트
  const describeCondition = (type: StockAlertType, v?: number, kw?: string): string => {
    const c = ALERT_TYPE_CONFIG[type];
    if (c.needsKeyword) return `${c.label}: "${kw}"`;
    if (c.needsValue) {
      if (type === 'price_above') return `${v?.toLocaleString()}원 이상이면 알림`;
      if (type === 'price_below') return `${v?.toLocaleString()}원 이하면 알림`;
      if (type === 'change_rate_above') return `+${v}% 이상 상승 시 알림`;
      if (type === 'change_rate_below') return `-${v}% 이상 하락 시 알림`;
      if (type === 'volume_spike') return `평균 대비 ${v}배 이상 거래량`;
    }
    return c.label;
  };

  return (
    <BottomSheet isOpen onClose={onClose} title={`${stockName} 알림 설정`}>
      <div className="px-5 pb-8">
        {/* jp: 기존 조건 목록 */}
        {myConditions.length > 0 ? (
          <div className="space-y-2 mb-4">
            {myConditions.map(c => (
              <div
                key={c.id}
                className="flex items-center gap-2 p-3 rounded-2xl"
                style={{ background: 'var(--bg-elevated)', opacity: c.isEnabled ? 1 : 0.5 }}
              >
                <button
                  onClick={() => toggleCondition(c.id)}
                  className="flex-shrink-0"
                  style={{ color: c.isEnabled ? 'var(--rise)' : 'var(--text-tertiary)' }}
                >
                  {c.isEnabled ? <Bell size={16} /> : <BellOff size={16} />}
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {ALERT_TYPE_CONFIG[c.type].label}
                  </p>
                  <p className="text-[11px] truncate" style={{ color: 'var(--text-tertiary)' }}>
                    {describeCondition(c.type, c.value, c.keyword)}
                  </p>
                </div>
                <button
                  onClick={() => deleteCondition(c.id)}
                  className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg"
                  style={{ color: 'var(--fall)' }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          !adding && (
            <p className="text-xs text-center py-6" style={{ color: 'var(--text-tertiary)' }}>
              설정된 알림이 없어요. 아래에서 추가해보세요.
            </p>
          )
        )}

        {/* jp: 조건 추가 폼 */}
        {adding ? (
          <div className="space-y-3 p-3 rounded-2xl" style={{ background: 'var(--bg-elevated)' }}>
            {/* jp: 알림 타입 선택 */}
            <div className="grid grid-cols-2 gap-1.5">
              {ALERT_TYPES.map(t => (
                <button
                  key={t}
                  onClick={() => setSelectedType(t)}
                  className="py-2 px-2 rounded-xl text-[11px] font-semibold"
                  style={{
                    background: selectedType === t ? 'var(--accent)' : 'var(--bg-card)',
                    color: selectedType === t ? '#fff' : 'var(--text-secondary)',
                  }}
                >
                  {ALERT_TYPE_CONFIG[t].label}
                </button>
              ))}
            </div>

            {/* jp: 값 입력 */}
            {config.needsValue && (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={value}
                  onChange={e => setValue(e.target.value)}
                  placeholder={config.label}
                  className="flex-1 px-3 py-2.5 rounded-xl text-sm outline-none"
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                  autoFocus
                />
                <span className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
                  {config.unit}
                </span>
              </div>
            )}

            {/* jp: 키워드 입력 */}
            {config.needsKeyword && (
              <input
                type="text"
                value={keyword}
                onChange={e => setKeyword(e.target.value)}
                placeholder="공시 키워드 (예: 공급계약)"
                className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                autoFocus
              />
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setAdding(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
                style={{ background: 'var(--bg-card)', color: 'var(--text-secondary)' }}
              >
                취소
              </button>
              <button
                onClick={handleAdd}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white"
                style={{ background: 'var(--accent)' }}
              >
                추가
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-bold"
            style={{ background: 'var(--bg-elevated)', color: 'var(--accent)' }}
          >
            <Plus size={16} /> 알림 조건 추가
          </button>
        )}

        {/* jp: 안내 */}
        <p className="text-[10px] leading-relaxed mt-3 px-1" style={{ color: 'var(--text-tertiary)' }}>
          같은 조건은 {DEFAULT_COOLDOWN_MINUTES}분에 한 번만 알림이 와요. 알림은 앱 내 알림함에 기록됩니다.
        </p>
      </div>
    </BottomSheet>
  );
}
