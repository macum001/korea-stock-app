// jp: 성능 로그 - 병목 측정용. API 키/토큰은 절대 출력 금지

export interface PerfMetric {
  api: string;
  cache?: 'hit' | 'miss';
  dbMs?: number;
  externalMs?: number;
  totalMs: number;
  stale?: boolean;
  fallback?: boolean;
}

// jp: [perf] 형식으로 출력
export function logPerf(m: PerfMetric): void {
  const parts: string[] = [`[perf] ${m.api}`];
  if (m.cache) parts.push(`cache=${m.cache}`);
  if (m.dbMs != null) parts.push(`db=${m.dbMs}ms`);
  if (m.externalMs != null) parts.push(`external=${m.externalMs}ms`);
  parts.push(`total=${m.totalMs}ms`);
  if (m.stale != null) parts.push(`stale=${m.stale}`);
  if (m.fallback) parts.push('fallback=true');
  console.log(parts.join(' '));
}

// jp: 타이머 헬퍼 - 시작 시각 반환, 종료 시 ms 반환
export function startTimer(): () => number {
  const t0 = Date.now();
  return () => Date.now() - t0;
}
