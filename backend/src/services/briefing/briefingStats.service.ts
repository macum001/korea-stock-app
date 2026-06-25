// briefingStats.service.ts
// 시황 상관 통계 계산
// 미국 D(15:40) → 한국 D+1(15:40) 상관 분석
// 데이터 부족 시 표본 수만 반환 (더미 아님, 실제 계산)

import { query } from '../../config/db';

// jp: 통계 종류 정의 (한글 라벨 포함)
export const STAT_DEFS: Record<string, { label: string; desc: string }> = {
  sox_kr_semi:   { label: 'SOX → 한국 반도체', desc: 'SOX +3% 이상인 날, 다음 거래일 한국 반도체 평균' },
  vix_kospi:     { label: 'VIX → 코스피',      desc: 'VIX +10% 이상(공포)인 날, 다음 거래일 코스피 평균' },
  nasdaq_kosdaq: { label: '나스닥 → 코스닥',   desc: '나스닥 +2% 이상인 날, 다음 거래일 코스닥 평균' },
  hit_rate:      { label: '시황 적중률',       desc: '"좋음" 예측한 날, 실제 코스피 상승 비율' },
};

// jp: 15:40 브리핑만, 날짜순. raw_data에서 특정 key의 등락률 추출용
interface DailySnapshot {
  date: string;
  analysisStatus: string | null;
  rates: Record<string, number>;  // key → changeRate
}

// jp: 모든 15:40 완료 브리핑을 날짜순으로 로드
async function loadDailySnapshots(): Promise<DailySnapshot[]> {
  const rows = await query<{ date: string; analysis_status: string | null; raw_data: { items?: Array<{ key: string; changeRate: number }> } }>(
    `SELECT date::text AS date,
            (analysis->>'status') AS analysis_status,
            raw_data
       FROM market_briefings
       WHERE slot = '1540' AND status = 'completed'
       ORDER BY date ASC`
  );

  return rows.map(r => {
    const rates: Record<string, number> = {};
    const items = r.raw_data?.items ?? [];
    for (const it of items) {
      rates[it.key] = it.changeRate;
    }
    return { date: r.date, analysisStatus: r.analysis_status, rates };
  });
}

interface StatResult {
  key: string;
  label: string;
  desc: string;
  sampleSize: number;       // 표본 수
  hasEnoughData: boolean;   // 의미있는 통계 가능 여부 (최소 5)
  values: { label: string; value: number | null }[];  // 결과 수치들
  hitInfo: string | null;   // "표본 12일 · 적중 9일 (75%)"
}

const MIN_SAMPLE = 5;  // jp: 최소 표본 (이하면 표본부족 표시)

// jp: 조건(전날 미국 신호) 만족하는 날 → 다음날 한국 등락 평균
function calcSignalImpact(
  snapshots: DailySnapshot[],
  signalKey: string,
  signalThreshold: number,
  targetKeys: string[],
  direction: 'up' | 'down'  // 신호 방향 (up: 이상, down: 이하)
): { sample: number; averages: Record<string, number>; hitCount: number } {
  const averages: Record<string, number[]> = {};
  for (const k of targetKeys) averages[k] = [];
  let sample = 0;
  let hitCount = 0;

  for (let i = 0; i < snapshots.length - 1; i++) {
    const today = snapshots[i];
    const tomorrow = snapshots[i + 1];
    const signal = today.rates[signalKey];
    if (signal === undefined) continue;

    const triggered = direction === 'up' ? signal >= signalThreshold : signal <= signalThreshold;
    if (!triggered) continue;

    sample++;
    // jp: 다음날 한국 지표 평균에 누적
    let dayPositive = true;
    for (const k of targetKeys) {
      const v = tomorrow.rates[k];
      if (v !== undefined) {
        averages[k].push(v);
        if (v < 0) dayPositive = false;
      }
    }
    if (dayPositive) hitCount++;
  }

  const result: Record<string, number> = {};
  for (const k of targetKeys) {
    const arr = averages[k];
    result[k] = arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  }
  return { sample, averages: result, hitCount };
}

// jp: 시황 적중률 - '좋음' 예측한 날 다음날 코스피 상승 비율
function calcHitRate(snapshots: DailySnapshot[]): { sample: number; hitCount: number; rate: number } {
  let sample = 0;
  let hitCount = 0;
  for (let i = 0; i < snapshots.length - 1; i++) {
    const today = snapshots[i];
    const tomorrow = snapshots[i + 1];
    if (today.analysisStatus !== '좋음') continue;
    sample++;
    const kospi = tomorrow.rates['kr_kospi'];
    if (kospi !== undefined && kospi > 0) hitCount++;
  }
  const rate = sample > 0 ? (hitCount / sample) * 100 : 0;
  return { sample, hitCount, rate };
}

