// jp: 공시 상세 시트 - 전체 화면 버전. 핵심 변경사항:
// jp:   ① AI 스트리밍 분석(원문 기반) ② 공시 영향 통계 주가 영향 데이터 함께 표시
// jp: AI 분석 완료 후 탭으로 이동해서 분석. '뒤로가기 버튼' 없애지 말 것.
// jp: ② 회원전용 AI 분석 기록(로그인여부) / ③자본금변동 뒤로가기버튼 / 이동하기 탭버튼 / 연관기사 분리작업(default-user 적용후 정책으로 분리할것)
// jp: v2: 타법인출자현황·최대주주·주식의총수·배당이력·소액주주 아코디언 → 시각적 카드로 교체
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Disclosure } from '@/types/disclosure';
import { apiClient } from '@/services/apiClient';
import { ImportantDisclosureBadge } from './ImportantDisclosureBadge';
import { NotesSearchSection } from './NotesSearchSection';
import { DisclosureImpactStat } from './DisclosureImpactStat';
import { formatRelativeTime } from '@/utils/format';
import { useAuthStore } from '@/store/authStore';
import { AuthModal } from '@/components/auth/AuthModal';
import { ChevronLeft, ExternalLink, Sparkles, TrendingUp, Loader2, FileText, TrendingDown, Minus, ChevronDown, Users, PieChart, Coins, Building2, ShieldAlert, AlertTriangle } from 'lucide-react';
import { DisclosureBadges, DetailUnavailableBox } from './DisclosureBadges';
import { getDisclosureClassification } from '@/utils/disclosureClassify';

interface DisclosureSummarySheetProps {
  disclosure: Disclosure | null;
  isOpen: boolean;
  onClose: () => void;
}

interface AiResultRaw {
  summary?: string; ai_summary?: string;
  keyPoints?: string[]; ai_key_points?: string[];
  investorNote?: string; ai_investor_note?: string;
  riskNote?: string; ai_risk_note?: string;
  impactLevel?: string; impact_level?: string;
  status?: string; ai_status?: string;
}

// jp: 자본금 변동사항 타입
interface CapitalChangeItem {
  date: string;
  type: string;
  stockKind: string;
  quantity: string;
  issuePrice: string;
  direction: 'up' | 'down' | 'neutral';
}

// jp: ===== 사업보고서 5개 데이터 타입 =====
interface InvestmentItem { corpName: string; purpose: string; amount: string; quantity: string; ratio: string; }
interface ShareholderItem { name: string; relate: string; stockKind: string; quantity: string; ratio: string; }
interface StockTotalItem { kind: string; issuedTotal: string; treasury: string; distributed: string; }
interface DividendItem { label: string; thisYear: string; prevYear: string; prev2Year: string; }
interface MinorityItem { label: string; shareholders: string; quantity: string; ratio: string; }

// jp: ===== 재무 3종 / 감사의견 / 미상환사채 타입 =====
interface FinancialTriple { revenue: string; operatingProfit: string; netIncome: string; }
interface FinancialsResult {
  consolidated: FinancialTriple | null;
  separate: FinancialTriple | null;
  year: number | null;
  reportName: string;
}
interface AuditOpinionResult { opinion: string; auditor: string; emphasis: string; year: number | null; }
interface CreditRatingResult { grade: string; agency: string; raw: string; issueDate: string; }
interface UnredeemedBondItem { type: string; category: string; total: string; within1y: string; }
interface BondDetailItem {
  type: string; round: string; kind: string; amount: string;
  issueDate: string; maturityDate: string; conversionPrice: string;
  refixFloor: string; convertStart: string; convertEnd: string;
  surfRate: string; matRate: string;
}

// jp: 재무위험·감사의견 표시
interface FinRiskSignal { level: 'red' | 'yellow' | 'green'; text: string; }
interface FinancialRisk {
  year: number | null;
  overallLevel: 'red' | 'yellow' | 'green' | 'unknown';
  signals: FinRiskSignal[];
  impairmentRate?: number | null;
  debtRatio?: number | null;
}

// jp: 섹션 출처 메타 — fallback으로 과거 보고서에서 보충했는지
interface SectionMeta {
  sourceYear: number | null;
  sourceReprtCode: string | null;
  isFallback: boolean;
}

interface ReportInfoState {
  investments: InvestmentItem[];
  majorShareholders: ShareholderItem[];
  stockTotal: StockTotalItem[];
  dividends: DividendItem[];
  minority: MinorityItem[];
  bonds: UnredeemedBondItem[];
  bondDetails: BondDetailItem[];
  creditRating: CreditRatingResult | null;
  financials: FinancialsResult | null;
  auditOpinion: AuditOpinionResult | null;
  loading: boolean;
  // jp: 섹션별 출처 메타 (백엔드 sectionMeta)
  sectionMeta?: Record<string, SectionMeta | null>;
}

// jp: 보고서코드 → 한글 라벨
const REPRT_LABEL: Record<string, string> = {
  '11011': '사업보고서', '11012': '반기보고서', '11013': '1분기보고서', '11014': '3분기보고서',
};

// jp: fallback 섹션 배지 텍스트 — "2024년 사업보고서 기준"
function fallbackBadgeText(meta: SectionMeta | null | undefined): string | null {
  if (!meta || !meta.isFallback || !meta.sourceYear) return null;
  const reportLabel = meta.sourceReprtCode ? REPRT_LABEL[meta.sourceReprtCode] || '보고서' : '보고서';
  return `${meta.sourceYear}년 ${reportLabel} 기준`;
}

// jp: 합계/계(소계) 행 판단
function isSummaryRow(label: string): boolean {
  const s = (label || '').replace(/\s/g, '');
  return s === '소계' || s === '계' || s === '합계' || s === '합 계' || s === '소 계';
}
// jp: 공백·줄바꿈 정리
function clean(s: string): string {
  return (s || '').replace(/\s*\n\s*/g, ' ').trim();
}

// jp: 원 단위 문자열 → 억/조 단위 축약 (예: "166650465839" → "1,666억")
function formatKRW(raw: string): string {
  const neg = /^-/.test(raw);
  const digits = (raw || '').replace(/[^0-9]/g, '');
  if (!digits) return raw || '-';
  const won = parseInt(digits, 10);
  if (!Number.isFinite(won)) return raw;
  const eok = won / 1e8;
  let out: string;
  if (eok >= 10000) {
    const jo = Math.floor(eok / 10000);
    const rem = Math.round(eok % 10000);
    out = rem > 0 ? `${jo.toLocaleString()}조 ${rem.toLocaleString()}억` : `${jo.toLocaleString()}조`;
  } else if (eok >= 1) {
    out = `${Math.round(eok).toLocaleString()}억`;
  } else {
    const man = Math.round(won / 1e4);
    out = `${man.toLocaleString()}만`;
  }
  return (neg ? '-' : '') + out;
}

// jp: extras 금액 정제 - 백만원/억/조 단위 인식 + 억 소수점1자리 + 조 유지 + 괄호병기 제거
function cleanAmount(raw: string): string {
  if (!raw || typeof raw !== 'string') return raw || '-';
  const s = raw.trim();
  if (/원문|없음|미공시|해당없음|N\/A/i.test(s)) return s;
  const main = s.replace(/\s*\(.*?\)\s*/g, '').trim();
  const neg = /^-/.test(main) || /△/.test(main);
  const numMatch = main.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  if (!numMatch) return s;
  const num = Math.abs(parseFloat(numMatch[0]));
  if (!Number.isFinite(num)) return s;
  let won: number;
  if (/조/.test(main)) {
    const joM = main.replace(/,/g, '').match(/(\d+(?:\.\d+)?)\s*조/);
    const eokM = main.replace(/,/g, '').match(/조\s*(\d+(?:\.\d+)?)\s*억/);
    const jo = joM ? parseFloat(joM[1]) : 0;
    const eok2 = eokM ? parseFloat(eokM[1]) : 0;
    won = (jo * 1e12) + (eok2 * 1e8);
  } else if (/백억/.test(main)) { won = num * 1e10;
  } else if (/억/.test(main)) { won = num * 1e8;
  } else if (/백만원|백만/.test(main)) { won = num * 1e6;
  } else if (/천만/.test(main)) { won = num * 1e7;
  } else if (/만원|만/.test(main)) { won = num * 1e4;
  } else { won = num; }
  const eok = won / 1e8;
  let out: string;
  if (eok >= 10000) {
    const jo = Math.floor(eok / 10000);
    const rem = eok % 10000;
    out = rem >= 0.05
      ? `${jo.toLocaleString()}조 ${rem.toLocaleString(undefined, { maximumFractionDigits: 0 })}억`
      : `${jo.toLocaleString()}조`;
  } else if (eok >= 1) {
    out = `${eok.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}억`;
  } else {
    const man = Math.round(won / 1e4);
    out = `${man.toLocaleString()}만`;
  }
  return (neg ? '-' : '') + out;
}

// jp: 긴 단락을 약 70자마다 끊되, 숫자 콤마(10,000)는 보호
function splitLong(para: string, maxLen: number): string[] {
  if (para.length <= maxLen) return [para];
  const out: string[] = [];
  let buf = '';
  const tokens = para.split(/(?<=,)(?=\s*[가-힣])|(?<=며 )|(?<=고 )|(?<=하여 )|(?<=으로 )|(?<=함 )/);
  for (const tk of tokens) {
    if ((buf + tk).length > maxLen && buf.length > 0) {
      out.push(buf.trim());
      buf = tk;
    } else {
      buf += tk;
    }
  }
  if (buf.trim()) out.push(buf.trim());
  return out.length > 0 ? out : [para];
}

// jp: 본문을 문장/항목 단락으로 분리 + 긴 문장은 약 70자마다 끊기 (숫자 보호)
function splitParagraphs(text: string): string[] {
  if (!text || typeof text !== 'string') return [];
  const s = text.trim();
  if (!s) return [];
  let paras: string[] | null = null;
  if (/(?:^|\s)\d+\.\s/.test(s)) {
    const parts = s.split(/(?=\d+\.\s)/).map((x) => x.trim()).filter(Boolean);
    paras = parts.length > 1 ? parts : null;
  }
  if (!paras) {
    const protectedText = s.replace(/(\d)\.(\d)/g, '$1\u0001$2');
    const rawParts = protectedText.split(/\.\s+/);
    paras = rawParts
      .map((x, i) => {
        let t = x.replace(/\u0001/g, '.').trim();
        if (!t) return '';
        if (i < rawParts.length - 1 && !/[.!?]$/.test(t)) t += '.';
        return t;
      })
      .filter(Boolean);
  }
  if (paras.length === 0) paras = [s];
  const MAX = 70;
  const final: string[] = [];
  for (const p of paras) {
    if (p.length > MAX) {
      for (const piece of splitLong(p, MAX)) final.push(piece);
    } else {
      final.push(p);
    }
  }
  return final;
}

// jp: 자본금 방향 스타일
function directionStyle(direction: 'up' | 'down' | 'neutral'): { color: string; bg: string } {
  if (direction === 'up')   return { color: '#ffffff', bg: 'rgba(255,255,255,0.04)' };
  if (direction === 'down') return { color: '#ffffff', bg: 'rgba(255,255,255,0.04)' };
  return { color: 'var(--text-secondary)', bg: 'rgba(255,255,255,0.05)' };
}

