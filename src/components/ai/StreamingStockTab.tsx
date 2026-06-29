// jp: 스트리밍 종목분석 StockTab 교체 컴포넌트
// jp: 기존 aiService.analyzeStock → useStreamAnalysis 훅으로 교체
// jp: 타이핑 효과 + 단계별 상태 표시

import { useState, useEffect } from 'react';
import {
  ArrowRight, Sparkles, TrendingUp, TrendingDown, Info, X,
} from 'lucide-react';
import { useStreamAnalysis } from '@/hooks/useStreamAnalysis';
import { StockAnalysisResult } from '@/services/aiService';
import { RecentAnalysis } from '@/components/ai/RecentAnalysis';
import { AuthModal } from '@/components/auth/AuthModal';
import { useAuthStore } from '@/store/authStore';
import { apiClient } from '@/services/apiClient';

const C = {
  purple: '#ffffff',
  pink: '#ffffff',
  green: '#ffffff',
  amber: '#ffffff',
  heroGrad: '#161B22',
  btnGrad: '#ffffff',
};

const FALLBACK_EXAMPLES = [
  { text: '삼성전자 지금 어때?', sub: '기업 현황 종합 분석' },
  { text: '에코프로 재무 상태 분석해줘', sub: '재무 + 리스크 분석' },
  { text: 'SK하이닉스 최근 실적이랑 전망은?', sub: '실적 + 전망 분석' },
  { text: '현대차 공시랑 뉴스 종합해줘', sub: '공시 + 뉴스 크로스체크' },
  { text: '삼성바이오로직스 뭐하는 회사야?', sub: '기업 개요 + 사업 분석' },
];

// jp: 스트리밍 중 타이핑 커서 효과
// jp: 스트리밍 상태 표시 카드 (타이핑 애니메이션)
function StreamingCard({
  statusText,
  meta,
  isDone,
  onTypingComplete,
}: {
  statusText: string;
  meta: Partial<StockAnalysisResult> | null;
  isDone: boolean;
  onTypingComplete: () => void;
}) {
  // jp: done이면 결과 카드로 전환 (스트리밍 텍스트를 화면에 안 보여주므로 타이핑 대기 불필요)
  useEffect(() => {
    if (isDone) {
      const t = setTimeout(() => onTypingComplete(), 200);
      return () => clearTimeout(t);
    }
  }, [isDone, onTypingComplete]);

  return (
    <div className="rounded-[16px] p-4 mb-3" style={{ background: 'var(--bg-elevated)', border: `1px solid ${C.purple}40` }}>
      {/* jp: 종목 헤더 */}
      {meta?.stockName && (
        <div className="flex items-center gap-2 mb-3">
          <div className="w-2 h-2 rounded-full" style={{ background: C.purple, animation: 'aiBlink 1s infinite' }} />
          <p className="text-[14px] font-bold" style={{ color: 'var(--text-primary)' }}>{meta.stockName}</p>
          {meta.price && (
            <p className="text-[12px] ml-auto tabular-nums" style={{ color: meta.price.changeRate > 0 ? 'var(--rise)' : meta.price.changeRate < 0 ? 'var(--fall)' : 'var(--text-tertiary)' }}>
              {meta.price.current.toLocaleString()}원
            </p>
          )}
        </div>
      )}

      {/* jp: 상태 텍스트 - 분석 완료(isDone) 전까지 계속 로딩 표시 (시세가 먼저 와도 유지) */}
      {!isDone && (
        <div
          className="relative overflow-hidden rounded-[14px] mb-2 px-4 py-5 flex flex-col items-center text-center"
          style={{ background: 'rgba(255,255,255,0.08)', border: `1px solid ${C.purple}4d` }}
        >
          {/* 빛 스윕 */}
          <div
            className="absolute top-0 h-full"
            style={{ left: '-40%', width: '40%', background: 'linear-gradient(90deg,transparent,rgba(255,255,255,0.18),transparent)', animation: 'aiSweep 1.8s linear infinite' }}
          />
          {/* 확산 링 + 코어 */}
          <div className="relative mb-3" style={{ width: 50, height: 50 }}>
            <div className="absolute inset-0 rounded-full" style={{ border: `2px solid ${C.purple}`, animation: 'aiRing 1.6s ease-out infinite' }} />
            <div className="absolute inset-0 rounded-full" style={{ border: '2px solid rgba(255,255,255,0.4)', animation: 'aiRing 1.6s ease-out infinite', animationDelay: '0.8s' }} />
            <div className="absolute rounded-full flex items-center justify-center" style={{ inset: 14, background: '#ffffff' }}>
              <Sparkles size={16} color="#000" />
            </div>
          </div>
          <p className="relative text-[14px] font-bold" style={{ color: 'var(--text-primary)' }}>AI 분석 진행 중</p>
          <p className="relative text-[11px] mt-1" style={{ color: C.purple }}>{statusText || '잠시만 기다려주세요...'}</p>
        </div>
      )}

      {/* jp: 스트리밍 중에는 위 로딩 애니메이션만 표시 (JSON 원본 노출 방지) */}
    </div>
  );
}

