// jp: 종목 알림 설정 바텀시트 (사양 - 종 아이콘에서 열림)
// jp: [종목명] 알림 설정 → 섹션1 공시 5종 + 섹션2 가격 4종 (모두 카드형 토글)
// jp: 공시: 백엔드 실연결 (disclosureAlertService 5종)
// jp: 가격: useAlertStore (조건 ON/OFF + 값 인라인 입력) - 백엔드 stock_alert_conditions

import { useState, useEffect } from 'react';
import { X, FileText, Star, Coins, TrendingUp, AlertTriangle, Target, ArrowUpRight, ArrowDownRight, BarChart3 } from 'lucide-react';
import { disclosureAlertService, DisclosureAlertPrefs } from '@/services/disclosureAlertService';
import { useAlertStore } from '@/store/alertStore';
import { StockAlertType, DEFAULT_COOLDOWN_MINUTES } from '@/types/alert';

interface StockAlertSettingsSheetProps {
  stockCode: string;
  stockName: string;
  onClose: () => void;
}

// jp: 공시 5종
const DISCLOSURE_TYPES: {
  key: keyof DisclosureAlertPrefs; label: string; desc: string; icon: typeof FileText; color: string;
}[] = [
  { key: 'alertAll',       label: '모든 공시',   desc: '해당 종목의 모든 공시 알림',                    icon: FileText,      color: 'var(--text-secondary)' },
  { key: 'alertImportant', label: '중요 공시',   desc: '투자 판단에 영향이 큰 공시',                     icon: Star,          color: '#f59e0b' },
  { key: 'alertCapital',   label: '자본조달 공시', desc: '유상증자, CB, BW, EB, RCPS 등 자금조달 관련',    icon: Coins,         color: '#ffffff' },
  { key: 'alertGood',      label: '호재 공시',   desc: '자사주, 수주, 계약, 배당, 실적개선 등 긍정 공시', icon: TrendingUp,    color: '#10b981' },
  { key: 'alertBad',       label: '악재 공시',   desc: '횡령, 배임, 감사의견, 상장폐지, 거래정지 등',     icon: AlertTriangle, color: 'var(--fall)' },
];

// jp: 가격 4종 (사양: 목표가 도달/급등/급락/거래량 급증)
const PRICE_TYPES: {
  type: StockAlertType; label: string; desc: string; icon: typeof Target; color: string;
  unit: string; placeholder: string;
}[] = [
  { type: 'price_above',       label: '목표가 도달', desc: '설정한 가격 이상 도달 시 알림', icon: Target,         color: 'var(--accent)', unit: '원', placeholder: '목표가' },
  { type: 'change_rate_above', label: '급등 알림',   desc: '설정한 상승률 이상 시 알림',    icon: ArrowUpRight,   color: '#ff5252',       unit: '%',  placeholder: '상승률' },
  { type: 'change_rate_below', label: '급락 알림',   desc: '설정한 하락률 이상 시 알림',    icon: ArrowDownRight, color: '#5c8aff',       unit: '%',  placeholder: '하락률' },
  { type: 'volume_spike',      label: '거래량 급증', desc: '평균 대비 거래량 급증 시 알림', icon: BarChart3,      color: '#f59e0b',       unit: '배', placeholder: '배수' },
];

const DEFAULT_PREFS: DisclosureAlertPrefs = {
  alertAll: false, alertImportant: true, alertCapital: true, alertGood: true, alertBad: true,
};

