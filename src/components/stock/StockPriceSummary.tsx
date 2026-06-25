// jp: 종목 현재가 요약 컴포넌트
// jp: 종목명/코드 + 관심/알림 아이콘 (회원 전용 - 비로그인이면 로그인 유도)

import { memo, useState, useEffect } from 'react';
import { Stock } from '@/types/stock';
import { formatPrice, formatChange, formatChangeRate, getPriceColor, formatVolume } from '@/utils/format';
import { cn } from '@/utils/format';
import { useStockStore } from '@/store/stockStore';
import { useWatchlistStore } from '@/store/watchlistStore';
import { useAuthStore } from '@/store/authStore';
import { usePriceFlash } from '@/hooks/usePriceFlash';
import { TrendingUp, TrendingDown, Minus, Heart, Bell } from 'lucide-react';
import { StockAlertSettingsSheet } from './StockAlertSettingsSheet';
import { disclosureAlertService } from '@/services/disclosureAlertService';
import { AuthModal } from '@/components/auth/AuthModal';

interface StockPriceSummaryProps {
  stock: Stock;
}

export const StockPriceSummary = memo(function StockPriceSummary({ stock }: StockPriceSummaryProps) {
  const livePrice = useStockStore((s) => s.prices[stock.code]);
  const price = livePrice?.price ?? stock.price;
  const change = livePrice?.change ?? stock.change;
  const changeRate = livePrice?.changeRate ?? stock.changeRate;
  const priceClass = getPriceColor(change);
  const flash = usePriceFlash(livePrice?.price);
  const TrendIcon = change > 0 ? TrendingUp : change < 0 ? TrendingDown : Minus;

  // jp: 로그인 여부
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [showLogin, setShowLogin] = useState(false);

  // jp: 관심종목 토글
  const { hasItem, addItem, removeItem } = useWatchlistStore();
  const isFav = hasItem(stock.code);
  const handleFav = () => {
    // jp: 비회원이면 로그인 유도 (회원 전용 기능)
    if (!isAuthenticated) { setShowLogin(true); return; }
    if (isFav) removeItem(stock.code);
    else addItem(stock.code, stock.name);
  };

  // jp: 알림 설정
  const [showAlert, setShowAlert] = useState(false);
  const [alertOn, setAlertOn] = useState(false);
  useEffect(() => {
    let active = true;
    disclosureAlertService.getPrefs(stock.code).then((p) => {
      if (active && p) setAlertOn(p.isEnabled);
    });
    return () => { active = false; };
  }, [stock.code, showAlert]);

  const handleAlert = () => {
    // jp: 비회원이면 로그인 유도 (회원 전용 기능)
    if (!isAuthenticated) { setShowLogin(true); return; }
    setShowAlert(true);
  };

  return (
    <div className="px-5 pb-2">
      {/* jp: 종목명 코드 (종목 + 관심/알림 아이콘 우측) */}
      <div className="flex items-start justify-between gap-3 mb-1">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            {stock.name}
          </h1>
          <span className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>
            {stock.code}
          </span>
        </div>

        {/* jp: 아이콘 (라벨 없음). 터치영역 44px+, 간격 좁게 */}
        <div className="flex items-center gap-1.5 flex-shrink-0 -mr-1">
          <button
            onClick={handleFav}
            className="w-11 h-11 flex items-center justify-center rounded-full active:scale-90 transition-all"
            style={{ background: isFav ? 'rgba(255,82,82,0.12)' : 'var(--bg-elevated)' }}
            aria-label={isFav ? '관심종목 해제' : '관심종목 추가'}
          >
            <Heart
              size={22}
              className={cn(isFav ? 'fill-current' : '')}
              style={{ color: isFav ? 'var(--rise)' : 'var(--text-secondary)' }}
            />
          </button>

          <button
            onClick={handleAlert}
            className="relative w-11 h-11 flex items-center justify-center rounded-full active:scale-90 transition-all"
            style={{
              background: alertOn ? 'var(--accent)' : 'var(--bg-elevated)',
              border: alertOn ? '1px solid var(--accent)' : '1px solid transparent',
            }}
            aria-label="알림 설정"
          >
            <Bell
              size={22}
              className={cn(alertOn ? 'fill-current' : '')}
              style={{ color: alertOn ? '#fff' : 'var(--text-secondary)' }}
            />
            {alertOn && (
              <span
                className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full"
                style={{ background: '#fff', border: '1px solid var(--accent)' }}
              />
            )}
          </button>
        </div>
      </div>

      {/* jp: 현재가 */}
      <div className={`flex items-baseline gap-2 px-2 py-1 -mx-2 rounded-xl w-fit ${flash}`}>
        <span className={cn('text-4xl font-black tabular-nums', priceClass)}>
          {formatPrice(price)}
        </span>
        <span className="text-lg" style={{ color: 'var(--text-secondary)' }}>원</span>
      </div>

      {/* jp: 전일 대비 */}
      <div className="flex items-center gap-2 mt-1">
        <div className={cn('flex items-center gap-1 text-base font-semibold', priceClass)}>
          <TrendIcon size={16} />
          <span>{formatChange(change)}</span>
          <span>({formatChangeRate(changeRate)})</span>
        </div>
        <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>전일 대비</span>
      </div>

      {/* jp: 거래량 */}
      {livePrice && (
        <div className="flex items-center gap-3 mt-2">
          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            거래량 <span style={{ color: 'var(--text-secondary)' }}>{formatVolume(livePrice.volume)}</span>
          </span>
          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            고가 <span className="text-rise">{formatPrice(livePrice.high)}</span>
          </span>
          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            저가 <span className="text-fall">{formatPrice(livePrice.low)}</span>
          </span>
        </div>
      )}

      {/* jp: 실시간 표시 뱃지 */}
      <div className="flex items-center gap-1.5 mt-2">
        <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: 'var(--rise)' }} />
        <span className="text-[10px] font-medium" style={{ color: 'var(--text-tertiary)' }}>
          실시간 주문 가능
        </span>
      </div>

      {/* jp: 알림 설정 바텀시트 */}
      {showAlert && (
        <StockAlertSettingsSheet
          stockCode={stock.code}
          stockName={stock.name}
          onClose={() => setShowAlert(false)}
        />
      )}

      {/* jp: 비회원 로그인 유도 모달 */}
      <AuthModal open={showLogin} onClose={() => setShowLogin(false)} />
    </div>
  );
});