export function StreamingStockTab({
  onOpenDisclosure,
}: {
  onOpenDisclosure?: (r: string, c: string, n?: string) => void;
}) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const token = useAuthStore((s) => s.accessToken);
  const [input, setInput] = useState('');
  // jp: 멀티턴 대화 맥락 (이전 분석 요약 누적)
  const [conversationContext, setConversationContext] = useState('');
  const [showLogin, setShowLogin] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [examples, setExamples] = useState(FALLBACK_EXAMPLES);

  const { state, analyze, reset } = useStreamAnalysis();

  useEffect(() => {
    apiClient.get<{ text: string; sub: string }[]>('/api/ai/daily-examples')
      .then((data) => { if (Array.isArray(data) && data.length > 0) setExamples(data); })
      .catch(() => { /* 대체 예시 사용 */ });
  }, []);

  // jp: 분석 완료 시 히스토리 새로고침 + 대화 맥락 누적
  useEffect(() => {
    if (state.status === 'done' && state.result) {
      setRefreshKey((k) => k + 1);
      // jp: 이전 맥락 + 이번 분석 요약을 다음 질문용 맥락으로 저장
      const r = state.result;
      const summary = `[${r.stockName}] ${r.analysis?.summary ?? ''} (${r.analysis?.impactLabel ?? ''})`;
      setConversationContext((prev) => {
        const combined = prev ? `${prev}\n${summary}` : summary;
        // jp: 최근 3개 분석만 유지 (토큰 절약)
        const lines = combined.split('\n');
        return lines.slice(-3).join('\n');
      });
    }
  }, [state.status, state.result]);

  const handleAnalyze = async (q: string) => {
    if (!q.trim() || state.status === 'streaming' || state.status === 'connecting') return;
    if (!isAuthenticated) { setShowLogin(true); return; }
    // jp: 멀티턴 - 이전 맥락과 함께 전송
    await analyze(q.trim(), token ?? undefined, conversationContext || undefined);
  };

  const [typingComplete, setTypingComplete] = useState(false);

  // jp: 새 분석 시작하면 타이핑 완료 플래그 리셋
  useEffect(() => {
    if (state.status === 'connecting' || state.status === 'streaming') {
      setTypingComplete(false);
    }
  }, [state.status]);

  // jp: 안전장치 - done 후 3초 지나면 무조건 결과 표시 (무한로딩 방지)
  useEffect(() => {
    if (state.status === 'done' && !typingComplete) {
      const t = setTimeout(() => setTypingComplete(true), 3000);
      return () => clearTimeout(t);
    }
  }, [state.status, typingComplete]);

  const isLoading = state.status === 'connecting' || state.status === 'streaming';
  // jp: done이어도 타이핑 안 끝났으면 스트리밍 카드 유지
  const showStreaming = state.status === 'connecting' || state.status === 'streaming' || (state.status === 'done' && !typingComplete);
  const showResult = state.status === 'done' && typingComplete && state.result;

  return (
    <div className="px-4 pt-[18px] pb-6">
      {/* jp: 입력창 */}
      <div className="flex gap-2 mb-[9px]">
        <div className="flex-1 relative">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="종목명 또는 질문을 입력"
            className="w-full px-4 py-[14px] rounded-[14px] text-[13px] outline-none"
            style={{
              background: 'var(--bg-elevated)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border)',
              paddingRight: input ? 38 : 16,
            }}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleAnalyze(input); }}
          />
          {/* jp: 입력 내용 한번에 지우기 버튼 */}
          {input && (
            <button
              onClick={() => setInput('')}
              className="absolute top-1/2 -translate-y-1/2 flex items-center justify-center"
              style={{ right: 12, width: 20, height: 20, borderRadius: 10, background: 'var(--bg-secondary)' }}
              aria-label="입력 지우기"
            >
              <X size={12} color="var(--text-tertiary)" />
            </button>
          )}
        </div>
        <button
          onClick={() => isLoading ? reset() : void handleAnalyze(input)}
          className="w-[50px] rounded-[14px] flex items-center justify-center"
          style={{ background: isLoading ? 'rgba(255,255,255,0.3)' : C.btnGrad }}
        >
          {isLoading
            ? <X size={16} color={C.purple} />
            : <ArrowRight size={16} color="#000" />
          }
        </button>
      </div>
      <p className="text-[10px] flex items-center gap-1 mb-[18px]" style={{ color: 'var(--text-tertiary)' }}>
        <Sparkles size={11} /> 종목명·코드 입력 또는 자연어로 질문하세요
      </p>

      {/* jp: 입력 전 안내 - 기능 소개 + 사용법 + 예시 (AI 기업분석 사용설명서) */}
      {state.status === 'idle' && (
        <>
          {/* jp: 제목 + 한 줄 소개 */}
          <div className="text-center mb-4">
            <p className="text-[16px] font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>📊 AI 기업분석</p>
            <p className="text-[13px] leading-[1.6]" style={{ color: 'var(--text-tertiary)' }}>
              종목 하나로 기업의 현재 상황을<br />AI가 한 번에 정리해드려요
            </p>
          </div>

          {/* jp: 기능 2x2 카드 */}
          <div className="grid grid-cols-2 gap-2 mb-[18px]">
            {[
              { emoji: '🏢', title: '기업 개요', sub: '뭐하는 회사인지' },
              { emoji: '📈', title: '재무 현황', sub: '매출·영업이익' },
              { emoji: '⚠️', title: '조심할 것', sub: '리스크 요인' },
              { emoji: '👀', title: '지켜볼 사항', sub: '주목 포인트' },
            ].map((f) => (
              <div key={f.title} className="rounded-[10px] p-3" style={{ background: '#e8893f' }}>
                <p className="text-[15px] mb-1">{f.emoji}</p>
                <p className="text-[13px] font-semibold" style={{ color: '#ffffff' }}>{f.title}</p>
                <p className="text-[11px] mt-0.5" style={{ color: '#ffe0bf' }}>{f.sub}</p>
              </div>
            ))}
          </div>

          {/* jp: 사용법 3단계 */}
          <div className="rounded-[14px] p-4 mb-[18px]" style={{ background: 'var(--bg-secondary)' }}>
            <p className="text-[13px] font-semibold mb-3 flex items-center gap-1.5" style={{ color: 'var(--text-primary)' }}>
              💡 이렇게 사용하세요
            </p>
            <div className="flex flex-col gap-2.5">
              {[
                '종목명이나 코드를 입력 (삼성전자, 005930)',
                '기업 개요·재무·공시·뉴스를 AI가 종합 분석',
                '조심할 것·지켜볼 사항까지 한눈에 확인',
              ].map((step, i) => (
                <div key={i} className="flex gap-2.5 items-start">
                  <span className="flex items-center justify-center flex-shrink-0 text-[11px] font-bold text-white"
                    style={{ width: 20, height: 20, borderRadius: '50%', background: '#e8893f' }}>{i + 1}</span>
                  <p className="text-[13px] leading-[1.6]" style={{ color: 'var(--text-secondary)' }}>{step}</p>
                </div>
              ))}
            </div>
          </div>

          {/* jp: 예시 - 누르면 입력창에 채워짐 */}
          <p className="text-[12px] mb-2" style={{ color: 'var(--text-tertiary)' }}>예시로 시작해보세요</p>
          <div className="flex flex-col gap-2 mb-5">
            {examples.map((ex) => (
              <button
                key={ex.text}
                onClick={() => setInput(ex.text)}
                className="rounded-[10px] px-3.5 py-3 flex items-center justify-between text-left active:opacity-70"
                style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.3)' }}
              >
                <div>
                  <p className="text-[13px]" style={{ color: 'var(--text-primary)' }}>{ex.text}</p>
                  {ex.sub && <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{ex.sub}</p>}
                </div>
                <span className="text-[14px] flex-shrink-0 ml-2" style={{ color: C.purple }}>→</span>
              </button>
            ))}
          </div>
        </>
      )}

      <AuthModal open={showLogin} onClose={() => setShowLogin(false)} />

      {/* jp: 스트리밍 중 (타이핑 끝날 때까지 유지) */}
      {showStreaming && (
        <StreamingCard
          statusText={state.statusText}
          meta={state.meta}
          isDone={state.status === 'done'}
          onTypingComplete={() => setTypingComplete(true)}
        />
      )}

      {/* jp: 오류 */}
      {state.status === 'error' && (
        <div className="rounded-[16px] p-3.5 mb-3 flex items-start gap-2" style={{ background: 'rgba(232,137,63,0.12)', border: '1px solid rgba(232,137,63,0.25)' }}>
          <Info size={16} color="#e8893f" style={{ flexShrink: 0, marginTop: 1 }} />
          <span className="text-[13px] flex-1" style={{ color: 'var(--text-primary)' }}>{state.error}</span>
          <button onClick={reset}><X size={15} color="var(--text-tertiary)" /></button>
        </div>
      )}

      {/* jp: 멀티턴 맥락 표시 */}
      {conversationContext && state.status === 'idle' && (
        <div className="flex items-center justify-between rounded-xl px-3 py-2 mb-3"
          style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)' }}>
          <p className="text-[11px]" style={{ color: C.purple }}>
            💬 이전 대화 이어서 질문할 수 있어요
          </p>
          <button onClick={() => setConversationContext('')}
            className="text-[11px] px-2 py-0.5 rounded-md"
            style={{ color: 'var(--text-tertiary)' }}>
            새 대화
          </button>
        </div>
      )}

      {/* jp: 결과 카드 (타이핑 완료 후) */}
      {showResult && state.result && (
        <StockResultCard
          result={state.result}
          onOpenDisclosure={onOpenDisclosure}
          onReset={() => { reset(); setInput(''); }}
          onFollowUp={() => { reset(); setInput(''); }}
        />
      )}

      <div className="mt-1">
        <RecentAnalysis kind="stock" refreshKey={refreshKey} accent={C.purple} onOpenDisclosure={onOpenDisclosure} />
      </div>

      <style>{`
        @keyframes cursorBlink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes aiBlink { 0%,100%{opacity:0.3} 50%{opacity:1} }
        @keyframes aiRing { 0%{transform:scale(0.7); opacity:0.8} 100%{transform:scale(1.8); opacity:0} }
        @keyframes aiSweep { 0%{left:-40%} 100%{left:100%} }
      `}</style>
    </div>
  );
}

