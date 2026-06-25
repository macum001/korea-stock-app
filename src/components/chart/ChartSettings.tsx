// jp: 차트 설정 패널 - MA선/지표 토글, 차트종류/색상
import { X } from 'lucide-react';

export interface ChartConfig {
  ma: { 5: boolean; 20: boolean; 60: boolean; 120: boolean };
  volume: boolean;
  rsi: boolean;
  macd: boolean;
  bollinger: boolean;
  chartType: 'candle' | 'line';
  colorScheme: 'korea' | 'global';
}

export const DEFAULT_CHART_CONFIG: ChartConfig = {
  ma: { 5: true, 20: true, 60: true, 120: true },
  volume: true,
  rsi: false,
  macd: false,
  bollinger: false,
  chartType: 'candle',
  colorScheme: 'korea',
};

const MA_COLORS: Record<number, string> = { 5: '#f59e0b', 20: '#8b5cf6', 60: '#10b981', 120: '#3b82f6' };

interface Props {
  config: ChartConfig;
  onChange: (next: ChartConfig) => void;
  onClose: () => void;
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label="토글"
      style={{ width: 38, height: 22, borderRadius: 99, border: 'none', cursor: 'pointer',
        background: on ? 'var(--accent, #185FA5)' : 'var(--border, #444)', position: 'relative', transition: 'background 0.15s' }}>
      <span style={{ position: 'absolute', width: 16, height: 16, borderRadius: '50%', background: '#fff',
        top: 3, left: on ? 19 : 3, transition: 'left 0.15s' }} />
    </button>
  );
}

export function ChartSettings({ config, onChange, onClose }: Props) {
  const setMA = (p: 5 | 20 | 60 | 120) => onChange({ ...config, ma: { ...config.ma, [p]: !config.ma[p] } });
  const toggle = (k: 'volume' | 'rsi' | 'macd' | 'bollinger') => onChange({ ...config, [k]: !config[k] });

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--bg-card)', borderTopLeftRadius: 18, borderTopRightRadius: 18, width: '100%', maxWidth: 480, maxHeight: '80vh', overflowY: 'auto', paddingBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>차트 설정</span>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-tertiary)' }} aria-label="닫기"><X size={20} /></button>
        </div>

        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '0 0 12px' }}>이동평균선</p>
          {([5, 20, 60, 120] as const).map((p) => (
            <div key={p} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-primary)' }}>
                <span style={{ width: 14, height: 3, borderRadius: 2, background: MA_COLORS[p] }} />MA {p}
              </span>
              <Toggle on={config.ma[p]} onClick={() => setMA(p)} />
            </div>
          ))}
        </div>

        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '0 0 12px' }}>보조지표</p>
          {([['volume', '거래량'], ['rsi', 'RSI (14)'], ['macd', 'MACD (12,26,9)'], ['bollinger', '볼린저밴드 (20,2)']] as const).map(([k, label]) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{label}</span>
              <Toggle on={config[k]} onClick={() => toggle(k)} />
            </div>
          ))}
        </div>

        <div style={{ padding: '14px 18px' }}>
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '0 0 10px' }}>차트 종류 · 색상</p>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            {(['candle', 'line'] as const).map((t) => (
              <button key={t} onClick={() => onChange({ ...config, chartType: t })}
                style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12,
                  background: config.chartType === t ? 'var(--accent, #185FA5)' : 'var(--bg-elevated)',
                  color: config.chartType === t ? '#fff' : 'var(--text-secondary)' }}>
                {t === 'candle' ? '캔들' : '라인'}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {([['korea', '한국식'], ['global', '글로벌식']] as const).map(([c, label]) => (
              <button key={c} onClick={() => onChange({ ...config, colorScheme: c })}
                style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12,
                  background: config.colorScheme === c ? 'var(--accent, #185FA5)' : 'var(--bg-elevated)',
                  color: config.colorScheme === c ? '#fff' : 'var(--text-secondary)' }}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
