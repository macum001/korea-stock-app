// jp: 장중 특징주 카드 - 관찰 포인트 + 주의 포인트 함께 표시 (추천 표현 금지)

import { StockFeatureScore } from '@/types/stockFeature';
import { FeaturedStockRiskBadge } from './FeaturedStockRiskBadge';
import { FeaturedStockReasonBadges } from './FeaturedStockReasonBadges';
import { formatPrice, formatChangeRate } from '@/utils/format';
import { useStockStore } from '@/store/stockStore';

interface Props {
  feature: StockFeatureScore;
  onPress: () => void;
}

function rateClass(rate: number): string {
  return rate > 0 ? 'text-[var(--rise)]' : rate < 0 ? 'text-[var(--fall)]' : '';
}

export function FeaturedStockCard({ feature, onPress }: Props) {
  const live = useStockStore(s => s.prices[feature.stockCode]);
  const rate = live?.changeRate ?? 0;
  const price = live?.price ?? 0;

  return (
    <button
      onClick={onPress}
      className="flex-shrink-0 w-60 p-3.5 rounded-2xl text-left active:opacity-80"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
    >
      {/* jp: 헤더 - 종목명 + 위험 배지 */}
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>
          {feature.stockName}
        </span>
        <FeaturedStockRiskBadge level={feature.riskLevel} />
      </div>

      {/* jp: 가격 + 등락률 + 특징점수 */}
      <div className="flex items-end justify-between mb-2">
        <div>
          <p className="text-base font-black tabular-nums" style={{ color: 'var(--text-primary)' }}>
            {price ? formatPrice(price) : '-'}
          </p>
          <p className={`text-xs font-bold ${rateClass(rate)}`}>
            {price ? formatChangeRate(rate) : '확인 필요'}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>특징점수</p>
          <p className="text-lg font-black" style={{ color: 'var(--accent)' }}>{feature.featuredScore}</p>
        </div>
      </div>

      {/* jp: 카테고리 배지 */}
      {feature.categories.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {feature.categories.slice(0, 3).map((c, i) => (
            <span
              key={i}
              className="text-[9px] font-bold px-1.5 py-0.5 rounded"
              style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
            >
              {c}
            </span>
          ))}
        </div>
      )}

      {/* jp: 관찰 포인트 */}
      {feature.reasons.length > 0 && (
        <div className="mb-2">
          <p className="text-[10px] font-semibold mb-1" style={{ color: 'var(--text-tertiary)' }}>관찰 포인트</p>
          <FeaturedStockReasonBadges reasons={feature.reasons.slice(0, 3)} />
        </div>
      )}

      {/* jp: 주의 포인트 */}
      {feature.cautions.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold mb-1" style={{ color: '#f59e0b' }}>주의 포인트</p>
          <FeaturedStockReasonBadges reasons={feature.cautions.slice(0, 2)} />
        </div>
      )}
    </button>
  );
}