// jp: 전체 통계 계산
export async function computeAllStats(): Promise<StatResult[]> {
  const snapshots = await loadDailySnapshots();
  const results: StatResult[] = [];

  // 1) SOX → 한국 반도체
  {
    const r = calcSignalImpact(snapshots, 'us_sox', 3, ['kr_samsung', 'kr_skhynix'], 'up');
    results.push({
      key: 'sox_kr_semi',
      label: STAT_DEFS.sox_kr_semi.label,
      desc: STAT_DEFS.sox_kr_semi.desc,
      sampleSize: r.sample,
      hasEnoughData: r.sample >= MIN_SAMPLE,
      values: [
        { label: '삼성전자', value: r.sample > 0 ? r.averages.kr_samsung : null },
        { label: 'SK하이닉스', value: r.sample > 0 ? r.averages.kr_skhynix : null },
      ],
      hitInfo: r.sample > 0 ? `표본 ${r.sample}일 · 동반상승 ${r.hitCount}일 (${Math.round(r.hitCount / r.sample * 100)}%)` : null,
    });
  }

  // 2) VIX → 코스피
  {
    const r = calcSignalImpact(snapshots, 'us_vix', 10, ['kr_kospi'], 'up');
    results.push({
      key: 'vix_kospi',
      label: STAT_DEFS.vix_kospi.label,
      desc: STAT_DEFS.vix_kospi.desc,
      sampleSize: r.sample,
      hasEnoughData: r.sample >= MIN_SAMPLE,
      values: [{ label: '코스피 평균', value: r.sample > 0 ? r.averages.kr_kospi : null }],
      hitInfo: r.sample > 0 ? `표본 ${r.sample}일` : null,
    });
  }

  // 3) 나스닥 → 코스닥
  {
    const r = calcSignalImpact(snapshots, 'us_nasdaq', 2, ['kr_kosdaq'], 'up');
    results.push({
      key: 'nasdaq_kosdaq',
      label: STAT_DEFS.nasdaq_kosdaq.label,
      desc: STAT_DEFS.nasdaq_kosdaq.desc,
      sampleSize: r.sample,
      hasEnoughData: r.sample >= MIN_SAMPLE,
      values: [{ label: '코스닥 평균', value: r.sample > 0 ? r.averages.kr_kosdaq : null }],
      hitInfo: r.sample > 0 ? `표본 ${r.sample}일 · 동조 ${r.hitCount}일 (${Math.round(r.hitCount / r.sample * 100)}%)` : null,
    });
  }

  // 4) 시황 적중률
  {
    const r = calcHitRate(snapshots);
    results.push({
      key: 'hit_rate',
      label: STAT_DEFS.hit_rate.label,
      desc: STAT_DEFS.hit_rate.desc,
      sampleSize: r.sample,
      hasEnoughData: r.sample >= MIN_SAMPLE,
      values: [{ label: '적중률', value: r.sample > 0 ? r.rate : null }],
      hitInfo: r.sample > 0 ? `좋음 ${r.sample}회 중 ${r.hitCount}회 적중` : null,
    });
  }

  return results;
}

// jp: 노출 설정 조회
export async function getStatVisibility(): Promise<Record<string, boolean>> {
  try {
    const rows = await query<{ stat_key: string; is_visible: boolean }>(
      `SELECT stat_key, is_visible FROM briefing_stat_config`
    );
    const map: Record<string, boolean> = {};
    for (const r of rows) map[r.stat_key] = r.is_visible;
    return map;
  } catch {
    return {};
  }
}

// jp: 노출 설정 변경
export async function setStatVisibility(statKey: string, visible: boolean, updatedBy: string): Promise<boolean> {
  if (!STAT_DEFS[statKey]) return false;
  try {
    await query(
      `INSERT INTO briefing_stat_config (stat_key, is_visible, updated_at, updated_by)
       VALUES ($1, $2, now(), $3)
       ON CONFLICT (stat_key) DO UPDATE SET is_visible = $2, updated_at = now(), updated_by = $3`,
      [statKey, visible, updatedBy]
    );
    return true;
  } catch (err) {
    console.error('[BriefingStats] 노출 설정 실패:', err instanceof Error ? err.message : err);
    return false;
  }
}


