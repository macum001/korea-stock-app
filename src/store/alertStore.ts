// jp: 종목 알림 조건 스토어 - 백엔드 DB 연동 버전
// jp: 변경: localStorage → 백엔드 API (stock_alert_conditions 테이블)
// jp: 낙관적 업데이트(optimistic): UI 즉시 반영 후 백엔드 동기화

import { create } from 'zustand';
import { StockAlertCondition, StockAlertType, DEFAULT_COOLDOWN_MINUTES } from '@/types/alert';
import { alertService } from '@/services/alertService';

interface AlertStore {
  conditions: StockAlertCondition[];
  loaded: boolean;

  // jp: 백엔드에서 전체 조건 로드 (앱 시작 / 알림 시트 열 때)
  loadConditions: () => Promise<void>;

  // jp: 조건 CRUD (백엔드 동기화 포함)
  createCondition: (input: {
    stockCode: string; stockName: string; type: StockAlertType;
    value?: number; keyword?: string; cooldownMinutes?: number;
  }) => string;
  deleteCondition: (id: string) => void;
  toggleCondition: (id: string) => void;
  markTriggered: (id: string, triggeredAt: number) => void;

  // jp: 조회 (메모리 캐시 기반 - 동기)
  getConditionsByStock: (stockCode: string) => StockAlertCondition[];
}

export const useAlertStore = create<AlertStore>()((set, get) => ({
  conditions: [],
  loaded: false,

  // jp: 백엔드에서 조건 로드
  loadConditions: async () => {
    const data = await alertService.getAll();
    set({ conditions: data, loaded: true });
  },

  // jp: 생성 - 낙관적 업데이트 후 백엔드 저장
  createCondition: (input) => {
    const id = `alert-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const now = Date.now();
    const condition: StockAlertCondition = {
      id,
      stockCode:       input.stockCode,
      stockName:       input.stockName,
      type:            input.type,
      value:           input.value,
      keyword:         input.keyword,
      isEnabled:       true,
      cooldownMinutes: input.cooldownMinutes ?? DEFAULT_COOLDOWN_MINUTES,
      createdAt:       now,
      updatedAt:       now,
    };

    // jp: 1. UI 즉시 반영
    set(state => ({ conditions: [...state.conditions, condition] }));

    // jp: 2. 백엔드 저장 (실패 시 롤백)
    void alertService.create({
      id,
      stockCode: input.stockCode,
      stockName: input.stockName,
      type: input.type,
      value: input.value,
      keyword: input.keyword,
      cooldownMinutes: input.cooldownMinutes ?? DEFAULT_COOLDOWN_MINUTES,
    }).then(ok => {
      if (!ok) {
        // jp: 저장 실패 → 롤백
        set(state => ({ conditions: state.conditions.filter(c => c.id !== id) }));
        console.error('[Alert] 백엔드 저장 실패 - 조건 롤백');
      }
    });

    return id;
  },

  // jp: 삭제 - 낙관적 업데이트
  deleteCondition: (id) => {
    const prev = get().conditions;
    set(state => ({ conditions: state.conditions.filter(c => c.id !== id) }));

    void alertService.remove(id).then(ok => {
      if (!ok) {
        // jp: 삭제 실패 → 롤백
        set({ conditions: prev });
        console.error('[Alert] 백엔드 삭제 실패 - 복원');
      }
    });
  },

  // jp: 토글 - 낙관적 업데이트
  toggleCondition: (id) => {
    set(state => ({
      conditions: state.conditions.map(c =>
        c.id === id ? { ...c, isEnabled: !c.isEnabled, updatedAt: Date.now() } : c
      ),
    }));

    void alertService.toggle(id).then(ok => {
      if (!ok) {
        // jp: 실패 → 다시 토글 (원복)
        set(state => ({
          conditions: state.conditions.map(c =>
            c.id === id ? { ...c, isEnabled: !c.isEnabled } : c
          ),
        }));
        console.error('[Alert] 백엔드 토글 실패 - 원복');
      }
    });
  },

  // jp: 알림 발생 시 마지막 발생시각 저장 - cooldown 판단용
  markTriggered: (id, triggeredAt) => {
    set(state => ({
      conditions: state.conditions.map(c =>
        c.id === id ? { ...c, lastTriggeredAt: triggeredAt, updatedAt: triggeredAt } : c
      ),
    }));
    void alertService.updateLastTriggered?.(id, triggeredAt);
  },

  // jp: 종목별 조회 (메모리)
  getConditionsByStock: (stockCode) =>
    get().conditions.filter(c => c.stockCode === stockCode),
}));
