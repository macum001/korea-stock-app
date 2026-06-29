// jp: 실시간 차트 컴포넌트 - lightweight-charts 사용
// jp: 변경: livePrice 대신 체결 tick(useRealtimeTrades)으로 마지막 캔들 업데이트
// jp:       → 차트 close가 항상 마지막 체결가와 동일하게 유지됨
// jp: 변경: 15min/120min/240min 분봉 지원 (PeriodType 확장)

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  IChartApi,
  ISeriesApi,
  CandlestickData,
  HistogramData,
  LineData,
  ColorType,
} from 'lightweight-charts';
import { PeriodType, Candle } from '@/types/stock';
import { stockService } from '@/services/stockService';
import { useThemeStore } from '@/store/themeStore';
import { useRealtimeTrades } from '@/hooks/useRealtimeOrderbook';
import { PeriodSelector } from './PeriodSelector';
import { Skeleton } from '@/components/common/SkeletonCard';
import { Settings } from 'lucide-react';
import { calcRSI, calcMACD } from './indicators';
import { ChartSettings, ChartConfig, DEFAULT_CHART_CONFIG } from './ChartSettings';

interface StockChartProps {
  stockCode: string;
}

// jp: 이동평균선 계산
function calcMA(candles: Candle[], period: number): LineData[] {
  return candles
    .map((c, i) => {
      if (i < period - 1) return null;
      const slice = candles.slice(i - period + 1, i + 1);
      const avg = slice.reduce((s, x) => s + x.close, 0) / period;
      return { time: c.time as LineData['time'], value: Math.round(avg) };
    })
    .filter(Boolean) as LineData[];
}

const MA_COLORS = {
  5:   '#f59e0b',
  20:  '#ffffff',
  60:  '#10b981',
  120: '#3b82f6',
};

// jp: 분봉 여부 판단
function isMinutePeriod(period: PeriodType): boolean {
  return period.endsWith('min');
}

// jp: 현재 분봉 bucket의 시작 unix timestamp 계산
// jp: 한국장 09:00 KST를 기준점으로 bucket을 나눔. UTC 자정 기준으로 자르면 120/240분봉이 어긋날 수 있음.
function getBucketTimeFromTimestamp(unitMin: number, timestampMs = Date.now()): number {
  const base = new Date(timestampMs);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(base);
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '0';
  const y = Number(get('year'));
  const m = Number(get('month'));
  const d = Number(get('day'));
  const hour = Number(get('hour'));
  const minute = Number(get('minute'));
  const second = Number(get('second'));
  const tickUtcMs = Date.UTC(y, m - 1, d, hour, minute, second) - (9 * 60 * 60 * 1000);
  const startUtcMs = Date.UTC(y, m - 1, d, 9, 0, 0) - (9 * 60 * 60 * 1000);
  const elapsedMs = Math.max(0, tickUtcMs - startUtcMs);
  const bucketMs = startUtcMs + Math.floor(elapsedMs / (unitMin * 60000)) * unitMin * 60000;
  return Math.floor(bucketMs / 1000);
}

// jp: PeriodType → 분 단위 숫자
const MINUTE_UNIT_MAP: Partial<Record<PeriodType, number>> = {
  '1min': 1, '3min': 3, '5min': 5, '10min': 10, '15min': 15,
  '30min': 30, '60min': 60, '120min': 120, '240min': 240,
};

