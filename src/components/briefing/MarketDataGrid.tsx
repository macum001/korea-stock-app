// jp: 전체 시장 숫자 데이터 - 카테고리별 (색띠 + 화살표 강조)
// jp: 상승=빨강, 하락=파랑 (한국식). 라이트/다크 대응.
import { MarketBriefing, BriefingDataItem } from '@/types/briefing';
import { CATEGORY_LABELS, CATEGORY_ORDER } from '@/services/marketBriefingService';

interface Props {
  briefing: MarketBriefing;
}

function rateColor(rate: number): string {
  if (rate > 0) return 'var(--rise, #ef4444)';
  if (rate < 0) return 'var(--fall, #3b82f6)';
  return 'var(--text-tertiary)';
}

function fmtPrice(n: number, unit?: string): string {
  const num = n.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
  return unit ? `${num}${unit}` : num;
}

function DataCell({ item }: { item: BriefingDataItem }) {
  const up = item.changeRate > 0;
  const down = item.changeRate < 0;
  const color = rateColor(item.changeRate);
  const barColor = up ? 'var(--rise, #ef4444)' : down ? 'var(--fall, #3b82f6)' : 'var(--border)';
  const arrow = up ? '▲' : down ? '▼' : '–';

  return (
    <div className="rounded-xl overflow-hidden"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', position: 'relative' }}>
      <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: barColor }} />
      <div className="pl-3 pr-2.5 py-2.5">
        <p className="text-[11.5px] font-bold truncate mb-1" style={{ color: 'var(--text-primary)' }}>{item.name}</p>
        <p className="text-[13.5px] font-extrabold tabular-nums leading-tight truncate" style={{ color: 'var(--text-primary)' }}>
          {fmtPrice(item.price, item.unit)}
        </p>
        <p className="text-[10.5px] font-extrabold tabular-nums flex items-center gap-1 mt-0.5" style={{ color }}>
          <span style={{ fontSize: 8 }}>{arrow}</span>
          {item.changeRateStr}
        </p>
      </div>
    </div>
  );
}

export function MarketDataGrid({ briefing }: Props) {
  const items = briefing.raw_data?.items ?? [];
  if (items.length === 0) return null;

  const byCategory: Record<string, BriefingDataItem[]> = {};
  for (const item of items) {
    if (!byCategory[item.category]) byCategory[item.category] = [];
    byCategory[item.category].push(item);
  }

  return (
    <div className="px-4 pb-2">
      {CATEGORY_ORDER.map(cat => {
        const catItems = byCategory[cat];
        if (!catItems || catItems.length === 0) return null;
        // jp: 항목 2개 이하 → 2열, 3개 이상 → 3열
        const cols = catItems.length <= 2 ? 2 : 3;
        return (
          <section key={cat} className="mb-5">
            <h3 className="text-[13px] font-bold mb-2.5" style={{ color: 'var(--text-secondary)' }}>
              {CATEGORY_LABELS[cat] ?? cat}
            </h3>
            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
              {catItems.map(item => <DataCell key={item.key} item={item} />)}
            </div>
          </section>
        );
      })}
    </div>
  );
}
