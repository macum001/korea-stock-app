// jp: ★ 날짜 구간 기준 전체 공시 백필 (종목 무관 - 비상장/펀드/상폐사까지 전부 수집)
// jp:
// jp: [왜 새로 만들었나]
// jp:   기존 disclosureBackfill 는 "상장 종목마다" 긁는 방식이라
// jp:   종목코드 없는 공시(펀드/자산유동화/채권/기타법인)와 상폐사 과거공시가 통째로 누락됨.
// jp:   이 스크립트는 DART list.json 을 corp_code 필터 없이 "날짜 구간"으로 쓸어담아
// jp:   그날 접수된 모든 공시를 빠짐없이 가져온다. (감사 스크립트와 동일 원리)
// jp:
// jp: [핵심] 하루 단위로 끊고, 그 하루를 끝까지 페이징한다.
// jp:        (보고서 마감일엔 하루 수천~1만건 → 한 번에 긁으면 잘림)
// jp:
// jp: [재실행 안전] rcept_no UNIQUE + upsert 로 중복은 자동 skip. 진행상태 파일로 재개.
// jp:
// jp: 실행:  npx ts-node backend/src/scripts/backfillByDateRange.ts            (최근 10년)
// jp:        npx ts-node backend/src/scripts/backfillByDateRange.ts 20160101 20261231

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { connectDB } from '../config/db';
import { ENV } from '../config/env';
import { classifyDisclosure, generateSummary } from '../services/disclosure/dart.service';
import { upsertDisclosure } from '../repositories/disclosure.repository';