export function StockChart({ stockCode }: StockChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const candleSeries = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeries = useRef<ISeriesApi<'Histogram'> | null>(null);
  const rsiSeries = useRef<ISeriesApi<'Line'> | null>(null);
  const macdHist = useRef<ISeriesApi<'Histogram'> | null>(null);
  const macdLine = useRef<ISeriesApi<'Line'> | null>(null);
  const macdSignal = useRef<ISeriesApi<'Line'> | null>(null);
  const maSeries = useRef<Partial<Record<number, ISeriesApi<'Line'>>>>({});

  const [period, setPeriod] = useState<PeriodType>('day');
  const [candles, setCandles] = useState<Candle[]>([]);
  const candlesRef = useRef<Candle[]>([]);
  const skipNextFullChartRefreshRef = useRef(false);
  const lastMaRefreshAtRef = useRef(0);
  const lastRenderLogAtRef = useRef(0);
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<ChartConfig>({ ...DEFAULT_CHART_CONFIG, rsi: true, macd: true });
  const [showSettings, setShowSettings] = useState(false);
  const mode = useThemeStore((s) => s.mode);

  useEffect(() => { candlesRef.current = candles; }, [candles]);

  // jp: 체결 tick 구독 (분봉/일봉 모두 — 장중 마지막 캔들 업데이트용)
  // jp: 일봉+에서는 체결 tick으로 close/high/low 업데이트만. volume은 누적하지 않음.
  const { trades } = useRealtimeTrades(stockCode, 1); // jp: 최신 1건만

  // jp: 테마에 따른 차트 색상
  const getChartColors = useCallback(() => ({
    background:   mode === 'dark' ? '#1e1e24' : '#ffffff',
    textColor:    mode === 'dark' ? '#9898a8' : '#555555',
    gridColor:    mode === 'dark' ? '#2e2e38' : '#e5e5e5',
    borderColor:  mode === 'dark' ? '#2e2e38' : '#e5e5e5',
    upColor:      '#ff5252',
    downColor:    '#5c8aff',
    wickUpColor:  '#ff5252',
    wickDownColor: '#5c8aff',
  }), [mode]);

  // jp: 차트 초기화
  useEffect(() => {
    if (!chartRef.current) return;
    const colors = getChartColors();

    chart.current = createChart(chartRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: colors.background },
        textColor: colors.textColor,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", sans-serif',
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: colors.gridColor },
        horzLines: { color: colors.gridColor },
      },
      crosshair: {
        vertLine: { color: colors.textColor, style: 2, width: 1 },
        horzLine: { color: colors.textColor, style: 2, width: 1 },
      },
      rightPriceScale: {
        borderColor: colors.borderColor,
        scaleMargins: { top: 0.05, bottom: 0.25 },
      },
      timeScale: {
        borderColor: colors.borderColor,
        timeVisible: true,
        secondsVisible: false,
      },
      handleScale: { mouseWheel: true, pinch: true },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true },
    });

    candleSeries.current = chart.current.addSeries(CandlestickSeries, {
      upColor:      colors.upColor,
      downColor:    colors.downColor,
      wickUpColor:  colors.wickUpColor,
      wickDownColor: colors.wickDownColor,
      borderVisible: false,
    });

    volumeSeries.current = chart.current.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });
    chart.current.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    ([5, 20, 60, 120] as const).forEach((p) => {
      if (!chart.current) return;
      maSeries.current[p] = chart.current.addSeries(LineSeries, {
        color: MA_COLORS[p],
        lineWidth: 1,
        crosshairMarkerVisible: false,
        lastValueVisible: false,
        priceLineVisible: false,
      });
    });

    // jp: RSI (별도 하단 패널)
    rsiSeries.current = chart.current.addSeries(LineSeries, {
      color: '#BA7517', lineWidth: 1, priceScaleId: 'rsi',
      crosshairMarkerVisible: false, lastValueVisible: false, priceLineVisible: false,
    });
    chart.current.priceScale('rsi').applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });

    // jp: MACD (별도 하단 패널)
    macdHist.current = chart.current.addSeries(HistogramSeries, { priceScaleId: 'macd', priceFormat: { type: 'price', precision: 2, minMove: 0.01 } });
    macdLine.current = chart.current.addSeries(LineSeries, { color: '#BA7517', lineWidth: 1, priceScaleId: 'macd', crosshairMarkerVisible: false, lastValueVisible: false, priceLineVisible: false });
    macdSignal.current = chart.current.addSeries(LineSeries, { color: '#185FA5', lineWidth: 1, priceScaleId: 'macd', crosshairMarkerVisible: false, lastValueVisible: false, priceLineVisible: false });
    chart.current.priceScale('macd').applyOptions({ scaleMargins: { top: 0.88, bottom: 0 } });

    const handleResize = () => {
      if (chartRef.current && chart.current) {
        chart.current.applyOptions({ width: chartRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.current?.remove();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // jp: 테마 변경 시 차트 색상 업데이트
  useEffect(() => {
    if (!chart.current) return;
    const colors = getChartColors();
    chart.current.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: colors.background },
        textColor: colors.textColor,
      },
      grid: {
        vertLines: { color: colors.gridColor },
        horzLines: { color: colors.gridColor },
      },
    });
  }, [mode, getChartColors]);

  // jp: 기간 변경 시 캔들 데이터 로드
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    stockService.getCandles(stockCode, period).then((data) => {
      if (cancelled) return;
      // jp: 분봉은 최근 500개, 일봉+은 10년치 일봉을 감당하도록 3000개까지 유지
      const limit = isMinutePeriod(period) ? 500 : 3000;
      setCandles(data.slice(-limit));
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [stockCode, period]);

  // jp: 캔들 데이터 차트에 반영
  useEffect(() => {
    if (!candles.length || !candleSeries.current || !volumeSeries.current) return;

    // jp: live tick에서 이미 candleSeries.update()를 호출한 경우 전체 setData를 다시 하지 않음.
    // jp: 10년치 일봉/대량 분봉에서 매 tick 전체 배열 재주입으로 생기는 프레임 드랍 방지.
    if (skipNextFullChartRefreshRef.current) {
      skipNextFullChartRefreshRef.current = false;
      const now = Date.now();
      if (now - lastMaRefreshAtRef.current > 1000) {
        ([5, 20, 60, 120] as const).forEach((p) => {
          maSeries.current[p]?.setData(calcMA(candles, p));
        });
        lastMaRefreshAtRef.current = now;
      }
      return;
    }

    const candleData: CandlestickData[] = candles.map((c) => ({
      time: c.time as CandlestickData['time'],
      open: c.open, high: c.high, low: c.low, close: c.close,
    }));

    const volumeData: HistogramData[] = candles.map((c) => ({
      time: c.time as HistogramData['time'],
      value: c.volume,
      color: c.close >= c.open
        ? 'rgba(255, 82, 82, 0.5)'
        : 'rgba(92, 138, 255, 0.5)',
    }));

    candleSeries.current.setData(candleData);
    volumeSeries.current.setData(volumeData);

    ([5, 20, 60, 120] as const).forEach((p) => {
      maSeries.current[p]?.setData(calcMA(candles, p));
    });

    // jp: RSI 데이터
    rsiSeries.current?.setData(calcRSI(candles));

    // jp: MACD 데이터
    {
      const m = calcMACD(candles);
      macdHist.current?.setData(m.histogram);
      macdLine.current?.setData(m.macd);
      macdSignal.current?.setData(m.signal);
    }

    chart.current?.timeScale().fitContent();
  }, [candles]);

  // jp: 체결 tick으로 마지막 캔들 실시간 업데이트
  // jp: 핵심: 차트 close = 마지막 체결가. chart.update와 React state를 동시에 갱신해 MA/거래량도 일관성 유지.
  useEffect(() => {
    if (!trades.length || !candleSeries.current || !volumeSeries.current || !candlesRef.current.length) return;
    if (period === 'week' || period === 'month' || period === 'year') return;

    const latestTick = trades[0];
    if (!latestTick || !latestTick.price) return;

    const tickPrice = latestTick.price;
    const tickVolume = Math.max(Number(latestTick.volume ?? 0), 0);
    const minuteUnit = MINUTE_UNIT_MAP[period];

    setCandles(prev => {
      const last = prev[prev.length - 1];
      if (!last) return prev;

      const tickTimestamp = Number(latestTick.providerTimestamp ?? latestTick.backendReceivedAt ?? Date.now());
      const targetTime = minuteUnit ? getBucketTimeFromTimestamp(minuteUnit, tickTimestamp) : last.time;
      let next: Candle[];

      if (minuteUnit && targetTime > last.time) {
        const newCandle: Candle = {
          time: targetTime,
          open: tickPrice,
          high: tickPrice,
          low: tickPrice,
          close: tickPrice,
          volume: tickVolume,
        };
        next = [...prev, newCandle].slice(-500);
      } else {
        const updated: Candle = {
          ...last,
          high: Math.max(last.high, tickPrice),
          low: last.low > 0 ? Math.min(last.low, tickPrice) : tickPrice,
          close: tickPrice,
          volume: last.volume + tickVolume,
        };
        next = [...prev.slice(0, -1), updated];
      }

      const current = next[next.length - 1];
      skipNextFullChartRefreshRef.current = true;
      candleSeries.current?.update({
        time: current.time as CandlestickData['time'],
        open: current.open,
        high: current.high,
        low: current.low,
        close: current.close,
      });
      volumeSeries.current?.update({
        time: current.time as HistogramData['time'],
        value: current.volume,
        color: current.close >= current.open
          ? 'rgba(255, 82, 82, 0.5)'
          : 'rgba(92, 138, 255, 0.5)',
      });
      candlesRef.current = next;

      if (import.meta.env.DEV) {
        const now = Date.now();
        if (now - lastRenderLogAtRef.current > 1000) {
          const wsBroadcastAt = Number(latestTick.wsBroadcastAt ?? 0);
          requestAnimationFrame(() => {
            console.debug('[chart-latency-debug]', {
              stockCode,
              period,
              tickTime: latestTick.time,
              tickPrice,
              bucket: current.time,
              wsToChartFrameMs: wsBroadcastAt ? Date.now() - wsBroadcastAt : undefined,
              candleCount: next.length,
            });
          });
          lastRenderLogAtRef.current = now;
        }
      }
      return next;
    });
  }, [trades, period, stockCode]);

  // jp: config 변경 시 지표 표시/숨김
  useEffect(() => {
    if (!chart.current) return;
    // jp: 거래량
    volumeSeries.current?.applyOptions({ visible: config.volume });
    // jp: MA 토글
    ([5, 20, 60, 120] as const).forEach((pp) => {
      maSeries.current[pp]?.applyOptions({ visible: config.ma[pp] });
    });
    // jp: RSI
    rsiSeries.current?.applyOptions({ visible: config.rsi });
    // jp: MACD
    macdHist.current?.applyOptions({ visible: config.macd });
    macdLine.current?.applyOptions({ visible: config.macd });
    macdSignal.current?.applyOptions({ visible: config.macd });
  }, [config]);

  return (
    <div>
      <PeriodSelector selected={period} onChange={setPeriod} />

      {/* jp: 이동평균선 범례 */}
      <div className="flex items-center gap-3 px-4 pb-2">
        {([5, 20, 60, 120] as const).map((p) => (
          <div key={p} className="flex items-center gap-1">
            <span className="w-3 h-0.5 rounded" style={{ backgroundColor: MA_COLORS[p] }} />
            <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>MA{p}</span>
          </div>
        ))}
        <div className="flex items-center gap-1">
          <span className="w-3 h-0.5 rounded" style={{ backgroundColor: '#BA7517' }} />
          <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>RSI 14</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-3 h-0.5 rounded" style={{ backgroundColor: '#185FA5' }} />
          <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>MACD</span>
        </div>
        <div className="flex-1" />
        <button
          onClick={() => setShowSettings(true)}
          className="w-7 h-7 flex items-center justify-center rounded-lg"
          style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-tertiary)' }}
          aria-label="차트 설정"
        >
          <Settings size={13} />
        </button>
      </div>

      {/* jp: 차트 컨테이너 */}
      <div className="relative" style={{ height: 320, backgroundColor: 'var(--bg-card)' }}>
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center"
            style={{ backgroundColor: 'var(--bg-card)' }}>
            <Skeleton className="w-full h-full" />
          </div>
        )}
        <div ref={chartRef} style={{ width: '100%', height: '100%' }} />
      </div>

      {showSettings && (
        <ChartSettings config={config} onChange={setConfig} onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}
