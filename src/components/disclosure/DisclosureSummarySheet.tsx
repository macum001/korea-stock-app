// jp: 공시 상세 - 전체 화면 버전. 빈 칸을 콘텐츠로 채움:
// jp:   ① AI 미리보기 카드(분석 전) ② 과거 주가반응 통계 ③ 같은 종목 다른 공시
// jp: AI 분석 버튼 한 번으로 그 자리에서 분석. '이 종목 알림' 없음.
// jp: ★ 비회원은 AI 분석 차단(로그인 유도) / 뒤로가기 이색버튼 / 카테고리 한글
// jp: ★ 자본금 변동사항: 모든 공시에 DART irdsSttus API로 최근 5년 표시
import React, { useState, useEffect } from 'react';
import { Disclosure } from '@/types/disclosure';
import { apiClient } from '@/services/apiClient';
import { ImportantDisclosureBadge } from './ImportantDisclosureBadge';
import { DisclosureImpactStat } from './DisclosureImpactStat';
import { formatRelativeTime } from '@/utils/format';
import { useAuthStore } from '@/store/authStore';
import { AuthModal } from '@/components/auth/AuthModal';
import { ChevronLeft, ExternalLink, Sparkles, TrendingUp, Loader2, FileText, TrendingDown, Minus, ChevronDown, Users, PieChart, Coins, Building2, ShieldAlert, AlertTriangle } from 'lucide-react';

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

// jp: 자본금 변동 항목 타입
interface CapitalChangeItem {
  date: string;
  type: string;
  stockKind: string;
  quantity: string;
  issuePrice: string;
  direction: 'up' | 'down' | 'neutral';
}

// jp: ===== 정기보고서 5종 정보 타입 =====
interface InvestmentItem { corpName: string; purpose: string; amount: string; quantity: string; ratio: string; }
interface ShareholderItem { name: string; relate: string; stockKind: string; quantity: string; ratio: string; }
interface StockTotalItem { kind: string; issuedTotal: string; treasury: string; distributed: string; }
interface DividendItem { label: string; thisYear: string; prevYear: string; prev2Year: string; }
interface MinorityItem { label: string; shareholders: string; quantity: string; ratio: string; }

// jp: 자본잠식·상장폐지 위험 판정
interface FinRiskSignal { level: 'red' | 'yellow' | 'green'; text: string; }
interface FinancialRisk {
  year: number | null;
  overallLevel: 'red' | 'yellow' | 'green' | 'unknown';
  signals: FinRiskSignal[];
  impairmentRate?: number | null;
  debtRatio?: number | null;
}

interface ReportInfoState {
  investments: InvestmentItem[];
  majorShareholders: ShareholderItem[];
  stockTotal: StockTotalItem[];
  dividends: DividendItem[];
  minority: MinorityItem[];
  loading: boolean;
}

// jp: 요약행(합계/계/비고) 판별 → 강조 처리
function isSummaryRow(label: string): boolean {
  const s = (label || '').replace(/\s/g, '');
  return s === '합계' || s === '계' || s === '소계' || s === '비고' || s === '총계';
}
// jp: 줄바꿈 → 공백
function clean(s: string): string {
  return (s || '').replace(/\s*\n\s*/g, ' ').trim();
}


// jp: 발행 형태 → 색상
function directionStyle(direction: 'up' | 'down' | 'neutral'): { color: string; bg: string } {
  if (direction === 'up')   return { color: '#F9A8D4', bg: 'rgba(219,39,119,0.12)' };
  if (direction === 'down') return { color: '#A78BFA', bg: 'rgba(127,119,221,0.12)' };
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
  if (level.includes('긍정')) return { bg: 'rgba(244,114,166,0.18)', color: '#F9A8D4' };
  if (level.includes('부정')) return { bg: 'rgba(127,119,221,0.18)', color: '#A78BFA' };
  return { bg: 'var(--bg-elevated)', color: 'var(--text-secondary)' };
}

// jp: 탭 빈 상태 표시
function EmptyTab({ text }: { text: string }) {
  return (
    <div className="py-6 flex flex-col items-center gap-2">
      <FileText size={24} style={{ color: 'var(--border)' }} />
      <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{text}</span>
    </div>
  );
}

