// jp: 종목분석 히스토리 펼침 카드
// jp: RecentAnalysis에서 kind='stock' 항목 클릭 시 표시
// jp: StockAnalysisResult 구조 렌더 + 공시 클릭 시 onOpenDisclosure 호출

import { TrendingUp, TrendingDown, FileText } from 'lucide-react';

interface StockHistoryResult {
  stockCode?: string;
  stockName?: string;
  price?: {
    current: number;
    change: number;
    changeRate: number;
  } | null;
  recentDisclosures?: Array<{
    receiptNo: string;
    reportName: string;
    category: string;
    disclosedAt: string;
  }>;
  analysis?: {
    summary?: string;
    detail?: string;
    recentMoves?: string;
    notes?: string[];
  };
}

interface Props {
  result: StockHistoryResult;
  onOpenDisclosure?: (receiptNo: string, stockCode: string, stockName?: string) => void;
}

export function StockHistoryCard({ result, onOpenDisclosure }: Props) {
  if (!result || !result.analysis) {
    return (
      <div className="p-4 rounded-2xl text-sm" style={{ background: 'var(--bg-elevated)', color: 'var(--text-tertiary)' }}>
        분석 결과를 불러올 수 없어요. 다시 분석해주세요.
      </div>
    );
  }

  const { stockCode = '', stockName = '', price, recentDisclosures = [], analysis } = result;
  const up = price ? price.change > 0 : false;
  const down = price ? price.change < 0 : false;
  const priceColor = up ? 'var(--rise)' : down ? 'var(--fall)' : 'var(--text-tertiary)';

  return (
    <div className="rounded-[16px] p-4" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
      {/* 종목명 + 가격 */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-[15px] font-bold" style={{ color: 'var(--text-primary)' }}>{stockName}</p>
          <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{stockCode}</p>
        </div>
        {price && (
          <div className="text-right">
            <p className="text-[15px] font-bold tabular-nums" style={{ color: priceColor }}>
              {price.current.toLocaleString()}원
            </p>
            <p className="text-[12px] flex items-center justify-end gap-0.5" style={{ color: priceColor }}>
              {up ? <TrendingUp size={12} /> : down ? <TrendingDown size={12} /> : null}
              {price.change >= 0 ? '+' : ''}{price.change.toLocaleString()} ({price.changeRate >= 0 ? '+' : ''}{price.changeRate}%)
            </p>
          </div>
        )}
      </div>

      {/* 요약 */}
      {analysis.summary && (
        <div className="rounded-xl p-3 mb-3" style={{ background: 'rgba(127,119,221,0.12)', border: '1px solid rgba(127,119,221,0.25)' }}>
          <p className="text-[13px] leading-[1.6]" style={{ color: 'var(--text-primary)' }}>{analysis.summary}</p>
        </div>
      )}

      {/* 상세 */}
      {analysis.detail && (
        <p className="text-[12px] leading-[1.6] mb-3" style={{ color: 'var(--text-secondary)' }}>{analysis.detail}</p>
      )}

      {/* 최근 흐름 */}
      {analysis.recentMoves && (
        <div className="rounded-xl p-3 mb-3" style={{ background: 'var(--bg-secondary)' }}>
          <p className="text-[11px] mb-1.5" style={{ color: 'var(--text-primary)' }}>최근 공시 흐름</p>
          <p className="text-[11px] leading-[1.5]" style={{ color: 'var(--text-secondary)' }}>{analysis.recentMoves}</p>
        </div>
      )}

      {/* 노트 */}
      {analysis.notes && analysis.notes.length > 0 && (
        <div className="mb-3">
          {analysis.notes.map((note, i) => (
            <div key={i} className="flex gap-2 items-start mb-1.5">
              <span className="w-1 h-1 rounded-full mt-2 flex-shrink-0" style={{ background: 'var(--text-tertiary)' }} />
              <p className="text-[11px] leading-[1.5]" style={{ color: 'var(--text-secondary)' }}>{note}</p>
            </div>
          ))}
        </div>
      )}

      {/* 최근 공시 목록 - 클릭 시 AI분석 시트 */}
      {recentDisclosures.length > 0 && (
        <div className="rounded-xl p-3" style={{ background: 'var(--bg-secondary)' }}>
          <p className="text-[11px] flex items-center gap-1.5 mb-2" style={{ color: 'var(--text-primary)' }}>
            <FileText size={13} /> 최근 공시 {recentDisclosures.length}건
          </p>
          {recentDisclosures.slice(0, 5).map((d) => (
            <button
              key={d.receiptNo}
              className="w-full flex items-center justify-between py-1.5 text-left active:opacity-70"
              style={{ borderTop: '1px solid var(--border-subtle)', cursor: onOpenDisclosure ? 'pointer' : 'default' }}
              onClick={() => onOpenDisclosure?.(d.receiptNo, stockCode, stockName)}
            >
              <p className="text-[11px] truncate flex-1 mr-2" style={{ color: onOpenDisclosure ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                {d.reportName}
              </p>
              <p className="text-[10px] flex-shrink-0" style={{ color: 'var(--text-tertiary)' }}>
                {new Date(d.disclosedAt).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
