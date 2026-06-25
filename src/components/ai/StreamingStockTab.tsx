// jp: 스트리밍 종목분석 StockTab 교체 컴포넌트
// jp: 기존 aiService.analyzeStock → useStreamAnalysis 훅으로 교체
// jp: 타이핑 효과 + 단계별 상태 표시

import { useState, useEffect, useRef } from 'react';
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
  purple: '#7F77DD',
  pink: '#DB2777',
  green: '#4ADE80',
  amber: '#FBBF24',
  heroGrad: 'linear-gradient(135deg, #7F77DD, #DB2777)',
  btnGrad: 'linear-gradient(135deg,#7F77DD,#DB2777)',
};

const EXAMPLE_STYLES = [
  { bg: 'rgba(127,119,221,0.12)', border: 'rgba(127,119,221,0.25)', iconColor: C.purple, subColor: C.purple },
  { bg: 'rgba(74,222,128,0.1)',   border: 'rgba(74,222,128,0.22)',  iconColor: C.green,  subColor: C.green  },
  { bg: 'rgba(251,191,36,0.1)',   border: 'rgba(251,191,36,0.22)',  iconColor: C.amber,  subColor: C.amber  },
  { bg: 'rgba(219,39,119,0.1)',   border: 'rgba(219,39,119,0.22)',  iconColor: C.pink,   subColor: C.pink   },
  { bg: 'rgba(127,119,221,0.08)', border: 'rgba(127,119,221,0.18)', iconColor: C.purple, subColor: '#9898a8' },
];

const FALLBACK_EXAMPLES = [
  { text: '삼성전자 최근 공시 보고 주가에 어떤 영향 있을지 알려줘', sub: '공시 + 뉴스 분석' },
  { text: 'SK하이닉스 오늘 왜 이렇게 올라?', sub: '주가 상승 원인 분석' },
  { text: '현대차 뉴스랑 공시 같이 보면 어때?', sub: '공시 + 뉴스 크로스체크' },
  { text: '오늘 반도체 관련주 흐름 어때?', sub: '섹터 흐름 분석' },
  { text: '삼성바이오로직스 최근 뉴스랑 공시 종합해줘', sub: '뉴스 + 공시 종합' },
];

// jp: 스트리밍 중 타이핑 커서 효과
function TypingCursor() {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 2,
        height: '1em',
        background: C.purple,
        marginLeft: 2,
        verticalAlign: 'text-bottom',
        animation: 'cursorBlink 0.8s infinite',
      }}
    />
  );
}