// jp: ===== 접이식 정보 섹션 (정기보고서 5종 공통) =====
function AccordionSection({
  icon, title, count, year, children,
}: {
  icon: React.ReactNode; title: string; count: number; year: number | null; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  if (count === 0) return null;
  return (
    <div className="mt-3 rounded-2xl overflow-hidden" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
      <button onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3.5 py-3 active:opacity-80 transition-opacity">
        <div className="flex items-center gap-2">
          <span style={{ color: '#A78BFA' }}>{icon}</span>
          <span className="text-[12px] font-bold" style={{ color: 'var(--text-primary)' }}>{title}</span>
          {year && <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(127,119,221,0.12)', color: 'var(--text-tertiary)' }}>{year}년</span>}
        </div>
        <ChevronDown size={15} style={{ color: 'var(--text-tertiary)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
      </button>
      {open && <div style={{ borderTop: '1px solid var(--border)' }}>{children}</div>}
    </div>
  );
}

export function DisclosureSummarySheet({ disclosure, isOpen, onClose }: DisclosureSummarySheetProps) {
  const [ai, setAi] = useState<ReturnType<typeof normalize> | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'summary'|'points'|'risks'|'timeline'>('summary');
  const [showMore, setShowMore] = useState(false);  // 정기보고서 5종 더보기
  const [error, setError] = useState('');
  // jp: 같은 종목 다른 공시
  const [related, setRelated] = useState<Disclosure[]>([]);
  // jp: 자본금 변동사항
  const [capItems, setCapItems] = useState<CapitalChangeItem[] | null>(null);
  const [capLoading, setCapLoading] = useState(false);
  // jp: 정기보고서 5종 정보
  const [reportInfo, setReportInfo] = useState<ReportInfoState>({
    investments: [], majorShareholders: [], stockTotal: [], dividends: [], minority: [], loading: false,
  });
  const [reportYear, setReportYear] = useState<number | null>(null);
  // jp: 자본잠식·상장폐지 위험
  const [finRisk, setFinRisk] = useState<FinancialRisk | null>(null);
  // jp: 로그인 상태 + 로그인 모달 (비회원 AI 분석 차단)
  const isLoggedIn = useAuthStore((s) => s.isAuthenticated);
  const [showLogin, setShowLogin] = useState(false);

  useEffect(() => {
    setAi(null); setError(''); setLoading(false); setRelated([]);
    setCapItems(null);
    setReportInfo({ investments: [], majorShareholders: [], stockTotal: [], dividends: [], minority: [], loading: false });
    setReportYear(null);
    setFinRisk(null);

    if (!isOpen || !disclosure) return;

    // jp: 같은 종목 최근 공시 가져오기 (현재 공시 제외 후 3건)
    if (disclosure.stockCode && /^\d{6}$/.test(disclosure.stockCode)) {
      const code = disclosure.stockCode;
      const cur = disclosure.receiptNo;
      apiClient.get<Disclosure[]>(`/api/disclosures/stock/${code}?limit=6&offset=0`)
        .then((list) => {
          const others = (list || []).filter((d) => d.receiptNo !== cur).slice(0, 3);
          setRelated(others);
        })
        .catch(() => setRelated([]));
    }

    // jp: 자본금 변동사항 조회 (모든 공시에 표시)
    if (disclosure.receiptNo) {
      setCapLoading(true);
      apiClient.get<{ items: CapitalChangeItem[] }>(`/api/capital-history/${disclosure.receiptNo}`)
        .then((res) => setCapItems(res?.items ?? []))
        .catch(() => setCapItems([]))
        .finally(() => setCapLoading(false));
    }

    // jp: 정기보고서 5종 정보 병렬 조회
    if (disclosure.receiptNo) {
      const rn = disclosure.receiptNo;
      setReportInfo((p) => ({ ...p, loading: true }));
      const fetchType = <T,>(type: string) =>
        apiClient.get<{ items: T[]; year: number | null }>(`/api/report-info/${rn}/${type}`)
          .then((res) => res ?? { items: [], year: null })
          .catch(() => ({ items: [] as T[], year: null }));

      Promise.all([
        fetchType<InvestmentItem>('investments'),
        fetchType<ShareholderItem>('major-shareholders'),
        fetchType<StockTotalItem>('stock-total'),
        fetchType<DividendItem>('dividends'),
        fetchType<MinorityItem>('minority'),
      ]).then(([inv, major, stock, div, minor]) => {
        setReportInfo({
          investments: inv.items, majorShareholders: major.items, stockTotal: stock.items,
          dividends: div.items, minority: minor.items, loading: false,
        });
        setReportYear(inv.year || major.year || stock.year || div.year || minor.year || null);
      });
    }
    // jp: 자본잠식·상장폐지 위험 판정
    if (disclosure.receiptNo) {
      apiClient.get<FinancialRisk>(`/api/report-info/${disclosure.receiptNo}/financial-risk`)
        .then((res) => setFinRisk(res ?? null))
        .catch(() => setFinRisk(null));
    }
  }, [disclosure?.receiptNo, disclosure?.stockCode, isOpen]);


  if (!isOpen || !disclosure) return null;

  const runAi = async () => {
    // jp: 비회원은 AI 분석 차단 → 로그인 유도
    if (!isLoggedIn) { setShowLogin(true); return; }
    setLoading(true); setError('');
    try {
      const res = await apiClient.post<AiResultRaw>(`/api/disclosures/${disclosure.receiptNo}/ai-summary`, {});
      const n = normalize(res);
      if (n.status === 'skipped') setError('AI 분석 기능이 현재 비활성화되어 있어요.');
      else if (n.status === 'failed' || (!n.summary && n.keyPoints.length === 0)) setError('AI 분석에 실패했어요. 잠시 후 다시 시도해주세요.');
      else { setAi(n); setActiveTab('summary'); }
    } catch {
      setError('AI 분석을 불러오지 못했어요.');
    } finally {
      setLoading(false);
    }
  };

  const imp = ai ? impactStyle(ai.impactLevel) : null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'var(--bg-primary)' }}>
      <div className="flex-1 overflow-y-auto pb-40">
        <header className="sticky top-0 z-20 px-4 pt-4 pb-3"
          style={{ background: 'radial-gradient(circle at 85% 0%, #6D28D9 0%, transparent 60%), var(--bg-primary)' }}>
          {/* jp: 이색 뒤로가기 - 글래스 + 그라데이션 테두리 (텍스트 없음) */}
          <button onClick={onClose} aria-label="닫기"
            className="w-[38px] h-[38px] rounded-[12px] flex items-center justify-center active:scale-95 transition-all"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid transparent',
              backgroundImage: 'linear-gradient(var(--bg-primary),var(--bg-primary)), linear-gradient(135deg,#7F77DD,#DB2777)',
              backgroundOrigin: 'border-box',
              backgroundClip: 'padding-box, border-box',
            }}>
            <ChevronLeft size={19} style={{ color: '#F9A8D4' }} />
          </button>
        </header>

        <div className="px-5">
          {/* 배지 */}
          <div className="flex items-center gap-2 mb-3 mt-1">
            <ImportantDisclosureBadge importance={disclosure.importance} sentiment={disclosure.sentiment} />
          </div>

          {/* 종목 · 시간 */}
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

          {/* AI 분석 결과 */}
          {/* ── AI 공시 분석: 자동 실행 + 4개 탭 ── */}
          {/* 분석 전: AI 분석 / DART 원문 버튼 */}
          {!ai && !loading && (
            <div className="mb-5 flex flex-col gap-2.5">
              <button onClick={runAi}
                className="flex items-center justify-center gap-2 py-3.5 rounded-2xl text-[13px] font-bold active:scale-[0.98] transition-all"
                style={{ background: 'linear-gradient(135deg,#7F77DD,#DB2777)', color: '#fff' }}>
                <Sparkles size={16} /> AI 공시분석 하기
              </button>
              <button onClick={() => window.open(`https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${disclosure.receiptNo}`, '_blank', 'noopener')}
                className="flex items-center justify-center gap-2 py-3.5 rounded-2xl text-[13px] font-bold active:scale-[0.98] transition-all"
                style={{ background: 'rgba(92,138,255,0.14)', border: '1px solid #5c8aff', color: '#8aa8ff' }}>
                <ExternalLink size={15} /> DART 원문 보기
              </button>
            </div>
          )}

          {loading && !ai && (
            <div className="mb-5 relative overflow-hidden p-5 rounded-2xl text-center flex flex-col items-center" style={{ background: 'linear-gradient(135deg, rgba(127,119,221,0.14), rgba(219,39,119,0.12))', border: '1px solid rgba(127,119,221,0.35)' }}>
              <div className="absolute top-0 h-full" style={{ left: '-40%', width: '40%', background: 'linear-gradient(90deg,transparent,rgba(127,119,221,0.18),transparent)', animation: 'dssSweep 1.8s linear infinite' }} />
              <div className="relative mb-3" style={{ width: 52, height: 52 }}>
                <div className="absolute inset-0 rounded-full" style={{ border: '2px solid #7F77DD', animation: 'dssRing 1.6s ease-out infinite' }} />
                <div className="absolute inset-0 rounded-full" style={{ border: '2px solid #DB2777', animation: 'dssRing 1.6s ease-out infinite', animationDelay: '0.8s' }} />
                <div className="absolute rounded-full flex items-center justify-center" style={{ inset: 15, background: 'linear-gradient(135deg,#7F77DD,#DB2777)' }}>
                  <Sparkles size={17} color="#fff" />
                </div>
              </div>
              <p className="relative text-[14px] font-extrabold" style={{ color: 'var(--text-primary)' }}>AI가 공시를 분석하고 있어요</p>
              <p className="relative text-[11px] mt-1" style={{ color: '#A78BFA' }}>잠시만 기다려주세요…</p>
              <style>{`@keyframes dssRing{0%{transform:scale(0.7);opacity:0.8}100%{transform:scale(1.8);opacity:0}}@keyframes dssSweep{0%{left:-40%}100%{left:100%}}`}</style>
            </div>
          )}

          {ai && (
            <div className="mb-5 rounded-2xl overflow-hidden" style={{ background: 'linear-gradient(135deg, rgba(127,119,221,0.10), rgba(219,39,119,0.08))', border: '1px solid rgba(127,119,221,0.25)' }}>
              <div className="flex items-center gap-2.5 px-4 py-3" style={{ borderBottom: '1px solid rgba(127,119,221,0.18)' }}>
                <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg,#7F77DD,#DB2777)' }}>
                  <Sparkles size={14} color="#fff" />
                </div>
                <span className="text-[12px] font-extrabold" style={{ color: 'var(--text-primary)' }}>AI 공시 분석</span>
              </div>

              {/* 슬롯① 판정 배지 + 결론 한 문장 */}
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

              <div className="flex gap-1 px-2.5 py-2" style={{ borderBottom: '1px solid rgba(127,119,221,0.18)' }}>
                {([
                  { key: 'summary', label: '핵심요약' },
                  { key: 'points', label: '투자포인트' },
                  { key: 'risks', label: '리스크' },
                  { key: 'timeline', label: '일정확인' },
                ] as const).map((t) => {
                  const on = activeTab === t.key;
                  const isRisk = t.key === 'risks';
                  return (
                    <button key={t.key} onClick={() => setActiveTab(t.key)}
                      className="flex-1 py-1.5 rounded-lg text-[11px] font-bold active:scale-95 transition-all"
                      style={{ color: on ? '#fff' : 'var(--text-tertiary)', background: on ? (isRisk ? '#ff5252' : 'linear-gradient(135deg,#7F77DD,#DB2777)') : 'transparent' }}>
                      {t.label}
                    </button>
                  );
                })}
              </div>

              <div className="px-4 py-3.5">
                {activeTab === 'summary' && (
                  <>
                    {ai.summary && <p className="text-[13px] font-bold mb-2.5 leading-relaxed" style={{ color: 'var(--text-primary)' }}>{ai.summary}</p>}
                    {ai.detail && <p className="text-[12px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{ai.detail}</p>}
                    {ai.keyNumbers && ai.keyNumbers.length > 0 && (() => {
                      // jp: 대표 수치 선정 — 비율/할인율/할증률/할인 키워드 우선, 없으면 첫 번째
                      const nums = ai.keyNumbers as { label: string; value: string }[];
                      const PRIMARY_RE = /비율|할인율|할증률|할인|희석|증감률|수익률/;
                      const primaryIdx = nums.findIndex((n) => PRIMARY_RE.test(n.label));
                      const pIdx = primaryIdx >= 0 ? primaryIdx : 0;
                      const primary = nums[pIdx];
                      const rest = nums.filter((_, i) => i !== pIdx);
                      // jp: 대표 수치가 위험성(할인/희석)이면 빨강, 아니면 보라
                      const isWarn = /할인|희석/.test(primary.label);
                      return (
                        <div className="mt-3">
                          {/* 대표 수치 강조 */}
                          <div className="flex items-center gap-3 px-3.5 py-3 rounded-xl mb-2"
                            style={{ background: isWarn ? 'linear-gradient(135deg,rgba(255,82,82,0.14),rgba(219,39,119,0.10))' : 'linear-gradient(135deg,rgba(127,119,221,0.18),rgba(219,39,119,0.12))', border: isWarn ? '1px solid rgba(255,82,82,0.3)' : '1px solid rgba(127,119,221,0.35)' }}>
                            <div className="w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0" style={{ background: isWarn ? '#ff5252' : 'linear-gradient(135deg,#7F77DD,#DB2777)' }}>
                              {isWarn ? <TrendingDown size={17} color="#fff" /> : <TrendingUp size={17} color="#fff" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-[10px] font-semibold" style={{ color: isWarn ? '#F9A8D4' : '#A78BFA' }}>{primary.label}</div>
                              <div className="text-[19px] font-extrabold leading-tight truncate" style={{ color: 'var(--text-primary)' }}>{primary.value}</div>
                            </div>
                          </div>
                          {/* 슬롯③ 사업부문 비중 막대 — value에 괄호% 있는 항목 3개+ */}
                          {(() => {
                            const SEG_RE = /\(([\d.]+)\s*%\)/;
                            const segs = nums
                              .map((n) => { const m = n.value.match(SEG_RE); return m ? { label: n.label.replace(/\s*매출\s*$/, ''), value: n.value, pct: parseFloat(m[1]) } : null; })
                              .filter((x): x is { label: string; value: string; pct: number } => x !== null);
                            if (segs.length < 3) return null;
                            const COLORS = ['#7F77DD', '#5DCAA5', '#f5c451', '#F472B6', '#5c8aff', '#e08a5a'];
                            return (
                              <div className="mb-2 px-3.5 py-3 rounded-xl" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                                <div className="text-[10px] font-semibold mb-2" style={{ color: 'var(--text-tertiary)' }}>사업부문별 비중</div>
                                <div className="flex rounded-md overflow-hidden mb-2.5" style={{ height: 9 }}>
                                  {segs.map((s, i) => (
                                    <div key={i} style={{ width: `${s.pct}%`, background: COLORS[i % COLORS.length], marginLeft: i === 0 ? 0 : 2 }} />
                                  ))}
                                </div>
                                <div className="flex flex-col gap-1.5">
                                  {segs.map((s, i) => (
                                    <div key={i} className="flex items-center gap-2">
                                      <span style={{ width: 8, height: 8, borderRadius: 2, background: COLORS[i % COLORS.length], flexShrink: 0 }} />
                                      <span className="flex-1 text-[11px] truncate" style={{ color: 'var(--text-secondary)' }}>{s.label}</span>
                                      <span className="text-[11px] font-bold" style={{ color: 'var(--text-primary)' }}>{s.value}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })()}
                          {/* 나머지 수치 리스트 */}
                          {rest.length > 0 && (
                            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                              {rest.map((kn, i) => (
                                <div key={i} className="flex items-center gap-2 px-3.5 py-2.5"
                                  style={{ background: 'var(--bg-elevated)', borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
                                  <span className="flex-1 text-[12px]" style={{ color: 'var(--text-secondary)' }}>{kn.label}</span>
                                  <span className="text-[13px] font-bold" style={{ color: 'var(--text-primary)' }}>{kn.value}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                    {!ai.summary && !ai.detail && <EmptyTab text="요약 정보가 없어요" />}
                  </>
                )}

                {activeTab === 'points' && (
                  <>
                    {ai.investorNote && <p className="text-[12px] leading-relaxed mb-3" style={{ color: 'var(--text-secondary)' }}>{ai.investorNote}</p>}
                    {!ai.investorNote && <EmptyTab text="투자 포인트 정보가 없어요" />}
                  </>
                )}

                {activeTab === 'risks' && (
                  <>
                    {ai.riskSignals && ai.riskSignals.length > 0 ? (
                      <div className="flex flex-col gap-2">
                        {ai.riskSignals.map((rs: { level: string; text: string }, i: number) => {
                          const c = rs.level === 'red' ? { dot: '#F87171', bg: 'rgba(248,113,113,0.10)' } : rs.level === 'yellow' ? { dot: '#FBBF24', bg: 'rgba(251,191,36,0.10)' } : { dot: '#34D399', bg: 'rgba(52,211,153,0.10)' };
                          return (
                            <div key={i} className="flex gap-2 items-start p-2.5 rounded-lg" style={{ background: c.bg }}>
                              <span style={{ width: 8, height: 8, borderRadius: 99, background: c.dot, marginTop: 5, flexShrink: 0 }} />
                              <span className="text-[12px] leading-relaxed" style={{ color: 'var(--text-primary)' }}>{rs.text}</span>
                            </div>
                          );
                        })}
                      </div>
                    ) : <EmptyTab text="특별한 리스크 신호가 없어요" />}
                  </>
                )}

                {activeTab === 'timeline' && (
                  <>
                    {ai.timeline ? (
                      <div className="flex gap-2 p-2.5 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)' }}>
                        <FileText size={14} style={{ color: '#A78BFA', marginTop: 2, flexShrink: 0 }} />
                        <span className="text-[12px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{ai.timeline}</span>
                      </div>
                    ) : <EmptyTab text="이 공시는 별도 일정 정보가 없어요" />}
                  </>
                )}
              </div>
            </div>
          )}

          {!ai && !loading && !isLoggedIn && (
            <div className="mb-5 p-5 rounded-2xl text-center" style={{ background: 'linear-gradient(135deg, rgba(127,119,221,0.12), rgba(219,39,119,0.10))', border: '1px solid rgba(127,119,221,0.25)' }}>
              <div className="w-11 h-11 rounded-full flex items-center justify-center mx-auto mb-2.5" style={{ background: 'linear-gradient(135deg,#7F77DD,#DB2777)' }}>
                <Sparkles size={18} color="#fff" />
              </div>
              <p className="text-[13px] font-extrabold mb-1.5" style={{ color: 'var(--text-primary)' }}>로그인하면 AI 분석을 볼 수 있어요</p>
              <button onClick={() => setShowLogin(true)} className="mt-2 px-5 py-2 rounded-xl text-[12px] font-bold active:scale-95 transition-all" style={{ background: 'linear-gradient(135deg,#7F77DD,#DB2777)', color: '#fff' }}>
                로그인하기
              </button>
            </div>
          )}

          {/* ── 자본잠식·상장폐지 위험 ── */}
          {finRisk && finRisk.signals && finRisk.signals.length > 0 && (() => {
            const lv = finRisk.overallLevel;
            const head = lv === 'red'
              ? { color: '#F87171', bg: 'rgba(248,113,113,0.10)', border: 'rgba(248,113,113,0.30)', label: '상장폐지·자본잠식 위험' }
              : lv === 'yellow'
              ? { color: '#FBBF24', bg: 'rgba(251,191,36,0.08)', border: 'rgba(251,191,36,0.25)', label: '재무 주의 신호' }
              : { color: '#34D399', bg: 'rgba(52,211,153,0.08)', border: 'rgba(52,211,153,0.20)', label: '재무 안전성 점검' };
            return (
              <div className="mb-5 rounded-2xl overflow-hidden" style={{ background: head.bg, border: `1px solid ${head.border}` }}>
                <div className="flex items-center gap-2 px-3.5 py-2.5" style={{ borderBottom: `1px solid ${head.border}` }}>
                  <ShieldAlert size={15} style={{ color: head.color }} />
                  <span className="text-[12px] font-extrabold" style={{ color: head.color }}>{head.label}</span>
                  {finRisk.year && <span className="text-[9px] px-1.5 py-0.5 rounded ml-auto" style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--text-tertiary)' }}>{finRisk.year}년 재무</span>}
                </div>
                <div className="px-3.5 py-2.5 flex flex-col gap-2">
                  {finRisk.signals.map((s, i) => {
                    const c = s.level === 'red' ? '#F87171' : s.level === 'yellow' ? '#FBBF24' : '#34D399';
                    return (
                      <div key={i} className="flex gap-2 items-start">
                        <span style={{ width: 8, height: 8, borderRadius: 99, background: c, marginTop: 5, flexShrink: 0 }} />
                        <span className="text-[12px] leading-relaxed" style={{ color: 'var(--text-primary)' }}>{s.text}</span>
                      </div>
                    );
                  })}
                  <p className="text-[10px] mt-1" style={{ color: 'var(--text-tertiary)' }}>
                    DART 재무제표 기준 자동 판정이에요. 정확한 상장폐지 요건은 거래소 공시를 확인하세요.
                  </p>
                </div>
              </div>
            );
          })()}

          {/* 기본 요약 */}
          <div className="text-[11px] font-bold mb-2" style={{ color: 'var(--text-tertiary)' }}>한 줄 요약</div>
          <p className="text-sm leading-relaxed p-4 rounded-2xl mb-5" style={{ color: 'var(--text-secondary)', background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
            {disclosure.summary}
          </p>

          {/* ── 빈칸 채움 ②: 과거 주가반응 통계 ── */}
          <DisclosureImpactStat receiptNo={disclosure.receiptNo} />

          {/* ── 자본금 변동사항 (접이식) ── */}
          {capLoading && (
            <div className="mt-3 flex items-center justify-center py-3 rounded-2xl" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
              <Loader2 size={13} className="animate-spin" style={{ color: 'var(--text-tertiary)' }} />
              <span className="text-[10px] ml-2" style={{ color: 'var(--text-tertiary)' }}>자본금 변동사항 불러오는 중…</span>
            </div>
          )}
          <AccordionSection icon={<TrendingUp size={13} />} title="자본금 변동사항 (최근 5년)" count={capItems ? capItems.length : 0} year={null}>
            {(capItems || []).map((item, i) => {
              const st = directionStyle(item.direction);
              const Icon = item.direction === 'up' ? TrendingUp : item.direction === 'down' ? TrendingDown : Minus;
              return (
                <div key={i} className="flex items-start gap-3 px-3.5 py-3" style={{ borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: st.bg }}>
                    <Icon size={11} style={{ color: st.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[12px] font-bold truncate" style={{ color: st.color }}>{item.type}</span>
                      <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--text-tertiary)' }}>{item.date}</span>
                    </div>
                    <div className="flex gap-3 mt-0.5 flex-wrap">
                      {item.stockKind && <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>{item.stockKind}</span>}
                      {item.quantity && item.quantity !== '-' && <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>{item.quantity}주</span>}
                      {item.issuePrice && item.issuePrice !== '-' && <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>주당 {item.issuePrice}원</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </AccordionSection>

          {/* ── 정기보고서 5종 정보 (접이식) ── */}
          {reportInfo.loading && (
            <div className="mt-3 flex items-center justify-center py-3 rounded-2xl" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
              <Loader2 size={13} className="animate-spin" style={{ color: 'var(--text-tertiary)' }} />
              <span className="text-[10px] ml-2" style={{ color: 'var(--text-tertiary)' }}>기업정보 불러오는 중…</span>
            </div>
          )}

          {/* ── 정기보고서 5종: 더보기 토글 ── */}
          <div style={{ position: "relative", maxHeight: showMore ? "none" : 64, overflow: "hidden", transition: "max-height 0.2s" }}>
          {/* ① 타법인 출자현황 */}
          <AccordionSection icon={<Building2 size={13} />} title="타법인 출자현황" count={reportInfo.investments.length} year={reportYear}>
            {reportInfo.investments.map((it, i) => {
              const summary = isSummaryRow(it.corpName);
              return (
                <div key={i} className="px-3.5 py-2.5" style={{ borderTop: i === 0 ? 'none' : '1px solid var(--border)', background: summary ? 'rgba(127,119,221,0.06)' : 'transparent' }}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12px] font-bold truncate" style={{ color: summary ? '#A78BFA' : 'var(--text-primary)' }}>{clean(it.corpName)}</span>
                    {it.ratio && <span className="text-[11px] font-bold flex-shrink-0" style={{ color: '#F9A8D4' }}>{it.ratio}%</span>}
                  </div>
                  <div className="flex gap-2 mt-0.5 flex-wrap">
                    {it.purpose && <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>{clean(it.purpose)}</span>}
                    {it.amount && <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>장부가 {it.amount}원</span>}
                  </div>
                </div>
              );
            })}
          </AccordionSection>

          {/* ② 최대주주 현황 */}
          <AccordionSection icon={<Users size={13} />} title="최대주주 현황" count={reportInfo.majorShareholders.length} year={reportYear}>
            {reportInfo.majorShareholders.map((it, i) => {
              const summary = isSummaryRow(it.name);
              return (
                <div key={i} className="px-3.5 py-2.5" style={{ borderTop: i === 0 ? 'none' : '1px solid var(--border)', background: summary ? 'rgba(127,119,221,0.06)' : 'transparent' }}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12px] font-bold truncate" style={{ color: summary ? '#A78BFA' : 'var(--text-primary)' }}>{clean(it.name)}</span>
                    {it.ratio && <span className="text-[11px] font-bold flex-shrink-0" style={{ color: '#F9A8D4' }}>{it.ratio}%</span>}
                  </div>
                  <div className="flex gap-2 mt-0.5 flex-wrap">
                    {it.relate && <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>{clean(it.relate)}</span>}
                    {it.stockKind && <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>{it.stockKind}</span>}
                    {it.quantity && <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>{it.quantity}주</span>}
                  </div>
                </div>
              );
            })}
          </AccordionSection>

          {/* ③ 주식의 총수 */}
          <AccordionSection icon={<PieChart size={13} />} title="주식의 총수" count={reportInfo.stockTotal.length} year={reportYear}>
            {reportInfo.stockTotal.map((it, i) => {
              const summary = isSummaryRow(it.kind);
              return (
                <div key={i} className="px-3.5 py-2.5" style={{ borderTop: i === 0 ? 'none' : '1px solid var(--border)', background: summary ? 'rgba(127,119,221,0.06)' : 'transparent' }}>
                  <div className="text-[12px] font-bold mb-1" style={{ color: summary ? '#A78BFA' : 'var(--text-primary)' }}>{clean(it.kind)}</div>
                  <div className="flex gap-3 flex-wrap">
                    {it.issuedTotal && <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>발행 {it.issuedTotal}주</span>}
                    {it.distributed && <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>유통 {it.distributed}주</span>}
                    {it.treasury && <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>자기주식 {it.treasury}주</span>}
                  </div>
                </div>
              );
            })}
          </AccordionSection>

          {/* ④ 배당 이력 */}
          <AccordionSection icon={<Coins size={13} />} title="배당 이력" count={reportInfo.dividends.filter((d) => d.thisYear || d.prevYear || d.prev2Year).length} year={reportYear}>
            <div className="px-3.5 py-2">
              <div className="flex text-[9px] font-bold pb-1.5 mb-1" style={{ color: 'var(--text-tertiary)', borderBottom: '1px solid var(--border)' }}>
                <span className="flex-1">항목</span>
                <span className="w-16 text-right">당기</span>
                <span className="w-16 text-right">전기</span>
                <span className="w-16 text-right">전전기</span>
              </div>
              {reportInfo.dividends.filter((d) => d.thisYear || d.prevYear || d.prev2Year).map((it, i) => (
                <div key={i} className="flex items-center text-[10px] py-1">
                  <span className="flex-1 truncate" style={{ color: 'var(--text-secondary)' }}>{clean(it.label)}</span>
                  <span className="w-16 text-right font-bold" style={{ color: 'var(--text-primary)' }}>{it.thisYear || '-'}</span>
                  <span className="w-16 text-right" style={{ color: 'var(--text-tertiary)' }}>{it.prevYear || '-'}</span>
                  <span className="w-16 text-right" style={{ color: 'var(--text-tertiary)' }}>{it.prev2Year || '-'}</span>
                </div>
              ))}
            </div>
          </AccordionSection>

          {/* ⑤ 소액주주 현황 */}
          <AccordionSection icon={<Users size={13} />} title="소액주주 현황" count={reportInfo.minority.length} year={reportYear}>
            {reportInfo.minority.map((it, i) => (
              <div key={i} className="px-3.5 py-2.5" style={{ borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] font-bold" style={{ color: 'var(--text-primary)' }}>{clean(it.label)}</span>
                  {it.ratio && <span className="text-[11px] font-bold flex-shrink-0" style={{ color: '#F9A8D4' }}>{it.ratio}</span>}
                </div>
                <div className="flex gap-3 mt-0.5 flex-wrap">
                  {it.shareholders && <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>{it.shareholders}명</span>}
                  {it.quantity && <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>{it.quantity}주 보유</span>}
                </div>
              </div>
            ))}
          </AccordionSection>
            {!showMore && (
              <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 48, background: "linear-gradient(to bottom, transparent, var(--bg-primary))", pointerEvents: "none" }} />
            )}
          </div>
          <button onClick={() => setShowMore((v) => !v)}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 mt-2 rounded-xl active:scale-[0.99] transition-all"
            style={{ background: "rgba(127,119,221,0.08)", border: "1px solid rgba(127,119,221,0.2)" }}>
            <span className="text-[11px] font-bold" style={{ color: "#A78BFA" }}>
              {showMore ? "접기" : "출자현황·최대주주·배당이력 등 더보기"}
            </span>
            <ChevronDown size={13} style={{ color: "#A78BFA", transform: showMore ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
          </button>
          {related.length > 0 && (
            <div className="mt-5">
              <div className="text-[11px] font-bold mb-2 flex items-center gap-1.5" style={{ color: 'var(--text-tertiary)' }}>
                <FileText size={12} /> {disclosure.stockName} 다른 공시
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
              <div className="text-[9.5px] mb-1" style={{ color: 'var(--text-tertiary)' }}>접수일</div>
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

      {/* jp: 비회원 로그인 유도 모달 */}
      <AuthModal open={showLogin} onClose={() => setShowLogin(false)} />

      {/* 하단 고정 액션바 */}
      <div className="absolute left-0 right-0 bottom-0 px-4 pt-4 pb-5 flex flex-col gap-2.5"
        style={{ background: 'linear-gradient(to top, var(--bg-primary) 78%, transparent)' }}>
        <a href={disclosure.originalUrl} target="_blank" rel="noopener noreferrer"
          className="w-full py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 active:scale-[0.99] transition-all"
          style={{ background: 'var(--bg-elevated)', color: 'var(--accent)', border: '1px solid var(--border)' }}>
          <ExternalLink size={16} /> DART 원문 보기
        </a>
      </div>
    </div>
  );
}