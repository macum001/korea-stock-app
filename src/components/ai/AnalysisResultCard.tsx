// jp: AI 분석 결과 카드 - 섹션별 분리 표시 (한 줄 요약/분류/이유/영향/주의점)
// jp: 설계 7번 답변 구조를 카드형으로. 뉴스/데이터 소스 없어 "준비 중"
// jp: ★ 히스토리 복원 시 일부 필드(risks 등)가 없을 수 있어 옵셔널 안전처리

import { FileText, Tag, TrendingUp, AlertTriangle, Lightbulb, ExternalLink, Newspaper } from 'lucide-react';
import { AiAnalysisResult } from '@/services/aiService';

interface Props {
  result: AiAnalysisResult;
}

// jp: 분류 색상
const CATEGORY_COLOR: Record<string, string> = {
  capital:   '#8b5cf6',  // 자본조달 보라
  good:      '#10b981',  // 호재 초록
  bad:       '#ff5252',  // 악재 빨강
  important: '#f59e0b',  // 중요 주황
  general:   '#9898a8',  // 일반 회색
};

// jp: 영향 색상
const IMPACT_COLOR: Record<string, string> = {
  positive: '#10b981',
  negative: '#ff5252',
  neutral:  '#f59e0b',
  unknown:  '#9898a8',
};

export function AnalysisResultCard({ result }: Props) {
  // jp: result 자체가 없거나 analysis가 없으면 안전하게 빈 처리 (옛 히스토리 방어)
  if (!result || !result.analysis) {
    return (
      <div className="p-4 rounded-2xl text-sm" style={{ background: 'var(--bg-elevated)', color: 'var(--text-tertiary)' }}>
        분석 내용을 불러올 수 없어요. 다시 분석해주세요.
      </div>
    );
  }

  const { analysis, stockName, reportName, originalUrl } = result;
  const catColor = CATEGORY_COLOR[analysis.category] ?? CATEGORY_COLOR.general;
  const impColor = IMPACT_COLOR[analysis.impact] ?? IMPACT_COLOR.unknown;
  // jp: risks가 undefined/null일 수 있으니 항상 배열로 보정
  const risks = Array.isArray(analysis.risks) ? analysis.risks : [];

  return (
    <div className="space-y-2.5">
      {/* jp: 종목/공시 헤더 */}
      <div className="flex items-center gap-2 px-1">
        <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{stockName}</span>
        <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{reportName}</span>
      </div>

      {/* jp: 한 줄 요약 */}
      {analysis.summary && (
        <Card icon={FileText} iconColor="var(--accent)" title="한 줄 요약">
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-primary)' }}>
            {analysis.summary}
          </p>
        </Card>
      )}

      {/* jp: 공시 분류 + 예상 영향 (한 줄에 배지 2개) */}
      <div className="flex gap-2.5">
        <div className="flex-1 p-3.5 rounded-2xl" style={{ background: 'var(--bg-elevated)' }}>
          <div className="flex items-center gap-1.5 mb-2">
            <Tag size={13} style={{ color: 'var(--text-tertiary)' }} />
            <span className="text-[11px] font-semibold" style={{ color: 'var(--text-tertiary)' }}>공시 분류</span>
          </div>
          <span className="inline-block px-2.5 py-1 rounded-lg text-xs font-bold"
            style={{ background: `${catColor}22`, color: catColor }}>
            {analysis.categoryLabel ?? '분류 없음'}
          </span>
        </div>
        <div className="flex-1 p-3.5 rounded-2xl" style={{ background: 'var(--bg-elevated)' }}>
          <div className="flex items-center gap-1.5 mb-2">
            <TrendingUp size={13} style={{ color: 'var(--text-tertiary)' }} />
            <span className="text-[11px] font-semibold" style={{ color: 'var(--text-tertiary)' }}>예상 영향</span>
          </div>
          <span className="inline-block px-2.5 py-1 rounded-lg text-xs font-bold"
            style={{ background: `${impColor}22`, color: impColor }}>
            {analysis.impactLabel ?? '미정'}
          </span>
        </div>
      </div>

      {/* jp: 공시 핵심 내용 */}
      {analysis.detail && (
        <Card icon={FileText} iconColor="#5c8aff" title="공시 핵심 내용">
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {analysis.detail}
          </p>
        </Card>
      )}

      {/* jp: 투자자에게 중요한 이유 */}
      {analysis.reason && (
        <Card icon={Lightbulb} iconColor="#f59e0b" title="투자자에게 중요한 이유">
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {analysis.reason}
          </p>
        </Card>
      )}

      {/* jp: 주의점 (risks가 있을 때만) */}
      {risks.length > 0 && (
        <Card icon={AlertTriangle} iconColor="#ff5252" title="주의점">
          <ul className="space-y-1.5">
            {risks.map((r, i) => (
              <li key={i} className="flex gap-2 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                <span style={{ color: '#ff5252' }}>·</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* jp: 최근 뉴스 - 데이터 소스 없음 (준비 중, 가짜 금지) */}
      <Card icon={Newspaper} iconColor="var(--text-tertiary)" title="최근 뉴스">
        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
          뉴스 연동은 준비 중이에요. 확인되지 않은 뉴스는 표시하지 않아요.
        </p>
      </Card>

      {/* jp: 원문 보기 */}
      {originalUrl && (
        <a href={originalUrl} target="_blank" rel="noopener noreferrer"
          className="flex items-center justify-center gap-1.5 p-3 rounded-2xl text-sm font-semibold active:opacity-70"
          style={{ background: 'var(--bg-elevated)', color: 'var(--accent)' }}>
          <ExternalLink size={15} />
          DART 원문 보기
        </a>
      )}

      {/* jp: 면책 */}
      <p className="text-[10px] text-center leading-relaxed px-2" style={{ color: 'var(--text-tertiary)' }}>
        AI 분석은 공시 데이터 기반 참고용이며 투자 권유가 아니에요.
      </p>
    </div>
  );
}

function Card({ icon: Icon, iconColor, title, children }: {
  icon: typeof FileText; iconColor: string; title: string; children: React.ReactNode;
}) {
  return (
    <div className="p-3.5 rounded-2xl" style={{ background: 'var(--bg-elevated)' }}>
      <div className="flex items-center gap-1.5 mb-2">
        <Icon size={14} style={{ color: iconColor }} />
        <span className="text-xs font-bold" style={{ color: 'var(--text-tertiary)' }}>{title}</span>
      </div>
      {children}
    </div>
  );
}
