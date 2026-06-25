// jp: 시황 브리핑 타입

export interface BriefingDataItem {
  key: string;
  name: string;
  category: string;
  unit?: string;
  price: number;
  prevClose: number;
  change: number;
  changeRate: number;
  changeRateStr: string;
  fetchedAt: string;
}

export interface BriefingRawData {
  items: BriefingDataItem[];
  fetchedCount: number;
  totalCount: number;
  fetchedAt: string;
}

export interface BriefingAnalysis {
  status: '좋음' | '보통' | '나쁨';
  summary: string;
  why: string;
  korea_impact: string;
  strong_area: string;
  caution: string;
  conclusion: string;
  is_important: boolean;
}

export interface MarketBriefing {
  id: number;
  date: string;
  slot: string;
  raw_data: BriefingRawData;
  summary: string | null;
  analysis: BriefingAnalysis | null;
  ai_model: string | null;
  ai_tokens: number | null;
  status: 'collecting' | 'collected' | 'completed' | 'failed';
  error_message: string | null;
  collected_at: string | null;
  analyzed_at: string | null;
  created_at: string;
  updated_at: string;
  locked?: boolean;   // jp: 비회원 응답 표시 플래그
  relevantStats?: RelevantStat[];  // jp: 현재 브리핑 관련 통계 (C방식)
}

export interface RelevantStat {
  key: string;
  label: string;
  message: string;
}
