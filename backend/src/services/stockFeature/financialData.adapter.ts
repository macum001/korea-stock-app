// jp: 재무 데이터 adapter - 실제 데이터 소스 연결 지점
// jp: 현재는 재무제표 API/DB가 없으므로 null 반환 → Quality/Value 점수는 '데이터 준비 중'
// jp: 키/소스를 .env에 넣고 fetchFromSource를 구현하면 바로 작동

import { FinancialData } from './featureTypes';
import { ENV } from '../../config/env';

// jp: 재무 데이터 소스 설정 여부 (예: FnGuide/DART 재무 API 키)
function hasFinancialSource(): boolean {
  // jp: 추후 ENV.FINANCIAL_API_KEY 등으로 교체
  return process.env.FINANCIAL_API_KEY != null && process.env.FINANCIAL_API_KEY !== '';
}

// jp: 종목별 재무 데이터 조회 (소스 없으면 null = 가짜 점수 금지)
export async function getFinancialData(stockCode: string): Promise<FinancialData | null> {
  if (!hasFinancialSource()) {
    // jp: 데이터 소스 미설정 → null
    return null;
  }

  // jp: TODO: 실제 재무 API 연결 위치
  // jp: 예) const res = await fetch(`...${stockCode}...`, { headers: { key: ENV.FINANCIAL_API_KEY }});
  // jp: return normalizeFinancial(res);
  void stockCode;
  void ENV;
  return null;
}
