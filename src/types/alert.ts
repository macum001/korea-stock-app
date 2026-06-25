// jp: 종목 알림 조건 타입

export type StockAlertType =
  | 'price_above'          // jp: 목표가 이상
  | 'price_below'          // jp: 목표가 이하
  | 'change_rate_above'    // jp: 전일 대비 +N% 이상
  | 'change_rate_below'    // jp: 전일 대비 -N% 이상
  | 'volume_spike'         // jp: 평균 거래량 대비 N배
  | 'disclosure_all'       // jp: 모든 공시
  | 'disclosure_important' // jp: 중요 공시만
  | 'disclosure_keyword';  // jp: 특정 키워드 공시

// jp: 종목별 알림 조건
export interface StockAlertCondition {
  id:               string;
  stockCode:        string;
  stockName:        string;
  type:             StockAlertType;
  value?:           number;   // jp: 가격/등락률/배율 기준값
  keyword?:         string;   // jp: 키워드 알림용
  isEnabled:        boolean;
  cooldownMinutes:  number;   // jp: 재알림 쿨다운 (기본 10분)
  lastTriggeredAt?: number;   // jp: 마지막 발생 시각
  createdAt:        number;
  updatedAt:        number;
}

// jp: 알림 타입별 한글 라벨 + 단위
export const ALERT_TYPE_CONFIG: Record<StockAlertType, { label: string; unit: string; needsValue: boolean; needsKeyword: boolean }> = {
  price_above:          { label: '목표가 이상',        unit: '원', needsValue: true,  needsKeyword: false },
  price_below:          { label: '목표가 이하',        unit: '원', needsValue: true,  needsKeyword: false },
  change_rate_above:    { label: '상승률 이상',        unit: '%',  needsValue: true,  needsKeyword: false },
  change_rate_below:    { label: '하락률 이상',        unit: '%',  needsValue: true,  needsKeyword: false },
  volume_spike:         { label: '거래량 급증',        unit: '배', needsValue: true,  needsKeyword: false },
  disclosure_all:       { label: '모든 공시',          unit: '',   needsValue: false, needsKeyword: false },
  disclosure_important: { label: '중요 공시만',        unit: '',   needsValue: false, needsKeyword: false },
  disclosure_keyword:   { label: '키워드 공시',        unit: '',   needsValue: false, needsKeyword: true  },
};

export const DEFAULT_COOLDOWN_MINUTES = 10;