function normalize(r: AiResultRaw) {
  return {
    summary:      r.summary || r.ai_summary || '',
    keyPoints:    r.keyPoints || r.ai_key_points || [],
    detail:       (r as any).detail || (r as any).ai_detail || '',
    investorNote: r.investorNote || r.ai_investor_note || '',
    riskNote:     r.riskNote || r.ai_risk_note || '',
    impactLevel:  r.impactLevel || r.impact_level || '중립',
    status:       r.status || r.ai_status || 'completed',
    keyNumbers:   (r as any).keyNumbers || (r as any).ai_key_numbers || [],
    timeline:     (r as any).timeline || (r as any).ai_timeline || '',
    auditOpinion: (r as any).auditOpinion || (r as any).ai_audit_opinion || '',
    cashFlow:     (r as any).cashFlow || (r as any).ai_cash_flow || '',
    riskSignals:  (r as any).riskSignals || (r as any).ai_risk_signals || [],
  };
}

function impactStyle(level: string): { bg: string; color: string } {
  if (level.includes('긍정') || level.includes('호재')) return { bg: 'var(--rise-bg)', color: 'var(--rise)' };
  if (level.includes('부정') || level.includes('악재')) return { bg: 'var(--fall-bg)', color: 'var(--fall)' };
  return { bg: 'rgba(255,255,255,0.15)', color: '#ffffff' };
}

function EmptyTab({ text }: { text: string }) {
  return (
    <div className="py-6 flex flex-col items-center gap-2">
      <FileText size={24} style={{ color: 'var(--border)' }} />
      <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{text}</span>
    </div>
  );
}

// ===== 시각적 섹션 공통 헤더 =====
function SectionCard({ icon, title, year, children }: {
  icon: React.ReactNode; title: string; year?: number | null; children: React.ReactNode;
}) {
  return (
    <div className="mt-3 rounded-2xl overflow-hidden" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
      <div className="flex items-center gap-2 px-3.5 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
        <span style={{ color: '#ffffff' }}>{icon}</span>
        <span className="text-[12px] font-bold" style={{ color: 'var(--text-primary)' }}>{title}</span>
        {year && (
          <span className="text-[9px] px-1.5 py-0.5 rounded ml-auto" style={{ background: 'rgba(255,255,255,0.12)', color: 'var(--text-tertiary)' }}>{year}년</span>
        )}
      </div>
      {children}
    </div>
  );
}

