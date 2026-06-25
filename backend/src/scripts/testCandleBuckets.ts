// jp: 차트/분봉 bucket 회귀 테스트
// jp: 한국장 09:00 KST 기준 3/5/10/15/30/60/120/240분봉이 정확히 잘리는지 확인한다.
import { aggregateMinuteCandles, ChartCandle } from '../services/kis/kisRest.service';

function ts(kst: string): number {
  return Math.floor(new Date(`${kst}+09:00`).getTime() / 1000);
}

const base: ChartCandle[] = [
  { time: ts('2026-06-22T09:00:00'), open: 100, high: 100, low: 100, close: 100, volume: 10 },
  { time: ts('2026-06-22T09:01:00'), open: 101, high: 101, low: 101, close: 101, volume: 10 },
  { time: ts('2026-06-22T09:04:00'), open: 104, high: 104, low: 104, close: 104, volume: 10 },
  { time: ts('2026-06-22T09:05:00'), open: 105, high: 105, low: 105, close: 105, volume: 10 },
  { time: ts('2026-06-22T10:59:00'), open: 159, high: 159, low: 159, close: 159, volume: 10 },
  { time: ts('2026-06-22T11:00:00'), open: 160, high: 160, low: 160, close: 160, volume: 10 },
];

for (const unit of [3, 5, 10, 15, 30, 60, 120, 240]) {
  const rows = aggregateMinuteCandles(base, unit);
  console.log(`${unit}min`, rows.map(r => new Date(r.time * 1000).toISOString()).join(', '));
}
