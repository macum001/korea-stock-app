// jp: 종목분석 SSE 스트리밍 훅
// jp: GET /api/ai/stock-analysis/stream?q=종목명
import { useState, useRef, useCallback } from 'react';
import { StockAnalysisResult } from '@/services/aiService';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export interface StreamState {
  status: 'idle' | 'connecting' | 'streaming' | 'done' | 'error';
  statusText: string;         // "종목 정보 조회 중..." 등
  streamingText: string;      // 실시간으로 쌓이는 텍스트
  meta: Partial<StockAnalysisResult> | null;  // 종목명/가격/공시목록
  result: StockAnalysisResult | null;         // 최종 결과
  error: string;
}

const INIT: StreamState = {
  status: 'idle',
  statusText: '',
  streamingText: '',
  meta: null,
  result: null,
  error: '',
};

export function useStreamAnalysis() {
  const [state, setState] = useState<StreamState>(INIT);
  const abortRef = useRef<(() => void) | null>(null);

  const analyze = useCallback(async (query: string, token?: string, context?: string) => {
    // jp: 이전 스트림 중단
    if (abortRef.current) abortRef.current();

    setState({ ...INIT, status: 'connecting', statusText: '연결 중...' });

    let url = `${API_URL}/api/ai/stock-analysis/stream?q=${encodeURIComponent(query.trim())}`;
    // jp: 멀티턴 - 이전 대화 맥락 전달
    if (context) {
      url += `&context=${encodeURIComponent(context.slice(0, 2000))}`;
    }

    let aborted = false;
    const controller = new AbortController();
    abortRef.current = () => { aborted = true; controller.abort(); };

    try {
      let res = await fetch(url, {
        signal: controller.signal,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      // jp: 401(토큰만료)이면 토큰 갱신 후 1회 재시도
      if (res.status === 401) {
        try {
          const { useAuthStore } = await import('@/store/authStore');
          const refreshToken = useAuthStore.getState().refreshToken;
          if (refreshToken) {
            const authService = await import('@/services/authService');
            const { accessToken: newToken } = await authService.refreshAccessToken(refreshToken);
            // jp: 새 토큰 저장
            useAuthStore.setState({ accessToken: newToken, isAuthenticated: true });
            // jp: 새 토큰으로 재시도
            res = await fetch(url, {
              signal: controller.signal,
              headers: { Authorization: `Bearer ${newToken}` },
            });
          }
        } catch {
          // jp: 갱신 실패 → 로그인 필요
          setState(s => ({ ...s, status: 'error', error: '로그인이 필요해요.' }));
          return;
        }
      }

      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      setState(s => ({ ...s, status: 'streaming' }));

      while (true) {
        const { done, value } = await reader.read();
        if (done || aborted) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        let event = '';
        let data = '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            event = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            data = line.slice(6).trim();
          } else if (line === '') {
            // jp: 이벤트 처리
            if (event && data) {
              try {
                const parsed = JSON.parse(data);
                handleEvent(event, parsed);
              } catch { /* 무시 */ }
              event = ''; data = '';
            }
          }
        }
      }
    } catch (err) {
      if (aborted) return;
      const msg = err instanceof Error ? err.message : '연결 오류';
      setState(s => ({ ...s, status: 'error', error: msg.includes('401') ? '로그인이 필요해요.' : '분석 중 오류가 발생했어요.' }));
    }

    function handleEvent(event: string, payload: Record<string, unknown>) {
      switch (event) {
        case 'status':
          setState(s => ({ ...s, statusText: String(payload.message ?? '') }));
          break;

        case 'meta':
          setState(s => ({ ...s, meta: { ...s.meta, ...payload } as Partial<StockAnalysisResult> }));
          break;

        case 'text':
          // jp: 실시간 텍스트 청크 — JSON이므로 { } 부분 제거하고 표시
          setState(s => ({ ...s, streamingText: s.streamingText + String(payload.text ?? '') }));
          break;

        case 'done':
          setState(s => ({
            ...s,
            status: 'done',
            statusText: '',
            result: {
              ...(s.meta as StockAnalysisResult),
              analysis: payload.analysis as StockAnalysisResult['analysis'],
              tokens: payload.tokens as number,
            },
            streamingText: '',
          }));
          break;

        case 'error':
          setState(s => ({ ...s, status: 'error', error: String(payload.message ?? '오류가 발생했어요.') }));
          break;
      }
    }
  }, []);

  const reset = useCallback(() => {
    if (abortRef.current) abortRef.current();
    setState(INIT);
  }, []);

  return { state, analyze, reset };
}