// jp: ===== C방식: 현재 브리핑에 관련된 통계만 추출 =====
// jp: 브리핑의 실제 데이터가 통계 트리거 조건을 만족할 때만 그 통계를 보여줌

interface RelevantStat {
  key: string;
  label: string;
  message: string;   // jp: "과거 SOX 급등 시 한국 반도체 평균 +2.2% 올랐어요 (적중 75%)"
}

// jp: 통계별 트리거 조건 (현재 브리핑 데이터 기준)
const STAT_TRIGGERS: Record<string, { signalKey: string; threshold: number; direction: 'up' | 'down' }> = {
  sox_kr_semi:   { signalKey: 'us_sox',    threshold: 3,  direction: 'up' },
  vix_kospi:     { signalKey: 'us_vix',    threshold: 10, direction: 'up' },
  nasdaq_kosdaq: { signalKey: 'us_nasdaq', threshold: 2,  direction: 'up' },
};

// jp: 현재 브리핑 raw_data에서 특정 key 등락률 추출
function getRate(rawData: { items?: Array<{ key: string; changeRate: number }> } | null, key: string): number | undefined {
  return rawData?.items?.find(it => it.key === key)?.changeRate;
}

// jp: 현재 브리핑에 붙일 관련 통계 메시지 생성
// jp: 조건: 노출 ON + 표본 충분 + 현재 브리핑이 트리거 조건 충족
export async function getRelevantStats(
  currentRawData: { items?: Array<{ key: string; changeRate: number }> } | null
): Promise<RelevantStat[]> {
  const [allStats, visibility] = await Promise.all([
    computeAllStats(),
    getStatVisibility(),
  ]);

  const result: RelevantStat[] = [];

  for (const stat of allStats) {
    // jp: 노출 OFF면 제외 (표본 판단은 관리자에게 맡김)
    if (!visibility[stat.key]) continue;

    // jp: 적중률은 트리거 없이 항상 (노출+표본만 되면)
    if (stat.key === 'hit_rate') {
      const v = stat.values[0]?.value;
      if (v !== null && v !== undefined) {
        result.push({
          key: stat.key,
          label: stat.label,
          message: `이 시황 '좋음' 예측은 지금까지 ${Math.round(v)}% 적중했어요`,
        });
      }
      continue;
    }

    // jp: 트리거 조건 확인 (현재 브리핑 데이터가 조건 만족하나)
    const trig = STAT_TRIGGERS[stat.key];
    if (!trig) continue;
    const signal = getRate(currentRawData, trig.signalKey);
    if (signal === undefined) continue;
    const triggered = trig.direction === 'up' ? signal >= trig.threshold : signal <= trig.threshold;
    if (!triggered) continue;

    // jp: 메시지 생성
    if (stat.key === 'sox_kr_semi') {
      const sam = stat.values.find(v => v.label === '삼성전자')?.value ?? 0;
      const sk = stat.values.find(v => v.label === 'SK하이닉스')?.value ?? 0;
      const avg = (sam + sk) / 2;
      const sign = avg > 0 ? '+' : '';
      result.push({
        key: stat.key,
        label: stat.label,
        message: `과거 미국 반도체(SOX) 급등 시 한국 반도체가 평균 ${sign}${avg.toFixed(1)}% 따라 움직였어요`,
      });
    } else if (stat.key === 'vix_kospi') {
      const v = stat.values[0]?.value ?? 0;
      const sign = v > 0 ? '+' : '';
      result.push({
        key: stat.key,
        label: stat.label,
        message: `과거 공포지수(VIX) 급등 시 다음날 코스피가 평균 ${sign}${v.toFixed(1)}% 움직였어요`,
      });
    } else if (stat.key === 'nasdaq_kosdaq') {
      const v = stat.values[0]?.value ?? 0;
      const sign = v > 0 ? '+' : '';
      result.push({
        key: stat.key,
        label: stat.label,
        message: `과거 나스닥 강세 시 다음날 코스닥이 평균 ${sign}${v.toFixed(1)}% 따라 움직였어요`,
      });
    }
  }

  return result;
}


// jp: ===== 일자별 상세 (관리자 검증용 - 투자 판단 보조) =====