export function StockAlertSettingsSheet({ stockCode, stockName, onClose }: StockAlertSettingsSheetProps) {
  const [prefs, setPrefs] = useState<DisclosureAlertPrefs>(DEFAULT_PREFS);
  const [saving, setSaving] = useState(false);

  const { createCondition, deleteCondition, getConditionsByStock, loadConditions, loaded } = useAlertStore();
  const myConditions = getConditionsByStock(stockCode);

  // jp: 가격 입력값 (타입별)
  const [priceValues, setPriceValues] = useState<Record<string, string>>({});

  // jp: 공시 설정 로드
  useEffect(() => {
    let active = true;
    disclosureAlertService.getPrefs(stockCode).then((p) => {
      if (!active || !p) return;
      setPrefs({
        alertAll: p.alertAll, alertImportant: p.alertImportant,
        alertCapital: p.alertCapital, alertGood: p.alertGood, alertBad: p.alertBad,
      });
    });
    return () => { active = false; };
  }, [stockCode]);

  // jp: 가격 알림 조건 백엔드에서 로드 (아직 안 불렀으면)
  useEffect(() => {
    if (!loaded) void loadConditions();
  }, [loaded, loadConditions]);

  // jp: 공시 토글
  const handleDisclosureToggle = async (key: keyof DisclosureAlertPrefs) => {
    if (saving) return;
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    setSaving(true);
    const ok = await disclosureAlertService.setPrefs(stockCode, next);
    if (!ok) setPrefs(prefs);
    setSaving(false);
  };

  // jp: 가격 알림 조건 찾기 (이 종목 + 타입)
  const findCondition = (type: StockAlertType) =>
    myConditions.find(c => c.type === type);

  // jp: 가격 토글 - ON이면 조건 생성(값 필요), OFF면 삭제
  const handlePriceToggle = (type: StockAlertType) => {
    const existing = findCondition(type);
    if (existing) {
      deleteCondition(existing.id);
      return;
    }
    const v = parseFloat(priceValues[type] || '');
    if (!v || isNaN(v)) return;
    createCondition({
      stockCode, stockName, type, value: v,
      cooldownMinutes: DEFAULT_COOLDOWN_MINUTES,
    });
  };

  // jp: 값 입력 후 블러 시 조건 갱신
  const handlePriceValueCommit = (type: StockAlertType) => {
    const existing = findCondition(type);
    const v = parseFloat(priceValues[type] || '');
    if (!v || isNaN(v)) return;
    if (existing) deleteCondition(existing.id);
    createCondition({
      stockCode, stockName, type, value: v,
      cooldownMinutes: DEFAULT_COOLDOWN_MINUTES,
    });
  };

  return (
    <>
      <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose} />

      <div
        className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl max-h-[90dvh] overflow-y-auto"
        style={{ background: 'var(--bg-primary)' }}
      >
        {/* jp: 헤더 */}
        <div className="sticky top-0 px-5 pt-3 pb-3 z-10" style={{ background: 'var(--bg-primary)' }}>
          <div className="w-10 h-1 rounded-full mx-auto mb-3" style={{ background: 'var(--border)' }} />
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
              {stockName} 알림 설정
            </h2>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full"
              style={{ background: 'var(--bg-elevated)' }}
            >
              <X size={16} style={{ color: 'var(--text-secondary)' }} />
            </button>
          </div>
        </div>

        <div className="px-5 pb-8">
          {/* jp: ── 섹션 1: 공시 알림 ── */}
          <div className="flex items-center gap-1.5 mb-2 mt-1">
            <FileText size={14} style={{ color: 'var(--text-tertiary)' }} />
            <p className="text-xs font-bold" style={{ color: 'var(--text-tertiary)' }}>공시 알림</p>
          </div>
          <div className="space-y-2 mb-6">
            {DISCLOSURE_TYPES.map(({ key, label, desc, icon: Icon, color }) => {
              const on = prefs[key];
              return (
                <button
                  key={key}
                  onClick={() => handleDisclosureToggle(key)}
                  disabled={saving}
                  className="flex items-center justify-between w-full p-3.5 rounded-2xl transition-all active:opacity-70"
                  style={{ background: 'var(--bg-elevated)', opacity: saving ? 0.7 : 1 }}
                >
                  <div className="flex items-center gap-3 text-left">
                    <div className="w-9 h-9 flex items-center justify-center rounded-xl flex-shrink-0"
                      style={{ background: on ? `${color}22` : 'var(--bg-card)' }}>
                      <Icon size={17} style={{ color: on ? color : 'var(--text-tertiary)' }} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{label}</p>
                      <p className="text-[11px] leading-tight" style={{ color: 'var(--text-tertiary)' }}>{desc}</p>
                    </div>
                  </div>
                  <ToggleSwitch on={on} color={color} />
                </button>
              );
            })}
          </div>

          {/* jp: ── 섹션 2: 가격 알림 ── */}
          <div className="flex items-center gap-1.5 mb-2">
            <Target size={14} style={{ color: 'var(--text-tertiary)' }} />
            <p className="text-xs font-bold" style={{ color: 'var(--text-tertiary)' }}>가격 알림</p>
          </div>
          <div className="space-y-2">
            {PRICE_TYPES.map(({ type, label, desc, icon: Icon, color, unit, placeholder }) => {
              const cond = findCondition(type);
              const on = !!cond;
              const inputVal = priceValues[type] ?? (cond?.value != null ? String(cond.value) : '');
              return (
                <div
                  key={type}
                  className="p-3.5 rounded-2xl transition-all"
                  style={{ background: 'var(--bg-elevated)' }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 text-left">
                      <div className="w-9 h-9 flex items-center justify-center rounded-xl flex-shrink-0"
                        style={{ background: on ? `${color}22` : 'var(--bg-card)' }}>
                        <Icon size={17} style={{ color: on ? color : 'var(--text-tertiary)' }} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{label}</p>
                        <p className="text-[11px] leading-tight" style={{ color: 'var(--text-tertiary)' }}>{desc}</p>
                      </div>
                    </div>
                    <button onClick={() => handlePriceToggle(type)}>
                      <ToggleSwitch on={on} color={color} />
                    </button>
                  </div>

                  {/* jp: 값 입력 (인라인) */}
                  <div className="flex items-center gap-2 mt-3 pl-12">
                    <input
                      type="number"
                      value={inputVal}
                      onChange={(e) => setPriceValues(prev => ({ ...prev, [type]: e.target.value }))}
                      onBlur={() => { if (on) handlePriceValueCommit(type); }}
                      placeholder={placeholder}
                      className="flex-1 px-3 py-2 rounded-xl text-sm outline-none"
                      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                    />
                    <span className="text-sm font-semibold w-6" style={{ color: 'var(--text-secondary)' }}>{unit}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <p className="text-[10px] leading-relaxed mt-4 px-1" style={{ color: 'var(--text-tertiary)' }}>
            값을 입력하고 토글을 켜면 알림이 설정돼요. 같은 조건은 {DEFAULT_COOLDOWN_MINUTES}분에 한 번만 알려드려요.
          </p>
        </div>
      </div>
    </>
  );
}

// jp: 토글 스위치 (공통)
function ToggleSwitch({ on, color }: { on: boolean; color: string }) {
  return (
    <span
      className="relative w-11 h-6 rounded-full transition-all flex-shrink-0 inline-block"
      style={{ background: on ? color : 'var(--border)' }}
    >
      <span
        className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all"
        style={{ left: on ? '22px' : '2px' }}
      />
    </span>
  );
}