// ── 재무 핵심 (매출·영업이익·당기순이익, 연결/개별) ──
function FinancialsVisual({ fin, summary, creditRating, segments, extras }: {
  fin: FinancialsResult;
  summary?: string;
  creditRating?: { grade: string; agency: string } | null;
  segments?: { label: string; pct: number; value: string }[];
  extras?: { label: string; value: string; warn?: boolean }[];
}) {
  const c = fin.consolidated;
  const s = fin.separate;
  if (!c && !s) return null;
  const hasBoth = !!c && !!s;
  const [fsTab, setFsTab] = React.useState<'cfs' | 'ofs'>(c ? 'cfs' : 'ofs');
  const active = fsTab === 'cfs' ? c : s;
  const rows: { label: string; key: keyof FinancialTriple }[] = [
    { label: '매출액', key: 'revenue' },
    { label: '영업이익', key: 'operatingProfit' },
    { label: '당기순이익', key: 'netIncome' },
  ];
  const valColor = (v: string | undefined) => {
    if (!v) return 'var(--text-tertiary)';
    return /^-/.test(v) ? 'var(--fall)' : 'var(--text-primary)';
  };
  let note = '';
  if (c && s) {
    const cNet = parseInt((c.netIncome || '0').replace(/[^0-9-]/g, ''), 10) || 0;
    const sNet = parseInt((s.netIncome || '0').replace(/[^0-9-]/g, ''), 10) || 0;
    if (cNet < 0 && sNet > 0) note = fsTab === 'cfs' ? '연결 적자 — 종속회사 손실이 반영됐어요. 개별 탭에선 흑자예요.' : '개별 흑자 — 본사 기준 이익이에요. 연결 탭에선 종속회사 손실이 반영돼요.';
    else if (cNet > 0 && sNet < 0) note = fsTab === 'cfs' ? '연결 흑자 — 종속회사 이익이 반영됐어요. 개별 탭에선 적자예요.' : '개별 적자 — 본사 기준 손실이에요. 연결 탭에선 흑자예요.';
  }
  const SEG_COLORS = ['#ffffff', '#c0c0c0', '#777777', '#e0e0e0', '#999999'];
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
      <div className="flex items-center gap-2 px-3.5 py-2.5" style={{ borderBottom: '1px solid var(--border)' }}>
        <TrendingUp size={13} style={{ color: '#ffffff' }} />
        <span className="text-[12px] font-extrabold" style={{ color: 'var(--text-primary)' }}>재무 핵심</span>
        {fin.year && <span className="text-[9px] px-1.5 py-0.5 rounded ml-auto" style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--text-tertiary)' }}>{fin.year} {fin.reportName}</span>}
      </div>
      {summary && (
        <div className="mx-3.5 mt-3 mb-2 px-3 py-2.5 rounded-xl" style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.25)' }}>
          <span className="text-[12px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            <span className="font-bold" style={{ color: '#ffffff' }}>핵심</span> · {summary}
          </span>
        </div>
      )}
      {creditRating && creditRating.grade && (
        <div className="mx-3.5 mb-2 px-3 py-2.5 rounded-xl flex items-center gap-2.5" style={{ background: 'var(--accent-bg)', border: '1px solid var(--accent-border)' }}>
          <div className="rounded-lg flex items-center justify-center flex-shrink-0" style={{ width: 38, height: 38, background: 'rgba(255,255,255,0.18)', fontSize: 14, fontWeight: 800, color: '#ffffff' }}>{creditRating.grade}</div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-bold" style={{ color: 'var(--text-primary)' }}>신용등급 {creditRating.grade}</div>
            {creditRating.agency && <div className="text-[9px] truncate" style={{ color: 'var(--text-tertiary)' }}>{creditRating.agency}</div>}
          </div>
        </div>
      )}
      {hasBoth && (
        <div className="mx-3.5 mt-1 mb-2.5 p-[3px] rounded-xl flex gap-[3px]" style={{ background: 'rgba(255,255,255,0.04)' }}>
          <button onClick={() => setFsTab('cfs')} className="flex-1 py-1.5 rounded-lg text-[11px] font-bold active:scale-95 transition-all"
            style={{ background: fsTab === 'cfs' ? '#ffffff' : 'transparent', color: fsTab === 'cfs' ? '#000000' : 'var(--text-tertiary)' }}>연결</button>
          <button onClick={() => setFsTab('ofs')} className="flex-1 py-1.5 rounded-lg text-[11px] font-bold active:scale-95 transition-all"
            style={{ background: fsTab === 'ofs' ? '#ffffff' : 'transparent', color: fsTab === 'ofs' ? '#000000' : 'var(--text-tertiary)' }}>개별</button>
        </div>
      )}
      {active && (
        <div className="grid gap-1.5 px-3.5 pb-3" style={{ gridTemplateColumns: 'repeat(3, minmax(0,1fr))' }}>
          {rows.map((r, i) => (
            <div key={i} className="px-2.5 py-2.5 rounded-xl text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}>
              <div className="text-[9px] mb-1" style={{ color: 'var(--text-tertiary)' }}>{r.label}</div>
              <div className="text-[14px] font-extrabold" style={{ color: valColor(active[r.key]) }}>{formatKRW(active[r.key])}</div>
            </div>
          ))}
        </div>
      )}
      {note && (
        <div className="mx-3.5 mb-3 px-3 py-2 rounded-lg" style={{ background: 'rgba(92,138,255,0.08)', border: '1px solid rgba(92,138,255,0.2)' }}>
          <span className="text-[10px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{note}</span>
        </div>
      )}
      {segments && segments.length >= 2 && (
        <div className="px-3.5 pb-3">
          <div className="text-[10px] mb-2" style={{ color: 'var(--text-tertiary)' }}>사업부문 매출 비중</div>
          <div className="flex overflow-hidden mb-2.5" style={{ height: 10, borderRadius: 99, gap: 2 }}>
            {segments.map((sg, i) => (
              <div key={i} style={{ width: `${sg.pct}%`, background: SEG_COLORS[i % SEG_COLORS.length], borderRadius: i === 0 ? '99px 0 0 99px' : i === segments.length - 1 ? '0 99px 99px 0' : 0 }} />
            ))}
          </div>
          <div className="flex flex-col gap-1.5">
            {segments.map((sg, i) => (
              <div key={i} className="flex items-center gap-2">
                <span style={{ width: 8, height: 8, borderRadius: 2, background: SEG_COLORS[i % SEG_COLORS.length], flexShrink: 0 }} />
                <span className="flex-1 text-[11px] truncate" style={{ color: 'var(--text-secondary)' }}>{sg.label}</span>
                <span className="text-[11px] font-bold" style={{ color: 'var(--text-primary)' }}>{sg.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {extras && extras.length > 0 && (
        <div className="px-3.5 pb-4">
          <div className="text-[10px] mb-2" style={{ color: 'var(--text-tertiary)' }}>주요 재무 항목</div>
          <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(2, minmax(0,1fr))' }}>
            {extras.map((e, i) => (
              <div key={i} className="px-3 py-2.5 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}>
                <div className="text-[9px] mb-1" style={{ color: 'var(--text-tertiary)' }}>{e.label}{e.warn ? ' ⚠' : ''}</div>
                <div className="text-[14px] font-extrabold" style={{ color: e.warn ? 'var(--warning)' : /^-/.test(e.value) ? 'var(--fall)' : 'var(--text-primary)' }}>{e.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── 미상환 사채 (CB/BW) — 잔액 + 발행상세(회차/만기/전환가/리픽싱) ──
function BondsVisual({ items, details }: { items: UnredeemedBondItem[]; details: BondDetailItem[] }) {
  const hasItems = items && items.length > 0;
  const hasDetails = details && details.length > 0;
  if (!hasItems && !hasDetails) return null;
  if (hasDetails) {
    return (
      <div className="flex flex-col gap-2 px-3.5 py-3">
        {details.map((b, i) => {
          const cv = parseInt((b.conversionPrice || '0').replace(/[^0-9]/g, ''), 10) || 0;
          const floor = parseInt((b.refixFloor || '0').replace(/[^0-9]/g, ''), 10) || 0;
          const refixPct = cv > 0 && floor > 0 ? Math.round((floor / cv) * 100) : 0;
          return (
            <div key={i} className="rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <div className="flex items-center gap-1.5 px-3 py-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <span className="text-[12px] font-extrabold" style={{ color: 'var(--text-primary)' }}>{b.type}</span>
                {b.round && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.18)', color: '#ffffff' }}>{b.round}회차</span>}
                {b.amount && <span className="text-[12px] font-bold ml-auto" style={{ color: '#ffffff' }}>{formatKRW(b.amount)}</span>}
              </div>
              <div className="grid grid-cols-2 gap-px" style={{ background: 'rgba(255,255,255,0.05)' }}>
                <div className="px-3 py-2" style={{ background: 'var(--bg-elevated)' }}>
                  <div className="text-[9px] mb-0.5" style={{ color: 'var(--text-tertiary)' }}>발행일</div>
                  <div className="text-[11px] font-bold" style={{ color: 'var(--text-secondary)' }}>{b.issueDate || '-'}</div>
                </div>
                <div className="px-3 py-2" style={{ background: 'var(--bg-elevated)' }}>
                  <div className="text-[9px] mb-0.5" style={{ color: 'var(--text-tertiary)' }}>만기일</div>
                  <div className="text-[11px] font-bold" style={{ color: 'var(--text-secondary)' }}>{b.maturityDate || '-'}</div>
                </div>
              </div>
              {(cv > 0 || floor > 0) && (
                <div className="px-3 py-2.5" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>전환가액</span>
                    <span className="text-[13px] font-extrabold" style={{ color: 'var(--text-primary)' }}>{cv > 0 ? `${cv.toLocaleString()}원` : '-'}</span>
                  </div>
                  {floor > 0 && (
                    <>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>리픽싱 하한 {refixPct > 0 ? `(${refixPct}%)` : ''}</span>
                        <span className="text-[13px] font-extrabold" style={{ color: 'var(--warning)' }}>{floor.toLocaleString()}원</span>
                      </div>
                      <div className="flex rounded-md overflow-hidden mt-1" style={{ height: 6, background: 'rgba(255,255,255,0.08)' }}>
                        <div style={{ width: `${refixPct}%`, background: 'var(--warning)' }} />
                      </div>
                    </>
                  )}
                </div>
              )}
              {(b.convertStart || b.convertEnd) && (
                <div className="px-3 py-2" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                  <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>전환청구 </span>
                  <span className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>{b.convertStart} ~ {b.convertEnd}</span>
                </div>
              )}
            </div>
          );
        })}
        <div className="text-[10px] px-1 leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
          리픽싱(전환가 하향조정)이 발동되면 더 많은 주식으로 전환돼 기존주주 지분 희석이 커져요.
        </div>
      </div>
    );
  }
  const main = items.filter((b) => !/합계|소계|^계$/.test(b.category));
  const show = main.length > 0 ? main : items;
  return (
    <div className="flex flex-col gap-2 px-3.5 py-3">
      {show.map((b, i) => (
        <div key={i} className="px-3 py-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)' }}>
          <div className="flex items-center gap-1.5 mb-2.5">
            <span className="text-[12px] font-bold" style={{ color: 'var(--text-primary)' }}>{b.type}</span>
            {b.category && <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--text-tertiary)' }}>{b.category}</span>}
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <div className="text-[9px] mb-0.5" style={{ color: 'var(--text-tertiary)' }}>미상환 잔액</div>
              <div className="text-[15px] font-extrabold" style={{ color: '#ffffff' }}>{formatKRW(b.total)}</div>
            </div>
            {b.within1y && b.within1y !== '-' && (
              <div className="flex-1">
                <div className="text-[9px] mb-0.5" style={{ color: 'var(--text-tertiary)' }}>1년 내 만기</div>
                <div className="text-[15px] font-extrabold" style={{ color: 'var(--text-primary)' }}>{formatKRW(b.within1y)}</div>
              </div>
            )}
          </div>
        </div>
      ))}
      <div className="text-[10px] px-1 leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
        전환사채(CB)·신주인수권부사채(BW)는 주식 전환·행사 시 지분 희석 가능성이 있어요.
      </div>
    </div>
  );
}

// ── 1. 자본금 변동사항 ──
function CapitalChangeVisual({ items, embedded }: { items: CapitalChangeItem[]; embedded?: boolean }) {
  if (!items || items.length === 0) return null;
  const content = (
    <div className="px-3.5 py-3 flex flex-col gap-2">
      {items.map((item, i) => {
        const st = directionStyle(item.direction);
        const Icon = item.direction === 'up' ? TrendingUp : item.direction === 'down' ? TrendingDown : Minus;
        return (
          <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{ background: st.bg }}>
            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: st.color + '22' }}>
              <Icon size={13} style={{ color: st.color }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 mb-0.5">
                <span className="text-[12px] font-bold truncate" style={{ color: st.color }}>{item.type}</span>
                <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--text-tertiary)' }}>{item.date}</span>
              </div>
              <div className="flex gap-2 flex-wrap">
                {item.stockKind && <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>{item.stockKind}</span>}
                {item.quantity && item.quantity !== '-' && (
                  <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>{item.quantity}주</span>
                )}
                {item.issuePrice && item.issuePrice !== '-' && (
                  <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>발행가 {item.issuePrice}원</span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
  if (embedded) return (
    <div>
      <div className="flex items-center justify-between px-3.5 pt-3 pb-1">
        <span className="text-[11px] font-bold" style={{ color: 'var(--text-secondary)' }}>자본금 변동사항</span>
        <span className="text-[9px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.7)' }}>최근 5년 변동</span>
      </div>
      {content}
    </div>
  );
  return (
    <SectionCard icon={<TrendingUp size={13} />} title="자본금 변동사항 (최근 5년)">
      {content}
    </SectionCard>
  );
}

function InvestmentVisual({ items, year, embedded }: { items: InvestmentItem[]; year: number | null; embedded?: boolean }) {
  if (!items || items.length === 0) return null;
  const parseRatio = (r: string) => parseFloat((r || '').replace(/[^0-9.]/g, '')) || 0;
  const mainItems = items.filter((it) => !isSummaryRow(it.corpName));
  const maxRatio = Math.max(...mainItems.map((it) => parseRatio(it.ratio)), 1);
  const COLORS = ['#ffffff', '#c0c0c0', '#e0e0e0', '#777777', '#d0d0d0', '#999999', '#ffffff', '#c0c0c0', '#e0e0e0', '#777777'];
  const content = (
    <div className="flex flex-col" style={{ paddingTop: 4, paddingBottom: 4 }}>
      {mainItems.map((it, i) => {
        const ratio = parseRatio(it.ratio);
        const barW = maxRatio > 0 ? (ratio / maxRatio) * 100 : 0;
        const color = COLORS[i % COLORS.length];
        return (
          <div key={i} className="flex items-center gap-3 px-3.5"
            style={{ paddingTop: 9, paddingBottom: 9, borderBottom: i < mainItems.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[12px] font-bold truncate" style={{ color: 'rgba(255,255,255,0.82)' }}>{clean(it.corpName)}</span>
                <span className="text-[12px] font-semibold flex-shrink-0 ml-2" style={{ color: color + 'aa' }}>{it.ratio}%</span>
              </div>
              {it.purpose && (
                <div className="text-[10px] mb-1" style={{ color: 'rgba(255,255,255,0.25)' }}>{clean(it.purpose)}</div>
              )}
              <div className="h-[4px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                <div style={{ width: `${barW}%`, height: '100%', background: color + '88', borderRadius: 99 }} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
  if (embedded) return content;
  return (
    <SectionCard icon={<Building2 size={13} />} title="타법인 출자현황" year={year}>
      {content}
    </SectionCard>
  );
}

// ── 3. 최대주주 현황 ──
function MajorShareholderVisual({ items, year, embedded }: { items: ShareholderItem[]; year: number | null; embedded?: boolean }) {
  if (!items || items.length === 0) return null;
  const mainItems = items.filter((it) => !isSummaryRow(it.name));
  const summaryItem = items.find((it) => isSummaryRow(it.name));
  const content = (
    <div className="px-3.5 py-3 flex flex-col gap-2">
      {mainItems.map((it, i) => {
        const isTop = i === 0;
        return (
          <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
            style={{
              background: isTop ? 'rgba(92,138,255,0.12)' : 'rgba(255,255,255,0.04)',
              border: isTop ? '1px solid rgba(92,138,255,0.3)' : '1px solid transparent',
            }}>
            <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: isTop ? 'rgba(92,138,255,0.25)' : 'rgba(255,255,255,0.08)' }}>
              {isTop
                ? <span style={{ fontSize: 14 }}>👑</span>
                : <Users size={13} style={{ color: 'var(--text-tertiary)' }} />
              }
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-bold truncate" style={{ color: isTop ? '#5c8aff' : 'var(--text-primary)' }}>{clean(it.name)}</span>
                <span className="text-[15px] font-extrabold flex-shrink-0" style={{ color: isTop ? '#ffffff' : 'var(--text-secondary)' }}>{it.ratio}%</span>
              </div>
              <div className="flex gap-2 mt-0.5 flex-wrap">
                {it.relate && <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>{clean(it.relate)}</span>}
                {it.stockKind && <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>{it.stockKind}</span>}
                {it.quantity && <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>{it.quantity}주</span>}
              </div>
            </div>
          </div>
        );
      })}
      {summaryItem && (
        <div className="flex items-center justify-between px-3 py-2 rounded-xl mt-1"
          style={{ background: 'rgba(255,255,255,0.08)', borderTop: '1px solid var(--border)' }}>
          <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>합계 지분율</span>
          <span className="text-[14px] font-extrabold" style={{ color: '#ffffff' }}>{summaryItem.ratio}%</span>
        </div>
      )}
    </div>
  );
  if (embedded) return content;
  return (
    <SectionCard icon={<Users size={13} />} title="최대주주 현황" year={year}>
      {content}
    </SectionCard>
  );
}

// ── 4. 주식의 총수 ──
function StockTotalVisual({ items, year }: { items: StockTotalItem[]; year: number | null }) {
  if (!items || items.length === 0) return null;
  const parseNum = (s: string) => parseInt((s || '').replace(/[^0-9]/g, ''), 10) || 0;
  const commonItem  = items.find((it) => /보통주/.test(it.kind));
  const preferItem  = items.find((it) => /우선주|의결권\s*없/.test(it.kind));
  const summaryItem = items.find((it) => /합계|소계/.test(it.kind));
  const etcItems = items.filter((it) => it !== commonItem && it !== preferItem && it !== summaryItem);
  const makeStats = (item: StockTotalItem | undefined, color: string) => {
    if (!item) return null;
    const issued = parseNum(item.issuedTotal);
    const treasury = parseNum(item.treasury);
    const distributed = parseNum(item.distributed) || (issued > 0 ? issued - treasury : 0);
    const distRatio = issued > 0 ? ((distributed / issued) * 100).toFixed(1) : null;
    return [
      { label: '발행 주식 총수', value: item.issuedTotal || '-', color },
      { label: '자기주식',       value: item.treasury || '-',     color: '#ffffff' },
      { label: '유통 주식수',    value: item.distributed || (distributed > 0 ? distributed.toLocaleString() : '-'), color: '#ffffff' },
      { label: '유통 비율',      value: distRatio ? `${distRatio}%` : '-', color: '#ffffff' },
    ];
  };
  const commonStats = makeStats(commonItem, '#ffffff');
  const preferStats = makeStats(preferItem, '#ffffff');
  const StatGrid = ({ stats }: { stats: { label: string; value: string; color: string }[] }) => (
    <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(2, minmax(0,1fr))' }}>
      {stats.map((s, i) => (
        <div key={i} className="px-3 py-2.5 rounded-xl"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)' }}>
          <div className="text-[10px] mb-1" style={{ color: 'var(--text-tertiary)' }}>{s.label}</div>
          <div className="text-[14px] font-extrabold leading-tight" style={{ color: s.color }}>{s.value}</div>
        </div>
      ))}
    </div>
  );
  return (
    <SectionCard icon={<PieChart size={13} />} title="주식의 총수" year={year}>
      <div className="px-3.5 py-3 flex flex-col gap-4">
        {commonStats && (
          <div>
            <div className="flex items-center gap-1.5 mb-2.5">
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ffffff', display: 'inline-block', flexShrink: 0 }} />
              <span className="text-[10px] font-bold" style={{ color: 'var(--text-tertiary)' }}>보통주</span>
            </div>
            <StatGrid stats={commonStats} />
          </div>
        )}
        {preferStats && (
          <>
            <div style={{ height: 1, background: 'var(--border)' }} />
            <div>
              <div className="flex items-center gap-1.5 mb-2.5">
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ffffff', display: 'inline-block', flexShrink: 0 }} />
                <span className="text-[10px] font-bold" style={{ color: 'var(--text-tertiary)' }}>의결권 없는 주식 (우선주)</span>
              </div>
              <StatGrid stats={preferStats} />
            </div>
          </>
        )}
        {(summaryItem || etcItems.length > 0) && (
          <>
            <div style={{ height: 1, background: 'var(--border)' }} />
            <div>
              <div className="flex items-center gap-1.5 mb-2.5">
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgba(255,255,255,0.3)', display: 'inline-block', flexShrink: 0 }} />
                <span className="text-[10px] font-bold" style={{ color: 'var(--text-tertiary)' }}>합계</span>
              </div>
              <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(2, minmax(0,1fr))' }}>
                {summaryItem && (
                  <>
                    <div className="px-3 py-2.5 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)' }}>
                      <div className="text-[10px] mb-1" style={{ color: 'var(--text-tertiary)' }}>총 발행주식</div>
                      <div className="text-[14px] font-extrabold" style={{ color: '#fff' }}>{summaryItem.issuedTotal || '-'}</div>
                    </div>
                    <div className="px-3 py-2.5 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)' }}>
                      <div className="text-[10px] mb-1" style={{ color: 'var(--text-tertiary)' }}>총 자기주식</div>
                      <div className="text-[14px] font-extrabold" style={{ color: 'var(--text-secondary)' }}>{summaryItem.treasury || '-'}</div>
                    </div>
                  </>
                )}
                {etcItems.map((it, i) => (
                  <div key={i} className="px-3 py-2.5 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)' }}>
                    <div className="text-[10px] mb-1" style={{ color: 'var(--text-tertiary)' }}>{clean(it.kind)}</div>
                    <div className="text-[12px] font-bold leading-snug" style={{ color: 'var(--text-secondary)' }}>{it.issuedTotal || '-'}</div>
                  </div>
                ))}
                {summaryItem?.distributed && summaryItem.distributed !== '-' && (
                  <div className="px-3 py-2.5 rounded-xl col-span-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}>
                    <div className="text-[10px] mb-1" style={{ color: 'var(--text-tertiary)' }}>비고</div>
                    <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{summaryItem.distributed}</div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
        {!commonItem && !preferItem && !summaryItem && items.length > 0 && (
          <StatGrid stats={makeStats(items[0], '#ffffff') ?? []} />
        )}
      </div>
    </SectionCard>
  );
}

// ── 5. 배당 이력 ──
function DividendVisual({ items, year, embedded }: { items: DividendItem[]; year: number | null; embedded?: boolean }) {
  const validItems = items.filter((d) => d.thisYear || d.prevYear || d.prev2Year);
  if (!validItems.length) return null;
  const dpsRow = validItems.find((d) => /1주당|주당 배당금|현금배당금/.test(d.label));
  const parseVal = (s: string) => parseFloat((s || '').replace(/[^0-9.]/g, '')) || 0;
  const vals = dpsRow ? [parseVal(dpsRow.prev2Year), parseVal(dpsRow.prevYear), parseVal(dpsRow.thisYear)] : [];
  const maxVal = Math.max(...vals, 1);
  const BAR_H = 56;
  const years = [`${(year || 2024) - 2}`, `${(year || 2024) - 1}`, `${year || 2024}`];
  const dividendContent = (
    <div className="px-3.5 py-3">
      {dpsRow && vals.some((v) => v > 0) && (
        <div className="mb-4">
          <div className="text-[10px] mb-3" style={{ color: 'var(--text-tertiary)' }}>1주당 배당금 (원)</div>
          <div className="flex items-end gap-3" style={{ height: BAR_H + 28 }}>
            {vals.map((v, i) => {
              const h = maxVal > 0 ? Math.max((v / maxVal) * BAR_H, v > 0 ? 6 : 0) : 0;
              const isLatest = i === 2;
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                  <span className="text-[10px] font-bold" style={{ color: isLatest ? '#ffffff' : 'var(--text-secondary)' }}>
                    {v > 0 ? v.toLocaleString() : '-'}
                  </span>
                  <div style={{ width: '100%', height: h, background: isLatest ? '#ffffff' : 'rgba(255,255,255,0.35)', borderRadius: '4px 4px 0 0', minHeight: v > 0 ? 4 : 0 }} />
                  <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>{years[i]}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
        <div className="flex px-3 py-2" style={{ background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid var(--border)' }}>
          <span className="flex-1 text-[9px] font-bold" style={{ color: 'var(--text-tertiary)' }}>항목</span>
          <span className="w-14 text-right text-[9px] font-bold" style={{ color: 'var(--text-tertiary)' }}>{years[2]}</span>
          <span className="w-14 text-right text-[9px]" style={{ color: 'var(--text-tertiary)' }}>{years[1]}</span>
          <span className="w-14 text-right text-[9px]" style={{ color: 'var(--text-tertiary)' }}>{years[0]}</span>
        </div>
        {validItems.map((it, i) => (
          <div key={i} className="flex items-center px-3 py-2"
            style={{ borderTop: i === 0 ? 'none' : '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
            <span className="flex-1 text-[11px] truncate" style={{ color: 'var(--text-secondary)' }}>{clean(it.label)}</span>
            <span className="w-14 text-right text-[11px] font-bold" style={{ color: 'var(--text-primary)' }}>{it.thisYear || '-'}</span>
            <span className="w-14 text-right text-[10px]" style={{ color: 'var(--text-tertiary)' }}>{it.prevYear || '-'}</span>
            <span className="w-14 text-right text-[10px]" style={{ color: 'var(--text-tertiary)' }}>{it.prev2Year || '-'}</span>
          </div>
        ))}
      </div>
    </div>
  );
  if (embedded) return dividendContent;
  return (
    <SectionCard icon={<Coins size={13} />} title="배당 이력" year={year}>
      {dividendContent}
    </SectionCard>
  );
}

// ── 6. 소액주주 현황 ──
function MinorityVisual({ items, year, embedded }: { items: MinorityItem[]; year: number | null; embedded?: boolean }) {
  if (!items || items.length === 0) return null;
  const parseRatio = (s: string) => parseFloat((s || '').replace(/[^0-9.]/g, '')) || 0;
  const ratioItem = items.find((it) => /지분율|비율/.test(it.label) || parseRatio(it.ratio) > 0);
  const ratio = ratioItem ? parseRatio(ratioItem.ratio) : 0;
  const R = 28; const C = 36; const CIRC = 2 * Math.PI * R;
  const dash = (ratio / 100) * CIRC;
  const shareholdersItem = items.find((it) => /주주수|주주 수/.test(it.label));
  const quantityItem = items.find((it) => /주식수|보유/.test(it.label));
  const otherItems = items.filter((it) => it !== ratioItem && it !== shareholdersItem && it !== quantityItem);
  const minorityContent = (
    <div className="px-3.5 py-3">
      <div className="flex items-center gap-4 mb-3">
        <div className="relative flex-shrink-0" style={{ width: 72, height: 72 }}>
          <svg width="72" height="72" viewBox="0 0 72 72" style={{ transform: 'rotate(-90deg)' }}>
            <circle cx={C} cy={C} r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={10} />
            <circle cx={C} cy={C} r={R} fill="none" stroke="#ffffff" strokeWidth={10}
              strokeDasharray={`${dash} ${CIRC}`} strokeLinecap="round" />
          </svg>
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center' }}>
            <div className="text-[13px] font-extrabold" style={{ color: '#ffffff' }}>
              {ratio > 0 ? `${ratio}%` : '-'}
            </div>
          </div>
        </div>
        <div className="flex-1 flex flex-col gap-2">
          {shareholdersItem && (
            <div className="flex items-center justify-between">
              <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>소액주주 수</span>
              <span className="text-[12px] font-bold" style={{ color: 'var(--text-primary)' }}>{shareholdersItem.shareholders || '-'}</span>
            </div>
          )}
          {ratioItem && (
            <div className="flex items-center justify-between">
              <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>소액주주 지분</span>
              <span className="text-[12px] font-bold" style={{ color: '#ffffff' }}>{ratioItem.ratio}</span>
            </div>
          )}
          {quantityItem && (
            <div className="flex items-center justify-between">
              <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>보유 주식수</span>
              <span className="text-[12px] font-bold" style={{ color: 'var(--text-secondary)' }}>{quantityItem.quantity || '-'}</span>
            </div>
          )}
        </div>
      </div>
      {otherItems.length > 0 && (
        <div className="rounded-xl overflow-hidden mb-2.5" style={{ border: '1px solid var(--border)' }}>
          {otherItems.map((it, i) => (
            <div key={i} className="flex items-center justify-between px-3 py-2"
              style={{ borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
              <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{clean(it.label)}</span>
              <div className="flex gap-2">
                {it.ratio && <span className="text-[11px] font-bold" style={{ color: '#ffffff' }}>{it.ratio}</span>}
                {it.shareholders && <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{it.shareholders}명</span>}
                {it.quantity && <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{it.quantity}주</span>}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
        <AlertTriangle size={11} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
        <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>1% 미만 보유 주주를 소액주주로 분류</span>
      </div>
    </div>
  );
  if (embedded) return minorityContent;
  return (
    <SectionCard icon={<Users size={13} />} title="소액주주 현황" year={year}>
      {minorityContent}
    </SectionCard>
  );
}

export function DisclosureSummarySheet({ disclosure, isOpen, onClose }: DisclosureSummarySheetProps) {
  const [ai, setAi] = useState<ReturnType<typeof normalize> | null>(null);
  const [loading, setLoading] = useState(false);
  const loadingReceiptNoRef = useRef<string | null>(null);
  const [activeSection, setActiveSection] = useState<'capital'|'investment'|'bonds'|'shareholder'|'stock'|'dividend'|'minority'>('capital');
  const [error, setError] = useState('');
  const [related, setRelated] = useState<Disclosure[]>([]);
  const [capItems, setCapItems] = useState<CapitalChangeItem[] | null>(null);
  const [capLoading, setCapLoading] = useState(false);
  const [reportInfo, setReportInfo] = useState<ReportInfoState>({
    investments: [], majorShareholders: [], stockTotal: [], dividends: [], minority: [], bonds: [], bondDetails: [], creditRating: null, financials: null, auditOpinion: null, loading: false,
  });
  const [reportYear, setReportYear] = useState<number | null>(null);
  const [finRisk, setFinRisk] = useState<FinancialRisk | null>(null);
  const isLoggedIn = useAuthStore((s) => s.isAuthenticated);
  const [showLogin, setShowLogin] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const currentReceiptNoRef = useRef<string | null>(null);

  const resetDisclosureState = useCallback(() => {
    setAi(null);
    setError('');
    setLoading(false);
    setRelated([]);
    setCapItems(null);
    setCapLoading(false);
    setReportInfo({
      investments: [], majorShareholders: [], stockTotal: [], dividends: [],
      minority: [], bonds: [], bondDetails: [], creditRating: null,
      financials: null, auditOpinion: null, loading: false, sectionMeta: {},
    });
    setReportYear(null);
    setFinRisk(null);
    setActiveSection('capital');
    loadingReceiptNoRef.current = null;
  }, []);

  useEffect(() => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const ac = new AbortController();
    abortRef.current = ac;
    resetDisclosureState();

    if (!isOpen || !disclosure) {
      currentReceiptNoRef.current = null;
      loadingReceiptNoRef.current = null;
      return;
    }

    const targetReceiptNo = disclosure.receiptNo;
    currentReceiptNoRef.current = targetReceiptNo;

    if (disclosure.stockCode && /^\d{6}$/.test(disclosure.stockCode)) {
      const code = disclosure.stockCode;
      apiClient.get<Disclosure[]>(
        `/api/disclosures/stock/${code}?limit=6&offset=0`,
        { signal: ac.signal }
      )
        .then((list) => {
          if (currentReceiptNoRef.current !== targetReceiptNo) return;
          const others = (list || []).filter((d) => d.receiptNo !== targetReceiptNo).slice(0, 3);
          setRelated(others);
        })
        .catch((err: unknown) => {
          if (err instanceof Error && err.name === 'AbortError') return;
          if (currentReceiptNoRef.current !== targetReceiptNo) return;
          setRelated([]);
        });
    }

    if (disclosure.receiptNo) {
      setCapLoading(true);
      apiClient.get<{ items: CapitalChangeItem[] }>(
        `/api/capital-history/${disclosure.receiptNo}`,
        { signal: ac.signal }
      )
        .then((res) => {
          if (currentReceiptNoRef.current !== targetReceiptNo) return;
          setCapItems(res?.items ?? []);
        })
        .catch((err: unknown) => {
          if (err instanceof Error && err.name === 'AbortError') return;
          if (currentReceiptNoRef.current !== targetReceiptNo) return;
          setCapItems([]);
        })
        .finally(() => {
          if (currentReceiptNoRef.current !== targetReceiptNo) return;
          setCapLoading(false);
        });
    }

    if (disclosure.receiptNo) {
      setReportInfo((p) => ({ ...p, loading: true }));
      apiClient.get<{
        investments: InvestmentItem[];
        majorShareholders: ShareholderItem[];
        stockTotal: StockTotalItem[];
        dividends: DividendItem[];
        minority: MinorityItem[];
        bonds: UnredeemedBondItem[];
        bondDetails: BondDetailItem[];
        creditRating: CreditRatingResult | null;
        financials: FinancialsResult | null;
        auditOpinion: AuditOpinionResult | null;
        year: number | null;
        sectionMeta?: Record<string, SectionMeta | null>;
      }>(
        `/api/report-info/${targetReceiptNo}/all`,
        { signal: ac.signal }
      )
        .then((res) => {
          if (currentReceiptNoRef.current !== targetReceiptNo) return;
          setReportInfo({
            investments: res?.investments ?? [],
            majorShareholders: res?.majorShareholders ?? [],
            stockTotal: res?.stockTotal ?? [],
            dividends: res?.dividends ?? [],
            minority: res?.minority ?? [],
            bonds: res?.bonds ?? [],
            bondDetails: res?.bondDetails ?? [],
            creditRating: res?.creditRating ?? null,
            financials: res?.financials ?? null,
            auditOpinion: res?.auditOpinion ?? null,
            loading: false,
            sectionMeta: res?.sectionMeta ?? {},
          });
          setReportYear(res?.year ?? null);
        })
        .catch((err: unknown) => {
          if (err instanceof Error && err.name === 'AbortError') return;
          if (currentReceiptNoRef.current !== targetReceiptNo) return;
          setReportInfo({
            investments: [], majorShareholders: [], stockTotal: [], dividends: [],
            minority: [], bonds: [], bondDetails: [], creditRating: null,
            financials: null, auditOpinion: null, loading: false, sectionMeta: {},
          });
        });
    }

    if (disclosure.receiptNo) {
      apiClient.get<FinancialRisk>(
        `/api/report-info/${targetReceiptNo}/financial-risk`,
        { signal: ac.signal }
      )
        .then((res) => {
          if (currentReceiptNoRef.current !== targetReceiptNo) return;
          setFinRisk(res ?? null);
        })
        .catch((err: unknown) => {
          if (err instanceof Error && err.name === 'AbortError') return;
          if (currentReceiptNoRef.current !== targetReceiptNo) return;
          setFinRisk(null);
        });
    }

    return () => {
      ac.abort();
      currentReceiptNoRef.current = null;
      loadingReceiptNoRef.current = null;
    };
  }, [disclosure?.receiptNo, disclosure?.stockCode, isOpen, resetDisclosureState]);

  const runAi = useCallback(async () => {
    if (!isLoggedIn) { setShowLogin(true); return; }

    const requestedReceiptNo = disclosure?.receiptNo;
    if (!requestedReceiptNo) return;

    if (loadingReceiptNoRef.current === requestedReceiptNo) return;

    const signal = abortRef.current?.signal;

    loadingReceiptNoRef.current = requestedReceiptNo;
    setLoading(true);
    setError('');
    setAi(null);

    try {
      const res = await apiClient.post<AiResultRaw>(
        `/api/disclosures/${requestedReceiptNo}/ai-summary`,
        {},
        { signal }
      );

      if (currentReceiptNoRef.current !== requestedReceiptNo) return;

      const n = normalize(res);
      if (n.status === 'skipped') {
        setError('AI 분석 기능은 현재 준비중이에요.');
      } else if (n.status === 'failed' || (!n.summary && n.keyPoints.length === 0)) {
        setError('AI 분석에 실패했어요. 잠시 후 다시 시도해주세요.');
      } else {
        setAi(n);
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      if (currentReceiptNoRef.current !== requestedReceiptNo) return;
      setError('AI 분석에 문제가 생겼습니다.');
    } finally {
      if (loadingReceiptNoRef.current === requestedReceiptNo) {
        loadingReceiptNoRef.current = null;
        setLoading(false);
      }
    }
  }, [isLoggedIn, disclosure?.receiptNo]);

  // jp: classify — 발행사/공시 유형 분류 (배지 & 안내 문구용)
  // jp: useMemo로 memoize. disclosure가 null이면 null 반환
  // jp: 백엔드 issuerType > corpCls > 기업명/공시명 패턴 순으로 우선 적용
  const classify = useMemo(
    () => getDisclosureClassification(disclosure),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [disclosure?.receiptNo, (disclosure as any)?.market, (disclosure as any)?.corpCls, (disclosure as any)?.issuerType],
  );

  // jp: 모든 Hook 선언 완료 후 조건부 return (React Hook 규칙)
  // jp: Hook은 조건부 return 이전에 반드시 모두 선언되어야 함
  if (!isOpen || !disclosure) return null;

  const hasReportData =
    reportInfo.investments.length > 0 ||
    reportInfo.majorShareholders.length > 0 ||
    reportInfo.stockTotal.length > 0 ||
    reportInfo.dividends.filter((d) => d.thisYear || d.prevYear || d.prev2Year).length > 0 ||
    reportInfo.minority.length > 0 ||
    reportInfo.bonds.length > 0 ||
    reportInfo.bondDetails.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'var(--bg-primary)' }}>
      <div className="flex-1 overflow-y-auto pb-32">
        <header className="sticky top-0 z-20 px-4 pt-4 pb-3"
          style={{ background: 'var(--bg-secondary)', borderBottom: '0.5px solid var(--border)' }}>
          <button onClick={onClose} aria-label="뒤로가기"
            className="w-[38px] h-[38px] rounded-[12px] flex items-center justify-center active:scale-95 transition-all"
            style={{
              background: 'var(--bg-elevated)',
              border: '0.5px solid var(--border)',
            }}>
            <ChevronLeft size={19} style={{ color: '#ffffff' }} />
          </button>
        </header>

        <div className="px-5">
          <div className="flex items-center gap-2 mb-3 mt-1">
            <ImportantDisclosureBadge importance={disclosure.importance} sentiment={disclosure.sentiment} showSentiment={!ai} />
          </div>

          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-black"
              style={{ background: 'var(--bg-elevated)', color: 'var(--accent)' }}>
              {disclosure.stockName?.[0] ?? '·'}
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{disclosure.stockName}</span>
              <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                {disclosure.stockCode ? `${disclosure.stockCode} · ` : ''}{formatRelativeTime(disclosure.disclosedAt)}
              </span>
            </div>
          </div>

          {/* jp: 발행사 유형·공시 유형 배지 */}
          {classify && (
            <DisclosureBadges classification={classify} size="sm" className="mb-3" />
          )}

          {/* AI 분석 버튼 */}
          {!ai && !loading && (
            <div className="mb-5 flex flex-col gap-2.5">
              <button onClick={runAi}
                className="flex items-center justify-center gap-2 py-3.5 rounded-2xl text-[13px] font-bold active:scale-[0.98] transition-all"
                style={{ background: '#ffffff', color: '#000000' }}>
                <Sparkles size={16} /> AI 공시분석 시작
              </button>
              <button onClick={() => window.open(`https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${disclosure.receiptNo}`, '_blank', 'noopener')}
                className="flex items-center justify-center gap-2 py-3.5 rounded-2xl text-[13px] font-bold active:scale-[0.98] transition-all"
                style={{ background: 'rgba(92,138,255,0.14)', border: '1px solid rgba(92,138,255,0.5)', color: '#5c8aff' }}>
                <ExternalLink size={15} /> DART 원문 보기
              </button>
            </div>
          )}

          {/* AI 로딩 */}
          {loading && !ai && (
            <div className="mb-5 relative overflow-hidden p-5 rounded-2xl text-center flex flex-col items-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--accent-border)' }}>
              <div className="absolute top-0 h-full" style={{ left: '-40%', width: '40%', background: 'linear-gradient(90deg,transparent,rgba(255,255,255,0.18),transparent)', animation: 'dssSweep 1.8s linear infinite' }} />
              <div className="relative mb-3" style={{ width: 52, height: 52 }}>
                <div className="absolute inset-0 rounded-full" style={{ border: '2px solid #ffffff', animation: 'dssRing 1.6s ease-out infinite' }} />
                <div className="absolute inset-0 rounded-full" style={{ border: '2px solid rgba(255,255,255,0.4)', animation: 'dssRing 1.6s ease-out infinite', animationDelay: '0.8s' }} />
                <div className="absolute rounded-full flex items-center justify-center" style={{ inset: 15, background: '#ffffff' }}>
                  <Sparkles size={17} color="#000" />
                </div>
              </div>
              <p className="relative text-[14px] font-extrabold" style={{ color: 'var(--text-primary)' }}>AI가 공시를 분석하고 있어요</p>
              <p className="relative text-[11px] mt-1" style={{ color: '#ffffff' }}>잠시만 기다려주세요</p>
              <style>{`@keyframes dssRing{0%{transform:scale(0.7);opacity:0.8}100%{transform:scale(1.8);opacity:0}}@keyframes dssSweep{0%{left:-40%}100%{left:100%}}`}</style>
            </div>
          )}

          {/* AI 결과 */}
          {ai && (
            <div className="mb-5 rounded-2xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--accent-border)' }}>
              <div className="flex items-center gap-2.5 px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.18)' }}>
                <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: '#ffffff' }}>
                  <Sparkles size={14} color="#000" />
                </div>
                <span className="text-[12px] font-extrabold" style={{ color: 'var(--text-primary)' }}>AI 공시 분석</span>
                <button onClick={() => window.open(`https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${disclosure.receiptNo}`, '_blank', 'noopener')}
                  className="ml-auto flex items-center gap-1 px-2.5 py-1.5 rounded-lg active:scale-95 transition-all"
                  style={{ background: 'rgba(92,138,255,0.14)', border: '1px solid rgba(92,138,255,0.4)', color: '#5c8aff' }}>
                  <ExternalLink size={12} />
                  <span style={{ fontSize: 10, fontWeight: 700 }}>DART</span>
                </button>
              </div>

              {(ai.impactLevel || ai.summary) && (
                <div className="px-4 pt-3.5 pb-1">
                  {ai.impactLevel && (() => {
                    const st = impactStyle(ai.impactLevel);
                    return (
                      <span className="inline-flex items-center gap-1 text-[11px] font-extrabold px-2.5 py-1 rounded-full mb-2"
                        style={{ background: st.bg, color: st.color }}>
                        {ai.impactLevel}
                      </span>
                    );
                  })()}
                  {ai.summary && (
                    <p className="text-[14px] font-bold leading-relaxed" style={{ color: 'var(--text-primary)' }}>
                      {ai.summary}
                    </p>
                  )}
                </div>
              )}

              <div className="px-4 py-3.5">
                <>
                  <>
                    {ai.summary && (
                      <div className="mb-2.5 flex flex-col gap-2">
                        {splitParagraphs(ai.summary).map((p, pi) => (
                          <p key={pi} className="text-[14px] font-bold leading-relaxed" style={{ color: 'var(--text-primary)', margin: 0 }}>{p}</p>
                        ))}
                      </div>
                    )}
                    {ai.detail && (
                      <div className="flex flex-col gap-2">
                        {splitParagraphs(ai.detail).map((p, pi) => (
                          <p key={pi} className="text-[14px] leading-relaxed" style={{ color: 'var(--text-secondary)', margin: 0 }}>{p}</p>
                        ))}
                      </div>
                    )}
                    {reportInfo.financials && (reportInfo.financials.consolidated || reportInfo.financials.separate) && (() => {
                      const kn = (ai.keyNumbers as { label: string; value: string }[]) || [];
                      let creditRating: { grade: string; agency: string } | null = null;
                      if (reportInfo.creditRating && reportInfo.creditRating.grade) {
                        creditRating = { grade: reportInfo.creditRating.grade, agency: reportInfo.creditRating.agency };
                      } else {
                        const crRow = kn.find((n) => /신용등급/.test(n.label));
                        if (crRow) {
                          const gm = crRow.value.match(/(AAA|AA[+-]?|A[+-]?|BBB[+-]?|BB[+-]?|B[+-]?|CCC[+-]?|CC[+-]?|C[+-]?|D)\b/);
                          const am = crRow.value.match(/\(([^)]+)\)/);
                          if (gm) creditRating = { grade: gm[1], agency: am ? am[1] : '' };
                        }
                      }
                      const segments = kn
                        .filter((n) => /비중/.test(n.label) || /\([\d.]+\s*%\)/.test(n.value))
                        .map((n) => {
                          const m = n.value.match(/([\d.]+)\s*%/);
                          return m ? { label: n.label.replace(/\s*(사업)?\s*매출\s*비중\s*$/, '').replace(/\s*비중\s*$/, ''), pct: parseFloat(m[1]), value: `${parseFloat(m[1])}%` } : null;
                        })
                        .filter((x): x is { label: string; pct: number; value: string } => x !== null)
                        .slice(0, 5);
                      const EXTRA_RE = /매출채권|재고자산|부채총계|자본총계|현금|유동/;
                      const extras = kn
                        .filter((n) => EXTRA_RE.test(n.label) && !/원문에\s*없음|없음/.test(n.value))
                        .map((n) => ({ label: n.label, value: cleanAmount(n.value), warn: /매출채권/.test(n.label) }))
                        .slice(0, 4);
                      return (
                        <div className="mt-3">
                          <FinancialsVisual
                            fin={reportInfo.financials!}
                            summary={ai.summary}
                            creditRating={creditRating}
                            segments={segments.length >= 2 ? segments : undefined}
                            extras={extras.length > 0 ? extras : undefined}
                          />
                        </div>
                      );
                    })()}

                    {ai.keyNumbers && ai.keyNumbers.length > 0 && (() => {
                      const rawNums = ai.keyNumbers as { label: string; value: string }[];
                      const EMPTY_RE = /원문에\s*없음|확인\s*불가|없음|N\/A|^-$/;
                      const hasFinBlock = !!(reportInfo.financials && (reportInfo.financials.consolidated || reportInfo.financials.separate));
                      const FIN_RE = /매출액|영업이익|당기순이익|순이익|매출총이익|영업손실|순손실/;
                      const ABSORBED_RE = /신용등급|비중|매출채권|재고자산|부채총계|자본총계|현금및현금성|유동자산|유동부채/;
                      const nums = rawNums.filter((n) => {
                        if (EMPTY_RE.test(n.value)) return false;
                        if (hasFinBlock && FIN_RE.test(n.label)) return false;
                        if (hasFinBlock && ABSORBED_RE.test(n.label)) return false;
                        return true;
                      });
                      if (nums.length === 0) return null;
                      const isUp = (v: string) => /^\+|▲/.test(v);
                      const isDn = (v: string) => /△|^-\d|▼/.test(v);
                      const numColor = (v: string) => isUp(v) ? 'var(--rise)' : isDn(v) ? 'var(--fall)' : 'var(--text-primary)';
                      const used = new Set<{ label: string; value: string }>();
                      const HERO_RE = /^전체\s*영업이익|^영업이익$|^당기순이익$|^순이익$|영업이익\s*\(|당기순이익\s*\(/;
                      const HERO_FALLBACK_RE = /영업이익|당기순이익|순이익/;
                      let hero = nums.find((n) => HERO_RE.test(n.label));
                      if (!hero) hero = nums.find((n) => HERO_FALLBACK_RE.test(n.label));
                      if (!hero) hero = nums[0];
                      used.add(hero);
                      const heroWarn = /손실|적자/.test(hero.label) || isDn(hero.value);
                      const yoyRow = nums.find((n) =>
                        !used.has(n) && /전년.*동기|동기.*대비|증감률|증가율|전년\s*대비/.test(n.label)
                      );
                      if (yoyRow) used.add(yoyRow);
                      const SEG_RE = /\(([\d.]+)\s*%\)/;
                      const SEG_COLORS = ['#ffffff', '#c0c0c0', '#777777', '#e0e0e0', '#999999'];
                      const segs = nums
                        .filter((n) => !used.has(n) && SEG_RE.test(n.value))
                        .map((n) => {
                          const m = n.value.match(SEG_RE);
                          return { ref: n, label: n.label.replace(/\s*사업부문\s*(매출액?|영업이익)?\s*$/, '').replace(/\s*(매출액?|영업이익)\s*$/, ''), value: n.value, pct: m ? parseFloat(m[1]) : 0 };
                        });
                      segs.forEach((s) => used.add(s.ref));
                      const SALES_RE = /매출액|순매출|총매출|^매출$|조달\s*금액|주당\s*배당금/;
                      const salesCard = nums.find((n) => !used.has(n) && SALES_RE.test(n.label));
                      if (salesCard) used.add(salesCard);
                      const PREV_PROFIT_RE = /(전분기|직전분기|전기).*(영업이익|당기순이익|순이익)|(영업이익|당기순이익|순이익).*(전분기|직전분기|전기)|발행가|신주\s*발행/;
                      const prevProfitCard = nums.find((n) => !used.has(n) && PREV_PROFIT_RE.test(n.label));
                      if (prevProfitCard) used.add(prevProfitCard);
                      const subCards = [salesCard, prevProfitCard].filter((n): n is { label: string; value: string } => !!n);
                      const PCT = /([\d.]+)\s*%/;
                      const beforeRow = nums.find((n) => !used.has(n) && /(변동\s*전|지분\s*전|이전\s*지분)/.test(n.label) && PCT.test(n.value));
                      const afterRow  = nums.find((n) => !used.has(n) && /(변동\s*후|지분\s*후|이후\s*지분)/.test(n.label) && PCT.test(n.value));
                      const purposeRow = nums.find((n) => !used.has(n) && /변동\s*목적|지분\s*목적/.test(n.label));
                      const dilRow = nums.find((n) => !used.has(n) && /희석률|희석\s*비율/.test(n.label));
                      const dyRow = nums.find((n) => !used.has(n) && /시가배당률|시가\s*배당/.test(n.label));
                      const dpsRow = nums.find((n) => !used.has(n) && /1주당\s*배당금|주당\s*배당금/.test(n.label));
                      [beforeRow, afterRow, purposeRow, dilRow, dyRow, dpsRow].forEach((r) => { if (r) used.add(r); });
                      const restRows = nums.filter((n) => !used.has(n));
                      return (
                        <div className="mt-3 flex flex-col gap-2.5">
                          <div className="px-3.5 py-3.5 rounded-xl"
                            style={{ background: heroWarn ? 'rgba(255,82,82,0.08)' : 'rgba(255,255,255,0.12)', border: heroWarn ? '1px solid rgba(255,82,82,0.25)' : '1px solid rgba(255,255,255,0.3)' }}>
                            <div className="text-[10px] mb-1" style={{ color: heroWarn ? 'var(--warning)' : '#ffffff' }}>{hero.label}</div>
                            <div className="text-[22px] font-extrabold leading-tight" style={{ color: heroWarn ? '#e8893f' : 'var(--text-primary)' }}>{hero.value}</div>
                            {yoyRow && (
                              <div className="text-[12px] font-bold mt-1.5" style={{ color: numColor(yoyRow.value) }}>
                                {yoyRow.label} {yoyRow.value}
                              </div>
                            )}
                          </div>
                          {subCards.length > 0 && (
                            <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(2, minmax(0,1fr))' }}>
                              {subCards.map((kn, i) => (
                                <div key={i} className="px-3 py-2.5 rounded-xl"
                                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)' }}>
                                  <div className="text-[10px] mb-1 truncate" style={{ color: 'var(--text-tertiary)' }}>{kn.label}</div>
                                  <div className="text-[14px] font-extrabold" style={{ color: numColor(kn.value) }}>{kn.value}</div>
                                </div>
                              ))}
                            </div>
                          )}
                          {segs.length >= 2 && (() => {
                            const isProfit = segs.some((s) => /영업이익/.test(s.ref.label));
                            return (
                            <div className="px-3.5 py-3 rounded-xl" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                              <div className="text-[10px] mb-2" style={{ color: 'var(--text-tertiary)' }}>{isProfit ? '사업부문별 영업이익' : '사업부문 매출비중'}</div>
                              <div className="flex overflow-hidden mb-3" style={{ height: 8, borderRadius: 99, gap: 2 }}>
                                {segs.map((s, i) => (
                                  <div key={i} style={{ width: `${s.pct}%`, background: SEG_COLORS[i % SEG_COLORS.length], borderRadius: i === 0 ? '99px 0 0 99px' : i === segs.length - 1 ? '0 99px 99px 0' : 0 }} />
                                ))}
                              </div>
                              <div className="flex flex-col gap-1.5">
                                {segs.map((s, i) => (
                                  <div key={i} className="flex items-center gap-2">
                                    <span style={{ width: 7, height: 7, borderRadius: 2, background: SEG_COLORS[i % SEG_COLORS.length], flexShrink: 0 }} />
                                    <span className="flex-1 text-[11px] truncate" style={{ color: 'var(--text-secondary)' }}>{s.label}</span>
                                    <span className="text-[11px] font-bold" style={{ color: 'var(--text-primary)' }}>{s.value}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                            );
                          })()}
                          {beforeRow && afterRow && (() => {
                            const bv = parseFloat((beforeRow.value.match(PCT) || [])[1] || '0');
                            const av = parseFloat((afterRow.value.match(PCT) || [])[1] || '0');
                            const isBuy = av >= bv;
                            const col = isBuy ? 'var(--rise)' : 'var(--fall)';
                            const isControl = purposeRow ? /경영권\s*확보|경영권참여/.test(purposeRow.value) : false;
                            return (
                              <div className="px-3.5 py-3 rounded-xl" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                                <div className="text-[10px] font-semibold mb-2.5" style={{ color: 'var(--text-tertiary)' }}>지분 변동 현황</div>
                                <div className="flex items-center gap-2.5">
                                  <div className="text-center flex-shrink-0">
                                    <div className="text-[9px]" style={{ color: 'var(--text-tertiary)' }}>변동 전</div>
                                    <div className="text-[16px] font-bold" style={{ color: 'var(--text-secondary)' }}>{beforeRow.value.replace(/\s*\(.*/, '')}</div>
                                  </div>
                                  <div className="flex-1 flex flex-col items-center gap-0.5">
                                    <span style={{ color: col, fontSize: 18 }}>→</span>
                                    <span className="text-[9px] font-bold" style={{ color: col }}>{isBuy ? '매수' : '매도'}</span>
                                  </div>
                                  <div className="text-center flex-shrink-0">
                                    <div className="text-[9px] font-bold" style={{ color: col }}>변동 후</div>
                                    <div className="text-[18px] font-extrabold" style={{ color: col }}>{afterRow.value.replace(/\s*\(.*/, '')}</div>
                                  </div>
                                </div>
                                {purposeRow && (
                                  <div className="mt-2.5 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
                                    style={{ background: isControl ? 'rgba(255,82,82,0.10)' : 'rgba(255,255,255,0.04)' }}>
                                    <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>변동 목적</span>
                                    <span className="text-[11px] font-bold" style={{ color: isControl ? '#e8893f' : 'var(--text-secondary)' }}>{purposeRow.value}</span>
                                    {isControl && <span className="text-[9px] ml-auto" style={{ color: '#e8893f' }}>경영권참여 의심</span>}
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                          {dilRow && (() => {
                            const m = dilRow.value.match(/([\d.]+)\s*%/);
                            if (!m) return null;
                            const dil = parseFloat(m[1]);
                            if (!(dil > 0 && dil <= 100)) return null;
                            const existing = +(100 - dil).toFixed(1);
                            return (
                              <div className="px-3.5 py-3 rounded-xl" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-[10px] font-semibold" style={{ color: 'var(--text-tertiary)' }}>기존주주 희석 영향</span>
                                  <span className="text-[12px] font-extrabold" style={{ color: 'var(--warning)' }}>희석 {dil}%</span>
                                </div>
                                <div className="flex rounded-md overflow-hidden mb-1.5" style={{ height: 10 }}>
                                  <div style={{ width: `${existing}%`, background: '#ffffff' }} />
                                  <div style={{ width: `${dil}%`, background: 'var(--warning)' }} />
                                </div>
                                <div className="flex justify-between text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                                  <span>기존 {existing}%</span>
                                  <span style={{ color: 'var(--warning)' }}>신주 {dil}%</span>
                                </div>
                              </div>
                            );
                          })()}
                          {dyRow && (() => {
                            const m = dyRow.value.match(/([\d.]+)\s*%/);
                            if (!m) return null;
                            const dy = parseFloat(m[1]);
                            if (!(dy >= 0 && dy <= 50)) return null;
                            const tiers = ['낮음', '보통', '양호', '고배당'];
                            const ti = dy < 1 ? 0 : dy < 2.5 ? 1 : dy < 4 ? 2 : 3;
                            const C = '#ffffff';
                            return (
                              <div className="px-3.5 py-3 rounded-xl" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-[10px] font-semibold" style={{ color: 'var(--text-tertiary)' }}>시가배당률</span>
                                  <span className="text-[14px] font-extrabold" style={{ color: C }}>{dy}% <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>{tiers[ti]}</span></span>
                                </div>
                                <div className="flex gap-1 mb-1">
                                  {tiers.map((_, i) => (<div key={i} style={{ flex: 1, height: 6, borderRadius: 3, background: i <= ti ? C : 'rgba(255,255,255,0.1)', opacity: i < ti ? 0.5 : 1 }} />))}
                                </div>
                                {dpsRow && <div className="text-[10px] mt-1" style={{ color: 'var(--text-secondary)' }}>주당 {dpsRow.value}</div>}
                              </div>
                            );
                          })()}
                          {restRows.length > 0 && (
                            <div>
                              <div className="text-[10px] mb-1.5 px-1" style={{ color: 'var(--text-tertiary)' }}>그 외 지표</div>
                              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                                {restRows.map((kn, i) => {
                                  const hasChange = /[+\-△]|▲|▼/.test(kn.value);
                                  return (
                                    <div key={i} className="flex items-center gap-2 px-3.5 py-2.5"
                                      style={{ background: 'var(--bg-elevated)', borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
                                      {hasChange && <span style={{ width: 5, height: 5, borderRadius: '50%', background: numColor(kn.value), flexShrink: 0 }} />}
                                      <span className="flex-1 text-[12px]" style={{ color: 'var(--text-secondary)' }}>{kn.label}</span>
                                      <span className="text-[12px] font-bold" style={{ color: hasChange ? numColor(kn.value) : 'var(--text-primary)' }}>{kn.value}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                    {!ai.summary && !ai.detail && <EmptyTab text="요약 정보가 없어요" />}
                  </>
                  {ai.investorNote && (
                    <div className="mt-5">
                      <div className="text-[11px] font-bold mb-2" style={{ color: '#ffffff' }}>투자 포인트</div>
                      <p className="text-[12px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{ai.investorNote}</p>
                    </div>
                  )}
                  {ai.riskSignals && ai.riskSignals.length > 0 && (
                    <div className="mt-5">
                      <div className="text-[11px] font-bold mb-2" style={{ color: '#e8893f' }}>리스크</div>
                      <div className="flex flex-col gap-2">
                        {ai.riskSignals.map((rs: { level: string; text: string }, i: number) => {
                          const c = rs.level === 'red' ? { dot: '#e8893f', bg: 'rgba(194,98,14,0.10)' } : rs.level === 'yellow' ? { dot: '#e8893f', bg: 'rgba(194,98,14,0.10)' } : { dot: '#9DA7B3', bg: 'rgba(255,255,255,0.10)' };
                          return (
                            <div key={i} className="flex gap-2 items-start p-2.5 rounded-lg" style={{ background: c.bg }}>
                              <span style={{ width: 8, height: 8, borderRadius: 99, background: c.dot, marginTop: 5, flexShrink: 0 }} />
                              <span className="text-[12px] leading-relaxed" style={{ color: 'var(--text-primary)' }}>{rs.text}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {ai.timeline && (
                    <div className="mt-5">
                      <div className="text-[11px] font-bold mb-2" style={{ color: '#ffffff' }}>일정 확인</div>
                      <div className="flex gap-2 p-2.5 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)' }}>
                        <FileText size={14} style={{ color: '#ffffff', marginTop: 2, flexShrink: 0 }} />
                        <span className="text-[12px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{ai.timeline}</span>
                      </div>
                    </div>
                  )}
                </>
              </div>
            </div>
          )}

          {!ai && !loading && !isLoggedIn && (
            <div className="mb-5 p-5 rounded-2xl text-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--accent-border)' }}>
              <div className="w-11 h-11 rounded-full flex items-center justify-center mx-auto mb-2.5" style={{ background: '#ffffff' }}>
                <Sparkles size={18} color="#000" />
              </div>
              <p className="text-[13px] font-extrabold mb-1.5" style={{ color: 'var(--text-primary)' }}>로그인하면 AI 분석을 볼 수 있어요</p>
              <button onClick={() => setShowLogin(true)} className="mt-2 px-5 py-2 rounded-xl text-[12px] font-bold active:scale-95 transition-all" style={{ background: '#ffffff', color: '#000000' }}>
                로그인하기
              </button>
            </div>
          )}

          {/* 재무위험·감사의견 배너 */}
          {finRisk && finRisk.signals && finRisk.signals.length > 0 && (() => {
            const lv = finRisk.overallLevel;
            const head = lv === 'red'
              ? { color: '#e8893f', bg: 'rgba(194,98,14,0.10)', border: 'rgba(194,98,14,0.30)', label: '감사의견·재무위험 주의' }
              : lv === 'yellow'
              ? { color: '#e8893f', bg: 'rgba(194,98,14,0.08)', border: 'rgba(194,98,14,0.25)', label: '재무 주의 신호' }
              : { color: '#9DA7B3', bg: 'rgba(255,255,255,0.08)', border: 'rgba(255,255,255,0.20)', label: '재무 전반적 양호' };
            return (
              <div className="mb-5 rounded-2xl overflow-hidden" style={{ background: head.bg, border: `1px solid ${head.border}` }}>
                <div className="flex items-center gap-2 px-3.5 py-2.5" style={{ borderBottom: `1px solid ${head.border}` }}>
                  <ShieldAlert size={15} style={{ color: head.color }} />
                  <span className="text-[12px] font-extrabold" style={{ color: head.color }}>{head.label}</span>
                  {finRisk.year && <span className="text-[9px] px-1.5 py-0.5 rounded ml-auto" style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--text-tertiary)' }}>{finRisk.year}년 재무</span>}
                </div>
                <div className="px-3.5 py-2.5 flex flex-col gap-2">
                  {finRisk.signals.map((s, i) => {
                    const c = s.level === 'red' ? '#e8893f' : s.level === 'yellow' ? '#e8893f' : '#9DA7B3';
                    return (
                      <div key={i} className="flex gap-2 items-start">
                        <span style={{ width: 8, height: 8, borderRadius: 99, background: c, marginTop: 5, flexShrink: 0 }} />
                        <span className="text-[12px] leading-relaxed" style={{ color: 'var(--text-primary)' }}>{s.text}</span>
                      </div>
                    );
                  })}
                  {reportInfo.auditOpinion && reportInfo.auditOpinion.opinion && (() => {
                    const op = reportInfo.auditOpinion.opinion;
                    const isClean = /적정/.test(op);
                    const c = isClean ? '#9DA7B3' : '#e8893f';
                    return (
                      <div className="flex gap-2 items-center">
                        <span style={{ width: 8, height: 8, borderRadius: 99, background: c, marginTop: 0, flexShrink: 0 }} />
                        <span className="text-[12px] leading-relaxed" style={{ color: 'var(--text-primary)' }}>
                          감사의견 <span className="font-bold" style={{ color: c }}>{op}</span>
                          {reportInfo.auditOpinion.auditor && <span style={{ color: 'var(--text-tertiary)' }}> · {reportInfo.auditOpinion.auditor}</span>}
                        </span>
                      </div>
                    );
                  })()}
                  <p className="text-[10px] mt-1" style={{ color: 'var(--text-tertiary)' }}>
                    DART 재무공시 기반 자동 산정. 정확한 재무현황 확인은 실제 공시를 확인해주세요.
                  </p>
                </div>
              </div>
            );
          })()}

          {/* 기본 요약 */}
          <div className="text-[11px] font-bold mb-2" style={{ color: 'var(--text-tertiary)' }}>공시 내용</div>
          <p className="text-sm leading-relaxed p-4 rounded-2xl mb-5" style={{ color: 'var(--text-secondary)', background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
            {disclosure.summary}
          </p>

          {/* 공시 영향 통계 */}
          <DisclosureImpactStat receiptNo={disclosure.receiptNo} />

          {/* 사업보고서 + 자본금 로딩 */}
          {(capLoading || reportInfo.loading) && (
            <div className="mt-3 flex items-center justify-center py-3 rounded-2xl" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
              <Loader2 size={13} className="animate-spin" style={{ color: 'var(--text-tertiary)' }} />
              <span className="text-[10px] ml-2" style={{ color: 'var(--text-tertiary)' }}>사업보고서 정보 불러오는 중…</span>
            </div>
          )}

          {/* jp: 데이터 없을 때 안내 — 발행사/공시 유형에 맞는 문구 자동 선택 */}
          {!capLoading && !reportInfo.loading &&
           !hasReportData &&
           !(reportInfo.financials && (reportInfo.financials.consolidated || reportInfo.financials.separate)) &&
           classify && (
            <DetailUnavailableBox
              classification={classify}
              onOpenDart={() =>
                window.open(
                  `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${disclosure.receiptNo}`,
                  '_blank',
                  'noopener',
                )
              }
            />
          )}

          {/* jp: 주석 내용 검색 - 분석 완료 + 종목코드 있을 때, 탭 위 고정 */}
          {ai && disclosure.stockCode && /^(\uC0AC\uC5C5\uBCF4\uACE0\uC11C|\uBD84\uAE30\uBCF4\uACE0\uC11C|\uBC18\uAE30\uBCF4\uACE0\uC11C)/.test((disclosure.reportName || '').trim()) && (
            <div className="mt-3">
              <NotesSearchSection stockCode={disclosure.stockCode} stockName={disclosure.stockName} />
            </div>
          )}

          {/* 사업보고서 섹션 — 6개 탭 카드 상단 배치 */}
          {reportInfo.loading && (
            <div className="mt-3 rounded-2xl py-8 text-center" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
              <Loader2 size={18} className="animate-spin mx-auto mb-2" style={{ color: 'var(--text-tertiary)' }} />
              <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>재무정보 불러오는 중...</span>
            </div>
          )}
          {!reportInfo.loading && hasReportData && (() => {
            const TABS = [
              { key: 'capital' as const,     icon: <TrendingUp size={14} />, label: '자본금',   color: '#ffffff', hasData: !!(capItems && capItems.length > 0) },
              { key: 'investment' as const,  icon: <Building2 size={14} />, label: '출자현황', color: '#ffffff', hasData: reportInfo.investments.filter((it) => !isSummaryRow(it.corpName)).length > 0 },
              { key: 'bonds' as const,       icon: <FileText size={14} />,  label: '미상환사채', color: '#ffffff', hasData: reportInfo.bonds.length > 0 || reportInfo.bondDetails.length > 0 },
              { key: 'shareholder' as const, icon: <Users size={14} />,     label: '최대주주', color: '#ffffff', hasData: reportInfo.majorShareholders.filter((it) => !isSummaryRow(it.name)).length > 0 },
              { key: 'stock' as const,       icon: <PieChart size={14} />,  label: '주식총수', color: '#ffffff', hasData: reportInfo.stockTotal.length > 0 },
              { key: 'dividend' as const,    icon: <Coins size={14} />,     label: '배당이력', color: '#ffffff', hasData: reportInfo.dividends.filter((d) => d.thisYear || d.prevYear || d.prev2Year).length > 0 },
              { key: 'minority' as const,    icon: <Users size={14} />,     label: '소액주주', color: '#ffffff', hasData: reportInfo.minority.length > 0 },
            ].filter((t) => t.hasData);

            if (TABS.length === 0) return null;
            const validKey = TABS.find((t) => t.key === activeSection) ? activeSection : TABS[0].key;

            return (
              <div className="mt-3 rounded-2xl overflow-hidden" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', overflowX: 'auto', scrollbarWidth: 'none', borderBottom: '1px solid var(--border)' }}>
                  {TABS.map((tab, i) => {
                    const isActive = validKey === tab.key;
                    return (
                      <button key={tab.key}
                        onClick={() => setActiveSection(tab.key)}
                        className="active:scale-[0.97] transition-all"
                        style={{
                          flexShrink: 0,
                          minWidth: 60,
                          padding: '10px 12px 8px',
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                          border: 'none',
                          borderRight: i < TABS.length - 1 ? '1px solid var(--border)' : 'none',
                          background: isActive ? `${tab.color}18` : 'transparent',
                          position: 'relative',
                          cursor: 'pointer',
                        }}>
                        <span style={{ color: isActive ? tab.color : 'var(--text-tertiary)', display: 'flex' }}>{tab.icon}</span>
                        <span style={{ fontSize: 9, fontWeight: 700, color: isActive ? tab.color : 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>{tab.label}</span>
                        {isActive && (
                          <span style={{ position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: 18, height: 2, borderRadius: 99, background: tab.color }} />
                        )}
                      </button>
                    );
                  })}
                </div>

                <div>
                  {(() => {
                    const META_KEY: Record<string, string> = {
                      investment: 'investments',
                      shareholder: 'majorShareholders',
                      stock: 'stockTotal',
                      dividend: 'dividends',
                      minority: 'minority',
                    };
                    const metaKey = META_KEY[validKey];
                    if (!metaKey) return null;
                    const meta = reportInfo.sectionMeta?.[metaKey];
                    const badgeText = fallbackBadgeText(meta);
                    if (!badgeText) return null;
                    return (
                      <div className="mx-3.5 mt-3 px-3 py-2 rounded-lg flex items-center gap-1.5"
                        style={{ background: 'rgba(194,98,14,0.10)', border: '1px solid rgba(194,98,14,0.25)' }}>
                        <AlertTriangle size={12} style={{ color: '#e8893f', flexShrink: 0 }} />
                        <span className="text-[10.5px] leading-snug" style={{ color: 'var(--text-secondary)' }}>
                          이 공시에는 해당 정보가 없어 <span style={{ color: '#e8893f', fontWeight: 700 }}>{badgeText}</span> 데이터를 보여드려요
                        </span>
                      </div>
                    );
                  })()}
                  {validKey === 'capital'     && (
                    capLoading
                      ? <div className="px-3.5 py-6 text-center text-[11px]" style={{ color: 'var(--text-tertiary)' }}>불러오는 중...</div>
                      : <CapitalChangeVisual items={capItems ?? []} embedded />
                  )}
                  {validKey === 'investment'  && <InvestmentVisual items={reportInfo.investments} year={reportYear} embedded />}
                  {validKey === 'bonds'       && <BondsVisual items={reportInfo.bonds} details={reportInfo.bondDetails} />}
                  {validKey === 'shareholder' && <MajorShareholderVisual items={reportInfo.majorShareholders} year={reportYear} embedded />}
                  {validKey === 'stock'       && <StockTotalVisual items={reportInfo.stockTotal} year={reportYear} />}
                  {validKey === 'dividend'    && <DividendVisual items={reportInfo.dividends} year={reportYear} embedded />}
                  {validKey === 'minority'    && <MinorityVisual items={reportInfo.minority} year={reportYear} embedded />}
                </div>
              </div>
            );
          })()}

          {/* 연관 공시 */}
          {related.length > 0 && (
            <div className="mt-5">
              <div className="text-[11px] font-bold mb-2 flex items-center gap-1.5" style={{ color: 'var(--text-tertiary)' }}>
                <FileText size={12} /> {disclosure.stockName} 이전 공시
              </div>
              <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                {related.map((d, i) => (
                  <div key={d.receiptNo} className="flex items-center justify-between px-3.5 py-3"
                    style={{ borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
                    <span className="text-[12px] truncate flex-1 mr-2" style={{ color: 'var(--text-secondary)' }}>{d.reportName}</span>
                    <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--text-tertiary)' }}>
                      {d.disclosedAt?.slice(5, 10).replace('-', '.')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 공시 정보 */}
          <div className="text-[11px] font-bold mb-2 mt-5" style={{ color: 'var(--text-tertiary)' }}>공시 정보</div>
          <div className="flex gap-2">
            <div className="flex-1 p-3 rounded-xl" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
              <div className="text-[9.5px] mb-1" style={{ color: 'var(--text-tertiary)' }}>공시일</div>
              <div className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>{disclosure.disclosedAt?.slice(0, 10).replace(/-/g, '.')}</div>
            </div>
            <div className="flex-1 p-3 rounded-xl" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
              <div className="text-[9.5px] mb-1" style={{ color: 'var(--text-tertiary)' }}>접수번호</div>
              <div className="text-xs font-mono font-bold" style={{ color: 'var(--text-primary)' }}>{disclosure.receiptNo}</div>
            </div>
          </div>

          {error && <p className="text-[11px] mt-3 px-1" style={{ color: 'var(--text-tertiary)' }}>{error}</p>}
        </div>
      </div>

      <AuthModal open={showLogin} onClose={() => setShowLogin(false)} />

      {/* 하단 고정 버튼 */}
      <div className="absolute left-0 right-0 bottom-0 px-4 pt-4 pb-5 flex flex-col gap-2.5"
        style={{ background: 'linear-gradient(to top, var(--bg-primary) 78%, transparent)' }}>
        <a href={disclosure.originalUrl} target="_blank" rel="noopener noreferrer"
          className="w-full py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 active:scale-[0.99] transition-all"
          style={{ background: 'rgba(92,138,255,0.14)', border: '1px solid rgba(92,138,255,0.5)', color: '#5c8aff' }}>
          <ExternalLink size={16} /> DART 원문 보기
        </a>
      </div>
    </div>
  );
}