// jp: 스트리밍 상태 표시 카드 (타이핑 애니메이션)
function StreamingCard({
  statusText,
  streamingText,
  meta,
  isDone,
  onTypingComplete,
}: {
  statusText: string;
  streamingText: string;
  meta: Partial<StockAnalysisResult> | null;
  isDone: boolean;
  onTypingComplete: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [typedLen, setTypedLen] = useState(0);

  // jp: 목표 텍스트에서 summary 추출
  let displayTarget = streamingText;
  const summaryMatch = streamingText.match(/"summary"\s*:\s*"([^"]*)/);
  if (summaryMatch) {
    displayTarget = summaryMatch[1];
  } else if (streamingText.trim().startsWith('{')) {
    displayTarget = '';
  }

  const typedText = displayTarget.slice(0, typedLen);

  // jp: 타이핑 애니메이션 — 25ms마다 1글자씩 증가
  useEffect(() => {
    if (typedLen >= displayTarget.length) return;
    const timer = setTimeout(() => {
      setTypedLen((n) => Math.min(n + 1, displayTarget.length));
    }, 25);
    return () => clearTimeout(timer);
  }, [typedLen, displayTarget.length]);

  // jp: done 상태 + 타이핑 완료 감지 → 결과 카드로 전환
  useEffect(() => {
    if (isDone && displayTarget.length > 0 && typedLen >= displayTarget.length) {
      // jp: 약간의 여유 후 전환
      const t = setTimeout(() => onTypingComplete(), 200);
      return () => clearTimeout(t);
    }
    // jp: summary 파싱 실패 시(빈 target)에도 done이면 전환 (무한로딩 방지)
    if (isDone && displayTarget.length === 0 && streamingText.length > 0) {
      const t = setTimeout(() => onTypingComplete(), 100);
      return () => clearTimeout(t);
    }
  }, [isDone, typedLen, displayTarget.length, streamingText.length, onTypingComplete]);

  // jp: 스크롤 하단
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [typedText]);



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

      {/* jp: 상태 텍스트 - 옵션 G 임팩트 로딩 (확산 링 + 빛 스윕) */}
      {statusText && !streamingText && (
        <div
          className="relative overflow-hidden rounded-[14px] mb-2 px-4 py-5 flex flex-col items-center text-center"
          style={{ background: 'rgba(127,119,221,0.08)', border: `1px solid ${C.purple}4d` }}
        >
          {/* 빛 스윕 */}
          <div
            className="absolute top-0 h-full"
            style={{ left: '-40%', width: '40%', background: 'linear-gradient(90deg,transparent,rgba(127,119,221,0.18),transparent)', animation: 'aiSweep 1.8s linear infinite' }}
          />
          {/* 확산 링 + 코어 */}
          <div className="relative mb-3" style={{ width: 50, height: 50 }}>
            <div className="absolute inset-0 rounded-full" style={{ border: `2px solid ${C.purple}`, animation: 'aiRing 1.6s ease-out infinite' }} />
            <div className="absolute inset-0 rounded-full" style={{ border: '2px solid #DB2777', animation: 'aiRing 1.6s ease-out infinite', animationDelay: '0.8s' }} />
            <div className="absolute rounded-full flex items-center justify-center" style={{ inset: 14, background: 'linear-gradient(135deg,#7F77DD,#DB2777)' }}>
              <Sparkles size={16} color="#fff" />
            </div>
          </div>
          <p className="relative text-[14px] font-bold" style={{ color: 'var(--text-primary)' }}>AI 분석 진행 중</p>
          <p className="relative text-[11px] mt-1" style={{ color: C.purple }}>{statusText}</p>
        </div>
      )}

      {/* jp: 실시간 스트리밍 텍스트 */}
      {(streamingText || typedText) && (
        <div
          ref={scrollRef}
          className="rounded-xl p-3"
          style={{ background: 'rgba(127,119,221,0.08)', maxHeight: 200, overflowY: 'auto' }}
        >
          <p className="text-[13px] leading-[1.7]" style={{ color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
            {typedText}
            <TypingCursor />
          </p>
        </div>
      )}
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
          style={{ background: isLoading ? 'rgba(127,119,221,0.3)' : C.btnGrad }}
        >
          {isLoading
            ? <X size={16} color={C.purple} />
            : <ArrowRight size={16} color="#fff" />
          }
        </button>
      </div>
      <p className="text-[10px] flex items-center gap-1 mb-[18px]" style={{ color: 'var(--text-tertiary)' }}>
        <Sparkles size={11} /> 종목명/종목코드 OK, 자연어 질문도 OK
      </p>

      {/* jp: 예시 질문 */}
      {state.status === 'idle' && (
        <>
          <p className="text-[11px] mb-[9px]" style={{ color: 'var(--text-tertiary)' }}>질문 예시</p>
          <div className="flex flex-col gap-2 mb-5">
            {examples.map((ex, i) => {
              const style = EXAMPLE_STYLES[i % EXAMPLE_STYLES.length];
              return (
                <button
                  key={ex.text}
                  onClick={() => setInput(ex.text)}
                  className="rounded-xl px-3.5 py-[11px] flex items-center gap-2.5 text-left active:opacity-70"
                  style={{ background: style.bg, border: `1px solid ${style.border}` }}
                >
                  <span style={{ color: style.iconColor, flexShrink: 0 }}>
                    <Sparkles size={15} />
                  </span>
                  <div>
                    <p className="text-[12px]" style={{ color: 'var(--text-primary)' }}>{ex.text}</p>
                    <p className="text-[10px] mt-0.5" style={{ color: style.subColor }}>{ex.sub}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}

      <AuthModal open={showLogin} onClose={() => setShowLogin(false)} />

      {/* jp: 스트리밍 중 (타이핑 끝날 때까지 유지) */}
      {showStreaming && (
        <StreamingCard
          statusText={state.statusText}
          streamingText={state.streamingText}
          meta={state.meta}
          isDone={state.status === 'done'}
          onTypingComplete={() => setTypingComplete(true)}
        />
      )}

      {/* jp: 오류 */}
      {state.status === 'error' && (
        <div className="rounded-[16px] p-3.5 mb-3 flex items-start gap-2" style={{ background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.25)' }}>
          <Info size={16} color="#F87171" style={{ flexShrink: 0, marginTop: 1 }} />
          <span className="text-[13px] flex-1" style={{ color: 'var(--text-primary)' }}>{state.error}</span>
          <button onClick={reset}><X size={15} color="var(--text-tertiary)" /></button>
        </div>
      )}

      {/* jp: 멀티턴 맥락 표시 */}
      {conversationContext && state.status === 'idle' && (
        <div className="flex items-center justify-between rounded-xl px-3 py-2 mb-3"
          style={{ background: 'rgba(127,119,221,0.1)', border: '1px solid rgba(127,119,221,0.2)' }}>
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
  const up = price ? price.change > 0 : false;
  const down = price ? price.change < 0 : false;
  const priceColor = up ? 'var(--rise)' : down ? 'var(--fall)' : 'var(--text-tertiary)';
  const impactColor = analysis.impact === 'positive' ? '#4ADE80' : analysis.impact === 'negative' ? '#F87171' : 'var(--text-tertiary)';

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
      {(analysis as { companyInfo?: string }).companyInfo && (
        <div className="rounded-xl p-3 mb-3 flex items-start gap-2" style={{ background: 'var(--bg-secondary)' }}>
          <span style={{ fontSize: 14, flexShrink: 0 }}>🏢</span>
          <p className="text-[12px] leading-[1.6]" style={{ color: 'var(--text-secondary)' }}>
            {(analysis as { companyInfo?: string }).companyInfo}
          </p>
        </div>
      )}

      {/* jp: 요약 */}
      <div className="rounded-xl p-3 mb-3" style={{ background: 'rgba(127,119,221,0.12)', border: '1px solid rgba(127,119,221,0.25)' }}>
        <p className="text-[13px] leading-[1.6]" style={{ color: 'var(--text-primary)' }}>{analysis.summary}</p>
      </div>

      {/* jp: 상세 */}
      {analysis.detail && (
        <p className="text-[12px] leading-[1.6] mb-3" style={{ color: 'var(--text-secondary)' }}>{analysis.detail}</p>
      )}

      {/* jp: 최근 흐름 */}
      {analysis.recentMoves && (
        <div className="rounded-xl p-3 mb-3" style={{ background: 'var(--bg-secondary)' }}>
          <p className="text-[11px] mb-1.5 font-semibold" style={{ color: 'var(--text-primary)' }}>최근 공시 흐름</p>
          <p className="text-[11px] leading-[1.5]" style={{ color: 'var(--text-secondary)' }}>{analysis.recentMoves}</p>
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
            style={{ background: C.btnGrad, color: '#fff' }}
          >
            💬 이어서 질문하기
          </button>
        )}
      </div>
    </div>
  );
}
