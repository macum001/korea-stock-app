// jp: 주식 & 관심종목 상태 관리 스토어

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Stock, StockPrice, ConnectionStatus } from '@/types/stock';

// jp: 주식 시세 스토어
interface StockStore {
  stocks: Stock[];
  prices: Record<string, StockPrice>;
  connectionStatus: ConnectionStatus;
  recentlyViewed: string[]; // 최근 본 종목 코드
  setStocks: (stocks: Stock[]) => void;
  updatePrice: (code: string, price: StockPrice) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
  addRecentlyViewed: (code: string) => void;
}

export const useStockStore = create<StockStore>()((set) => ({
  stocks: [],
  prices: {},
  connectionStatus: 'disconnected',
  recentlyViewed: [],

  setStocks: (stocks) => set({ stocks }),

  updatePrice: (code, price) => {
    set((state) => ({
      prices: { ...state.prices, [code]: price },
      // jp: 스톡 리스트의 현재가도 갱신
      stocks: state.stocks.map((s) =>
        s.code === code
          ? { ...s, price: price.price, change: price.change, changeRate: price.changeRate }
          : s
      ),
    }));
    // jp: 알림 조건 평가 (순환 import 방지 위해 동적 import)
    import('@/services/alerts/alertEvaluator').then(({ evaluateStockAlerts }) => {
      evaluateStockAlerts(price);
    });
  },

  setConnectionStatus: (status) => set({ connectionStatus: status }),

  addRecentlyViewed: (code) =>
    set((state) => {
      const filtered = state.recentlyViewed.filter((c) => c !== code);
      return { recentlyViewed: [code, ...filtered].slice(0, 10) }; // 최대 10개
    }),
}));

// jp: 관심종목 스토어
interface WatchlistStore {
  favorites: Set<string>;
  toggleFavorite: (code: string) => void;
  isFavorite: (code: string) => boolean;
}

export const useWatchlistStore = create<WatchlistStore>()(
  persist(
    (set, get) => ({
      favorites: new Set<string>(['000660', '005930']),

      toggleFavorite: (code) =>
        set((state) => {
          const next = new Set(state.favorites);
          if (next.has(code)) {
            next.delete(code);
          } else {
            next.add(code);
          }
          return { favorites: next };
        }),

      isFavorite: (code) => get().favorites.has(code),
    }),
    {
      name: 'watchlist-store',
      // jp: Set은 직렬화가 필요하므로 배열로 변환
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name);
          if (!str) return null;
          const parsed = JSON.parse(str);
          return {
            ...parsed,
            state: {
              ...parsed.state,
              favorites: new Set(parsed.state.favorites ?? []),
            },
          };
        },
        setItem: (name, value) => {
          const toStore = {
            ...value,
            state: {
              ...value.state,
              favorites: Array.from(value.state.favorites),
            },
          };
          localStorage.setItem(name, JSON.stringify(toStore));
        },
        removeItem: (name) => localStorage.removeItem(name),
      },
    }
  )
);
