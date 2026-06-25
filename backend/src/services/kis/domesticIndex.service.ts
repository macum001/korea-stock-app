// jp: 국내 지수(코스피/코스닥) 일자별 과거 데이터 (KIS inquire-daily-indexchartprice)
// jp: TR FHKUP03500100, output2 배열(stck_bsop_date, bstp_nmix_prpr ...)
// jp: KIS는 한 번에 ~100건 제한 → date 범위를 끊어서 여러 번 호출, 1년치 모음
// jp: 미국 지수(Yahoo)와 동일한 IndexHistoryItem 형식으로 반환

import axios from 'axios';
import { ENV } from '../../config/env';
import { getKisToken } from './kisAuth.service';
import { IndexHistoryItem } from './globalIndex.service';

// jp: 우리 코드 → KIS 업종 코드 (지수 일봉용)
// jp: 0001=코스피, 1001=코스닥
const CODE_TO_KIS: Record<string, string> = {
  '0001': '0001', // jp: 코스피
  '1001': '1001', // jp: 코스닥
};

const DAILY_INDEX_PATH = '/uapi/domestic-stock/v1/quotations/inquire-daily-indexchartprice';
const DAILY_INDEX_TR = 'FHKUP03500100';

// jp: KIS output2 한 행
interface KisDailyIndexRow {
  stck_bsop_date: string; // jp: YYYYMMDD
  bstp_nmix_prpr: string; // jp: 종가
}

// jp: YYYYMMDD 문자열 만들기 (KIS 파라미터용)
function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

// jp: YYYYMMDD → YYYY-MM-DD (응답용)
function fmtDate(ymd: string): string {
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
}

// jp: KIS 일봉 1구간 조회 (date1~date2, 최대 ~100건)
async function fetchOneChunk(
  kisCode: string,
  startYmd: string,
  endYmd: string,
  token: string,
): Promise<KisDailyIndexRow[]> {
  const res = await axios.get(`${ENV.KIS.BASE_URL}${DAILY_INDEX_PATH}`, {
    params: {
      fid_cond_mrkt_div_code: 'U',
      fid_input_iscd: kisCode,
      fid_input_date_1: startYmd,
      fid_input_date_2: endYmd,
      fid_period_div_code: 'D', // jp: D=일봉
    },
    headers: {
      'Content-Type': 'application/json',
      'authorization': `Bearer ${token}`,
      'appkey': ENV.KIS.APP_KEY,
      'appsecret': ENV.KIS.APP_SECRET,
      'tr_id': DAILY_INDEX_TR,
      'custtype': 'P',
    },
    timeout: 8000,
  });

  if (res.data?.rt_cd !== '0') {
    console.error(`[KIS] 지수 일봉 오류 (${kisCode}):`, res.data?.msg1);
    return [];
  }
  const output2 = res.data?.output2;
  return Array.isArray(output2) ? (output2 as KisDailyIndexRow[]) : [];
}

// jp: 국내 지수 일자별 과거 데이터 (최근 1년치, ~100일씩 끊어서 모음)
// jp: 미국 지수가 아니면(코스피/코스닥 외) 빈 배열
export async function getDomesticIndexHistory(code: string): Promise<IndexHistoryItem[]> {
  const kisCode = CODE_TO_KIS[code];
  if (!kisCode) return []; // jp: 국내 지수가 아니면 빈 배열

  // jp: 앱키 없으면 빈 배열 (가짜 데이터 금지)
  if (!ENV.KIS.APP_KEY || ENV.KIS.APP_KEY === 'your_app_key_here') return [];

  try {
    const token = await getKisToken();

    // jp: 오늘부터 과거로 100일씩 4구간 = 약 1년치(거래일 기준 ~250일 커버)
    // jp: KIS는 달력일 범위로 받으므로 넉넉히 100일씩 끊음
    const CHUNK_DAYS = 100;
    const CHUNKS = 4;
    const merged = new Map<string, KisDailyIndexRow>(); // jp: 날짜 중복 제거

    let end = new Date(); // jp: 오늘부터 시작
    for (let i = 0; i < CHUNKS; i++) {
      const start = new Date(end);
      start.setDate(start.getDate() - CHUNK_DAYS);

      const rows = await fetchOneChunk(kisCode, toYmd(start), toYmd(end), token);
      if (rows.length === 0) break; // jp: 더 이상 데이터 없으면 중단

      for (const r of rows) {
        if (r.stck_bsop_date && r.bstp_nmix_prpr) {
          merged.set(r.stck_bsop_date, r);
        }
      }

      // jp: 다음 구간은 이번 구간 시작 하루 전까지
      end = new Date(start);
      end.setDate(end.getDate() - 1);
    }

    // jp: 날짜 오름차순 정렬 후 전일 대비 계산
    const sorted = Array.from(merged.values()).sort((a, b) =>
      a.stck_bsop_date.localeCompare(b.stck_bsop_date)
    );

    const out: IndexHistoryItem[] = [];
    let prevClose: number | null = null;
    for (const r of sorted) {
      const close = parseFloat(r.bstp_nmix_prpr);
      if (isNaN(close)) continue;

      const change = prevClose !== null ? close - prevClose : 0;
      const changeRate = prevClose !== null && prevClose > 0 ? (change / prevClose) * 100 : 0;

      out.push({
        date: fmtDate(r.stck_bsop_date),
        close: parseFloat(close.toFixed(2)),
        change: parseFloat(change.toFixed(2)),
        changeRate: parseFloat(changeRate.toFixed(2)),
      });
      prevClose = close;
    }

    // jp: 최신 날짜가 위로 (리스트 표시용)
    out.reverse();
    return out;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[KIS] 국내 지수 history 실패 (${code}):`, msg);
    return [];
  }
}
