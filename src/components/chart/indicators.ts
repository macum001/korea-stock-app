// jp: 차트 보조지표 계산 - RSI, MACD, 볼린저밴드
// jp: lightweight-charts의 LineData/HistogramData 형식으로 반환
import { LineData, HistogramData } from 'lightweight-charts';
import { Candle } from '@/types/stock';

type T = LineData['time'];

// jp: RSI (기본 14) - 0~100 오실레이터
export function calcRSI(candles: Candle[], period = 14): LineData[] {
  if (candles.length < period + 1) return [];
  const out: LineData[] = [];
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    if (diff >= 0) avgGain += diff; else avgLoss -= diff;
  }
  avgGain /= period; avgLoss /= period;
  for (let i = period + 1; i < candles.length; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    const gain = diff >= 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + rs);
    out.push({ time: candles[i].time as T, value: Math.round(rsi * 100) / 100 });
  }
  return out;
}

// jp: EMA 헬퍼
function ema(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out: number[] = [];
  let prev = values[0];
  out.push(prev);
  for (let i = 1; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

export interface MacdResult {
  macd: LineData[];
  signal: LineData[];
  histogram: HistogramData[];
}

// jp: MACD (기본 12,26,9)
export function calcMACD(candles: Candle[], fast = 12, slow = 26, sig = 9): MacdResult {
  if (candles.length < slow + sig) return { macd: [], signal: [], histogram: [] };
  const closes = candles.map(c => c.close);
  const emaFast = ema(closes, fast);
  const emaSlow = ema(closes, slow);
  const macdLine = closes.map((_, i) => emaFast[i] - emaSlow[i]);
  const signalLine = ema(macdLine.slice(slow - 1), sig);
  const macd: LineData[] = [];
  const signal: LineData[] = [];
  const histogram: HistogramData[] = [];
  for (let i = slow - 1; i < candles.length; i++) {
    const t = candles[i].time as T;
    const m = macdLine[i];
    const s = signalLine[i - (slow - 1)];
    macd.push({ time: t, value: Math.round(m * 100) / 100 });
    signal.push({ time: t, value: Math.round(s * 100) / 100 });
    const h = m - s;
    histogram.push({ time: t, value: Math.round(h * 100) / 100, color: h >= 0 ? 'rgba(255,82,82,0.6)' : 'rgba(92,138,255,0.6)' });
  }
  return { macd, signal, histogram };
}

export interface BollingerResult {
  upper: LineData[];
  middle: LineData[];
  lower: LineData[];
}

// jp: 볼린저밴드 (기본 20, 2시그마)
export function calcBollinger(candles: Candle[], period = 20, mult = 2): BollingerResult {
  const upper: LineData[] = [];
  const middle: LineData[] = [];
  const lower: LineData[] = [];
  for (let i = period - 1; i < candles.length; i++) {
    const slice = candles.slice(i - period + 1, i + 1).map(c => c.close);
    const mean = slice.reduce((s, x) => s + x, 0) / period;
    const variance = slice.reduce((s, x) => s + (x - mean) ** 2, 0) / period;
    const sd = Math.sqrt(variance);
    const t = candles[i].time as T;
    middle.push({ time: t, value: Math.round(mean) });
    upper.push({ time: t, value: Math.round(mean + mult * sd) });
    lower.push({ time: t, value: Math.round(mean - mult * sd) });
  }
  return { upper, middle, lower };
}