const DART_LIST_URL = 'https://opendart.fss.or.kr/api/list.json';
const PAGE_COUNT = 100;            // jp: DART 페이지당 최대 100
const MAX_PAGES_PER_DAY = 200;     // jp: 하루 최대 2만건 안전장치 (자연 종료가 정상)
const REQUEST_DELAY_MS = 60;       // jp: 연속조회 차단 방지
const PROGRESS_FILE = path.join(__dirname, '.backfill_progress.txt');

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// jp: YYYYMMDD <-> Date
function toYmd(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}
function fromYmd(s: string): Date {
  return new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T00:00:00Z`);
}
function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setUTCDate(c.getUTCDate() + n);
  return c;
}

// jp: DART list.json 한 페이지 호출 (rate limit 자동 재시도)
async function fetchPage(bgn: string, end: string, page: number): Promise<any> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await axios.get(DART_LIST_URL, {
      params: {
        crtfc_key: ENV.DART.API_KEY,
        bgn_de: bgn,
        end_de: end,
        page_no: page,
        page_count: PAGE_COUNT,
        // jp: corp_code / corp_cls 미지정 = 전체 시장(Y/K/N/E) + 펀드 등 전부
      },
      timeout: 15000,
    });
    const status = res.data?.status;
    if (status === '013') return { list: [], total_page: 0 }; // jp: 데이터 없음
    if (status === '020') {                                    // jp: 호출 제한 → 대기 후 재시도
      console.warn(`  [rate limit] 대기 후 재시도 (${attempt + 1}/5)`);
      await sleep(2000 * (attempt + 1));
      continue;
    }
    if (status !== '000') throw new Error(`DART status ${status}: ${res.data?.message}`);
    return res.data;
  }
  throw new Error('rate limit 재시도 초과');
}

// jp: list.json item -> 기존 Disclosure 구조로 매핑 (dart.service.ts 와 동일 규칙)
function mapItem(item: Record<string, string>) {
  const { importance, sentiment } = classifyDisclosure(item.report_nm);
  return {
    stockCode:   item.stock_code || null,   // jp: 비상장/펀드는 빈값 → null 허용 필요
    stockName:   item.corp_name,
    corpCode:    item.corp_code,
    reportName:  item.report_nm,
    receiptNo:   item.rcept_no,
    importance,
    sentiment,
    summary:     generateSummary(item.report_nm, item.corp_name),
    originalUrl: `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${item.rcept_no}`,
    disclosedAt: new Date(item.rcept_dt.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3')).toISOString(),
  };
}

// jp: 하루치 전체 수집 (그 하루를 끝까지 페이징)
async function backfillOneDay(ymd: string): Promise<{ inserted: number; skipped: number; total: number }> {
  let inserted = 0, skipped = 0, total = 0;

  for (let page = 1; page <= MAX_PAGES_PER_DAY; page++) {
    const data = await fetchPage(ymd, ymd, page);
    const list: Record<string, string>[] = data.list || [];
    total += list.length;

    for (const item of list) {
      try {
        const { saved } = await upsertDisclosure(mapItem(item) as any);
        if (saved) inserted++; else skipped++;
      } catch (e) {
        // jp: 개별 실패는 건너뜀 (전체 중단 방지). stock_code NOT NULL 제약이면 여기서 터짐 → 스키마 수정 필요
        console.error(`    upsert 실패 rcept_no=${item.rcept_no}:`, e instanceof Error ? e.message : e);
      }
    }

    const totalPage = data.total_page ? parseInt(String(data.total_page), 10) : page;
    if (list.length < PAGE_COUNT || page >= totalPage) break;
    if (page === MAX_PAGES_PER_DAY) {
      console.warn(`  [경고] ${ymd} ${MAX_PAGES_PER_DAY}페이지 상한 도달 - 상한을 올려야 함`);
    }
    await sleep(REQUEST_DELAY_MS);
  }

  return { inserted, skipped, total };
}

function readProgress(): string | null {
  try { return fs.readFileSync(PROGRESS_FILE, 'utf-8').trim() || null; } catch { return null; }
}
function writeProgress(ymd: string): void {
  fs.writeFileSync(PROGRESS_FILE, ymd, 'utf-8');
}

async function main(): Promise<void> {
  if (!ENV.DART.API_KEY) { console.error('DART API 키 없음'); process.exit(1); }
  await connectDB();

  const argStart = process.argv[2];
  const argEnd   = process.argv[3];
  const endDate   = argEnd ? fromYmd(argEnd) : new Date();
  const defaultStart = addDays(new Date(), -3650); // jp: 최근 10년
  let startDate = argStart ? fromYmd(argStart) : defaultStart;

  // jp: 이전 실행 이어받기 (중단된 날 다음날부터)
  const resumed = readProgress();
  if (resumed && !argStart) {
    const next = addDays(fromYmd(resumed), 1);
    if (next > startDate) {
      startDate = next;
      console.log(`[resume] ${resumed} 까지 완료됨 → ${toYmd(startDate)} 부터 재개`);
    }
  }

  console.log(`=== 날짜 기준 백필 시작: ${toYmd(startDate)} ~ ${toYmd(endDate)} ===`);
  let grandInserted = 0, grandSkipped = 0, grandTotal = 0;

  for (let d = new Date(startDate); d <= endDate; d = addDays(d, 1)) {
    const ymd = toYmd(d);
    const { inserted, skipped, total } = await backfillOneDay(ymd);
    grandInserted += inserted; grandSkipped += skipped; grandTotal += total;
    writeProgress(ymd);
    if (total > 0) {
      console.log(`${ymd}  접수 ${total.toString().padStart(5)}  신규 ${inserted.toString().padStart(5)}  중복 ${skipped.toString().padStart(5)}  (누적 신규 ${grandInserted.toLocaleString()})`);
    }
    await sleep(REQUEST_DELAY_MS);
  }

  console.log(`\n=== 완료 ===`);
  console.log(`접수 총합 ${grandTotal.toLocaleString()} / 신규 ${grandInserted.toLocaleString()} / 중복 ${grandSkipped.toLocaleString()}`);
  console.log(`이 '접수 총합'이 감사 스크립트의 total_count(약 220만)와 맞으면 누락 해결.`);
  process.exit(0);
}

main().catch(err => { console.error('백필 실패:', err); process.exit(1); });