// jp: 결과 카드 (기존 StockResultCard와 동일 + 새 분석 버튼)
function StockResultCard({
  result,
  onOpenDisclosure,
  onReset,
  onFollowUp,
}: {
  result: StockAnalysisResult;
  onOpenDisclosure?: (r: string, c: string, n?: string) => void;
  onReset?: () => void;
  onFollowUp?: () => void;
}) {
  const { stockName, stockCode, price, recentDisclosures, analysis } = result;
  const financials = (result as { financials?: { revenue: string; operatingProfit: string; netIncome: string; year: number | null; reportName: string; basis: string } | null }).financials;
  const cautions = (analysis as { cautions?: string[] }).cautions ?? [];
  const watchPoints = (analysis as { watchPoints?: string[] }).watchPoints ?? [];

  // jp: JSON 원문이 텍스트로 새어나오면 화면에 안 그림 (최후 방어)
  const looksLikeJson = (s?: string) => !!s && /^\s*[{[]/.test(s.trim()) || (!!s && /"(companyInfo|summary|detail|recentMoves)"\s*:/.test(s));
  const safe = (s?: string) => (looksLikeJson(s) ? '' : (s || ''));
  // jp: 긴 텍스트를 문단으로 분리 (줄바꿈 또는 "다.~" 문장 끝 기준)
  const toParagraphs = (s: string): string[] => {
    if (!s) return [];
    const byNewline = s.split(/\n+/).map(p => p.trim()).filter(Boolean);
    if (byNewline.length > 1) return byNewline;
    // jp: 줄바꿈이 없으면 문장 단위로 2~3문장씩 묶어 문단화
    const sentences = s.split(/(?<=다\.)\s+|(?<=요\.)\s+/).map(x => x.trim()).filter(Boolean);
    const paras: string[] = [];
    for (let i = 0; i < sentences.length; i += 2) {
      paras.push(sentences.slice(i, i + 2).join(' '));
    }
    return paras.length > 0 ? paras : [s];
  };
  const up = price ? price.change > 0 : false;
  const down = price ? price.change < 0 : false;
  const priceColor = up ? 'var(--rise)' : down ? 'var(--fall)' : 'var(--text-tertiary)';
  const impactColor = analysis.impact === 'positive' ? '#9DA7B3' : analysis.impact === 'negative' ? '#e8893f' : 'var(--text-tertiary)';

  return (
    <div className="rounded-[16px] p-4 mb-3" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
      {/* jp: 헤더 */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-[15px] font-bold" style={{ color: 'var(--text-primary)' }}>{stockName}</p>
          <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{stockCode}</p>
        </div>
        <div className="flex items-center gap-2">
          {price && (
            <div className="text-right">
              <p className="text-[15px] font-bold tabular-nums" style={{ color: priceColor }}>{price.current.toLocaleString()}원</p>
              <p className="text-[12px] flex items-center justify-end gap-0.5" style={{ color: priceColor }}>
                {up ? <TrendingUp size={12} /> : down ? <TrendingDown size={12} /> : null}
                {price.change >= 0 ? '+' : ''}{price.change.toLocaleString()} ({price.changeRate >= 0 ? '+' : ''}{price.changeRate}%)
              </p>
            </div>
          )}
        </div>
      </div>

      {/* jp: 임팩트 배지 */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[11px] font-bold px-2.5 py-1 rounded-full" style={{ background: `${impactColor}20`, color: impactColor }}>
          {analysis.impactLabel}
        </span>
      </div>

      {/* jp: 기업 개요 */}
      {safe((analysis as { companyInfo?: string }).companyInfo) && (
        <div className="rounded-xl p-3 mb-3 flex items-start gap-2" style={{ background: 'var(--bg-secondary)' }}>
          <span style={{ fontSize: 15, flexShrink: 0 }}>🏢</span>
          <p className="text-[14px] leading-[1.7]" style={{ color: 'var(--text-secondary)' }}>
            {safe((analysis as { companyInfo?: string }).companyInfo)}
          </p>
        </div>
      )}

      {/* jp: 요약 */}
      {safe(analysis.summary) && (
        <div className="rounded-xl p-3 mb-3" style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.25)' }}>
          <p className="text-[14px] leading-[1.7] font-semibold" style={{ color: 'var(--text-primary)' }}>{safe(analysis.summary)}</p>
        </div>
      )}

      {/* jp: 상세 - 문단 분리 + 14px */}
      {safe(analysis.detail) && (
        <div className="mb-3 flex flex-col gap-2.5">
          {toParagraphs(safe(analysis.detail)).map((para, i) => (
            <p key={i} className="text-[14px] leading-[1.7]" style={{ color: 'var(--text-secondary)' }}>{para}</p>
          ))}
        </div>
      )}

      {/* jp: 최근 흐름 */}
      {safe(analysis.recentMoves) && (
        <div className="rounded-xl p-3 mb-3" style={{ background: 'var(--bg-secondary)' }}>
          <p className="text-[12px] mb-1.5 font-semibold" style={{ color: 'var(--text-primary)' }}>최근 공시 흐름</p>
          <p className="text-[14px] leading-[1.7]" style={{ color: 'var(--text-secondary)' }}>{safe(analysis.recentMoves)}</p>
        </div>
      )}

      {/* jp: 참고사항 */}
      {analysis.notes?.length > 0 && (
        <div className="mb-3">
          {analysis.notes.map((note, i) => (
            <div key={i} className="flex items-start gap-1.5 mb-1">
              <span style={{ color: C.purple, marginTop: 2 }}>•</span>
              <p className="text-[11px] leading-[1.5]" style={{ color: 'var(--text-secondary)' }}>{note}</p>
            </div>
          ))}
        </div>
      )}

      {/* jp: 재무 현황 (표) */}
      {financials && (financials.revenue || financials.operatingProfit || financials.netIncome) && (
        <div className="rounded-xl p-3 mb-3" style={{ background: 'var(--bg-secondary)' }}>
          <p className="text-[14px] mb-2 font-semibold flex items-center gap-1" style={{ color: 'var(--text-primary)' }}>
            📊 재무 현황
            <span className="text-[10px] font-normal" style={{ color: 'var(--text-tertiary)' }}>
              {financials.reportName} {financials.year ?? ''} · {financials.basis}
            </span>
          </p>
          <div className="flex flex-col gap-0.5">
            {financials.revenue && (
              <div className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <span className="text-[14px]" style={{ color: 'var(--text-tertiary)' }}>매출액</span>
                <span className="text-[14px] font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>{financials.revenue}</span>
              </div>
            )}
            {financials.operatingProfit && (
              <div className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <span className="text-[14px]" style={{ color: 'var(--text-tertiary)' }}>영업이익</span>
                <span className="text-[14px] font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>{financials.operatingProfit}</span>
              </div>
            )}
            {financials.netIncome && (
              <div className="flex items-center justify-between py-2">
                <span className="text-[14px]" style={{ color: 'var(--text-tertiary)' }}>순이익</span>
                <span className="text-[14px] font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>{financials.netIncome}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* jp: 조심할 것 */}
      {cautions.length > 0 && (
        <div className="rounded-xl p-3 mb-3" style={{ background: 'rgba(255,82,82,0.08)', border: '1px solid rgba(255,82,82,0.2)' }}>
          <p className="text-[14px] mb-2 font-semibold flex items-center gap-1" style={{ color: '#ff5252' }}>
            ⚠️ 조심할 것
          </p>
          {cautions.map((c, i) => (
            <div key={i} className="flex items-start gap-1.5 mb-1 last:mb-0">
              <span style={{ color: '#ff5252', marginTop: 2 }}>·</span>
              <p className="text-[14px] leading-[1.6]" style={{ color: 'var(--text-secondary)' }}>{c}</p>
            </div>
          ))}
        </div>
      )}

      {/* jp: 지켜볼 사항 */}
      {watchPoints.length > 0 && (
        <div className="rounded-xl p-3 mb-3" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)' }}>
          <p className="text-[14px] mb-2 font-semibold flex items-center gap-1" style={{ color: C.purple }}>
            👀 지켜볼 사항
          </p>
          {watchPoints.map((w, i) => (
            <div key={i} className="flex items-start gap-1.5 mb-1 last:mb-0">
              <span style={{ color: C.purple, marginTop: 2 }}>·</span>
              <p className="text-[14px] leading-[1.6]" style={{ color: 'var(--text-secondary)' }}>{w}</p>
            </div>
          ))}
        </div>
      )}

      {/* jp: 최근 공시 목록 */}
      {recentDisclosures.length > 0 && (
        <div className="mb-3">
          <p className="text-[11px] mb-1.5 font-semibold" style={{ color: 'var(--text-tertiary)' }}>최근 공시</p>
          <div className="flex flex-col gap-1">
            {recentDisclosures.slice(0, 4).map((d) => (
              <button
                key={d.receiptNo}
                onClick={() => onOpenDisclosure?.(d.receiptNo, stockCode, stockName)}
                className="text-left px-2.5 py-1.5 rounded-lg active:opacity-70"
                style={{ background: 'var(--bg-secondary)' }}
              >
                <p className="text-[11px]" style={{ color: 'var(--text-primary)' }}>{d.reportName}</p>
                <p className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                  {new Date(d.disclosedAt).toLocaleDateString('ko-KR')}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* jp: 이어서 질문 / 새 분석 버튼 */}
      <div className="flex gap-2 mt-1">
        {onFollowUp && (
          <button
            onClick={onFollowUp}
            className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold"
            style={{ background: C.btnGrad, color: '#000' }}
          >
            💬 이어서 질문하기
          </button>
        )}
      </div>
    </div>
  );
}
