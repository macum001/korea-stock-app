// jp: AI 분석 서비스 - 백엔드 /api/ai 연결
// jp: 공시분석 + 종목분석 + 히스토리(목록/삭제)
import { apiClient } from './apiClient';

export interface AiAnalysis {
  summary: string;
  detail: string;
  category: string;
  categoryLabel: string;
  reason: string;
  impact: string;
  impactLabel: string;
  risks: string[];
}

export interface AiAnalysisResult {
  receiptNo: string;
  stockCode: string;
  stockName: string;
  reportName: string;
  originalUrl: string;
  disclosedAt: string;
  analysis: AiAnalysis;
  cached?: boolean;
}

// jp: ===== 종목분석 결과 타입 =====
export interface StockAnalysisResult {
  stockCode: string;
  stockName: string;
  price: {
    current: number;
    change: number;
    changeRate: number;
  } | null;
  recentDisclosures: Array<{
    receiptNo: string;
    reportName: string;
    category: string;
    disclosedAt: string;
  }>;
  financials?: {
    revenue: string;
    operatingProfit: string;
    netIncome: string;
    year: number | null;
    reportName: string;
    basis: string;
  } | null;
  analysis: {
    companyInfo?: string;
    summary: string;
    detail: string;
    recentMoves: string;
    impact: string;
    impactLabel: string;
    notes: string[];
    cautions?: string[];
    watchPoints?: string[];
  };
  cached?: boolean;
}

export interface AiHistoryItem {
  id: string;
  kind: string;            // 'receipt'(공시) | 'stock'(종목)
  question: string;
  receiptNo: string | null;
  stockCode: string | null;
  stockName: string | null;
  // jp: kind에 따라 answer 타입이 달라짐 (공시=AiAnalysisResult, 종목=StockAnalysisResult)
  answer: AiAnalysisResult & Partial<StockAnalysisResult>;
  createdAt: string;
}

export const aiService = {
  // jp: 공시 접수번호 분석 (자동으로 히스토리 저장됨 - 백엔드)
  async analyzeReceiptNo(receiptNo: string): Promise<AiAnalysisResult> {
    return apiClient.post<AiAnalysisResult>('/api/ai/disclosure-analysis', {
      receiptNo: receiptNo.trim(),
    });
  },
  // jp: 종목 분석 (종목명/코드 입력 또는 최근 공시 + 현재가 분석)
  async analyzeStock(query: string): Promise<StockAnalysisResult> {
    return apiClient.post<StockAnalysisResult>('/api/ai/stock-analysis', {
      query: query.trim(),
    });
  },
  // jp: 히스토리 목록 (최근 30~90개). kind로 필터 (receipt/stock)
  async getHistory(kind?: 'receipt' | 'stock'): Promise<AiHistoryItem[]> {
    const all = await apiClient.get<AiHistoryItem[]>('/api/ai/history');
    if (!kind) return all;
    return all.filter((h) => h.kind === kind);
  },
  // jp: 히스토리 단건 삭제
  async deleteHistory(id: string): Promise<void> {
    await apiClient.delete(`/api/ai/history/${id}`);
  },
  // jp: 히스토리 전체 삭제
  async clearHistory(): Promise<void> {
    await apiClient.delete('/api/ai/history');
  },
};

// jp: ===== 네이버 뉴스 =====
export interface StockNewsItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  source: string;
}

export const newsService = {
  // jp: 종목명으로 최근 뉴스 가져오기
  async getStockNews(query: string): Promise<StockNewsItem[]> {
    try {
      const res = await apiClient.get<{ items: StockNewsItem[] }>(`/api/news/${encodeURIComponent(query.trim())}`);
      return res?.items ?? [];
    } catch {
      return [];
    }
  },
};
