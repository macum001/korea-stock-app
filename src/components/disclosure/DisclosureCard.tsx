// jp: 공시 카드 컴포넌트
// jp: ★ 카테고리 한글 칩 추가 (자본조달/호재/악재/중요)

import { Disclosure } from '@/types/disclosure';
import { formatRelativeTime, formatDisclosureDateTime, getDisclosureFreshness } from '@/utils/format';
import { ImportantDisclosureBadge } from './ImportantDisclosureBadge';
import { ExternalLink, Sparkles } from 'lucide-react';

interface DisclosureCardProps {
  disclosure: Disclosure;
  onClick: (disclosure: Disclosure) => void;
  showStock?: boolean;
}

// jp: 카테고리 영문 → 한글
const CATEGORY_LABEL: Record<string, string> = {
  capital: '자본조달', good: '호재', bad: '악재', important: '중요',
};

export function DisclosureCard({ disclosure, onClick, showStock = false }: DisclosureCardProps) {
  const isImportant = disclosure.importance !== 'normal';
  const freshness = getDisclosureFreshness(disclosure.disclosedAt);
  // jp: 왼쪽 컬러바 색 (호재 초록 / 악재·주의 빨강 / 중립 회색)
  const barColor =
    disclosure.sentiment === 'positive' ? 'var(--rise)' :
    disclosure.sentiment === 'negative' ? 'var(--fall)' :
    disclosure.sentiment === 'caution' ? '#FBBF24' :
    '#7F77DD';

  // jp: 카테고리 한글 (general 이면 표시 안 함)
  const catLabel = disclosure.category && disclosure.category !== 'general'
    ? (CATEGORY_LABEL[disclosure.category] ?? disclosure.category)
    : '';

  return (
    <button
      onClick={() => onClick(disclosure)}
      className="w-full text-left p-4 rounded-2xl transition-all active:scale-[0.99]"
      style={{
        backgroundColor: isImportant ? (
          disclosure.sentiment === 'positive' ? 'var(--rise-bg)' :
          disclosure.sentiment === 'negative' ? 'var(--fall-bg)' :
          'var(--bg-card)'
        ) : 'var(--bg-card)',
        border: `1px solid ${isImportant ? (
          disclosure.sentiment === 'positive' ? 'var(--rise-subtle)' :
          disclosure.sentiment === 'negative' ? 'var(--fall-subtle)' :
          'var(--border)'
        ) : 'var(--border)'}`,
        borderLeft: `3px solid ${barColor}`,
      }}
    >
      {/* jp: 배지 & 시간 */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          {/* jp: 속보(5분)/NEW(30분) 배지 */}
          {freshness === 'breaking' && (
            <span className="text-[9px] font-black px-1.5 py-0.5 rounded"
              style={{ background: 'var(--fall)', color: '#fff' }}>속보</span>
          )}
          {freshness === 'new' && (
            <span className="text-[9px] font-black px-1.5 py-0.5 rounded"
              style={{ background: 'var(--accent)', color: '#fff' }}>NEW</span>
          )}
          <ImportantDisclosureBadge
            importance={disclosure.importance}
            sentiment={disclosure.sentiment}
          />
        </div>
        {/* jp: 상대 시간 */}
        <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
          {formatRelativeTime(disclosure.disclosedAt)}
        </span>
      </div>

      {/* jp: 종목명 (전체 공시 화면에서 표시) */}
      {showStock && (
        <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
          {disclosure.stockName}
        </p>
      )}

      {/* jp: 공시 제목 */}
      <p className="text-sm font-semibold leading-snug mb-1.5" style={{ color: 'var(--text-primary)' }}>
        {disclosure.reportName}
      </p>

      {/* jp: 공시 일시 - 년-월-일 시:분 */}
      <p className="text-[10px] mb-1.5" style={{ color: 'var(--text-tertiary)' }}>
        {formatDisclosureDateTime(disclosure.disclosedAt)}
      </p>

      {/* jp: 요약 미리보기 */}
      <p
        className="text-xs leading-relaxed line-clamp-2"
        style={{ color: 'var(--text-secondary)' }}
      >
        {disclosure.summary}
      </p>

      {/* jp: 카테고리(한글) + 공시 유형 */}
      <div className="flex items-center gap-2 mt-2">
        {catLabel && (
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{ background: 'rgba(127,119,221,0.18)', color: '#A78BFA' }}
          >
            {catLabel}
          </span>
        )}
        <span
          className="text-[10px] px-2 py-0.5 rounded-full"
          style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-tertiary)' }}
        >
          {disclosure.disclosureType}
        </span>
        <ExternalLink size={10} style={{ color: 'var(--text-tertiary)' }} />
        <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>원문 보기</span>
      </div>
      {/* jp: AI 분석 보기 (중요 공시만) */}
      {isImportant && (
        <div className="flex items-center gap-1.5 mt-2.5 pt-2.5" style={{ borderTop: '1px solid var(--border)' }}>
          <Sparkles size={12} style={{ color: '#A78BFA' }} />
          <span className="text-[11px] font-semibold" style={{ color: '#A78BFA' }}>AI 분석 보기</span>
        </div>
      )}
    </button>
  );
}