interface StatDetailRow {
  signalDate: string;     // 신호일 (미국 D)
  targetDate: string;     // 반응일 (한국 D+1)
  signalValue: number;    // 그날 신호 등락률 (예: SOX +6.4)
  targets: { label: string; value: number }[];  // 다음날 한국 반응
  hit: boolean;           // 방향 적중 여부
}

interface StatDetail {
  key: string;
  label: string;
  desc: string;
  rows: StatDetailRow[];
  sampleSize: number;
  hitCount: number;
  hitRate: number;        // 적중률 %
  averages: { label: string; mean: number; stdev: number }[];  // 평균 + 표준편차
}

// jp: 표준편차 계산
function stdev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const variance = arr.reduce((s, v) => s + (v - mean) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

// jp: 특정 통계의 일자별 상세
export async function getStatDetail(statKey: string): Promise<StatDetail | null> {
  const def = STAT_DEFS[statKey];
  if (!def) return null;

  const snapshots = await loadDailySnapshots();
  const rows: StatDetailRow[] = [];

  // jp: 적중률 통계는 별도 처리
  if (statKey === 'hit_rate') {
    for (let i = 0; i < snapshots.length - 1; i++) {
      const today = snapshots[i];
      const tomorrow = snapshots[i + 1];
      if (today.analysisStatus !== '좋음') continue;
      const kospi = tomorrow.rates['kr_kospi'];
      if (kospi === undefined) continue;
      rows.push({
        signalDate: today.date,
        targetDate: tomorrow.date,
        signalValue: 0,  // jp: 적중률은 신호값 대신 '좋음' 예측
        targets: [{ label: '코스피', value: kospi }],
        hit: kospi > 0,
      });
    }
    const hitCount = rows.filter(r => r.hit).length;
    const kospiVals = rows.map(r => r.targets[0].value);
    return {
      key: statKey, label: def.label, desc: def.desc, rows,
      sampleSize: rows.length, hitCount,
      hitRate: rows.length > 0 ? (hitCount / rows.length) * 100 : 0,
      averages: [{ label: '코스피', mean: kospiVals.length ? kospiVals.reduce((a,b)=>a+b,0)/kospiVals.length : 0, stdev: stdev(kospiVals) }],
    };
  }

  // jp: 신호 기반 통계
  const triggerMap: Record<string, { signalKey: string; threshold: number; targets: { key: string; label: string }[] }> = {
    sox_kr_semi:   { signalKey: 'us_sox',    threshold: 3,  targets: [{ key: 'kr_samsung', label: '삼성전자' }, { key: 'kr_skhynix', label: 'SK하이닉스' }] },
    vix_kospi:     { signalKey: 'us_vix',    threshold: 10, targets: [{ key: 'kr_kospi', label: '코스피' }] },
    nasdaq_kosdaq: { signalKey: 'us_nasdaq', threshold: 2,  targets: [{ key: 'kr_kosdaq', label: '코스닥' }] },
  };
  const trig = triggerMap[statKey];
  if (!trig) return null;

  for (let i = 0; i < snapshots.length - 1; i++) {
    const today = snapshots[i];
    const tomorrow = snapshots[i + 1];
    const signal = today.rates[trig.signalKey];
    if (signal === undefined || signal < trig.threshold) continue;

    const targets = trig.targets
      .map(t => ({ label: t.label, value: tomorrow.rates[t.key] }))
      .filter(t => t.value !== undefined) as { label: string; value: number }[];
    if (targets.length === 0) continue;

    // jp: 적중 = 모든 타깃이 상승 (VIX는 반대로 하락이 '적중')
    const hit = statKey === 'vix_kospi'
      ? targets.every(t => t.value < 0)   // VIX 급등 → 코스피 하락이 예상대로
      : targets.every(t => t.value > 0);  // 그 외 → 동반 상승

    rows.push({
      signalDate: today.date,
      targetDate: tomorrow.date,
      signalValue: signal,
      targets,
      hit,
    });
  }

  const hitCount = rows.filter(r => r.hit).length;
  // jp: 타깃별 평균/표준편차
  const averages = trig.targets.map(t => {
    const vals = rows.map(r => r.targets.find(x => x.label === t.label)?.value).filter((v): v is number => v !== undefined);
    return {
      label: t.label,
      mean: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0,
      stdev: stdev(vals),
    };
  });

  return {
    key: statKey, label: def.label, desc: def.desc, rows,
    sampleSize: rows.length, hitCount,
    hitRate: rows.length > 0 ? (hitCount / rows.length) * 100 : 0,
    averages,
  };
}
