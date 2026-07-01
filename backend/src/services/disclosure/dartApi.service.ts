// jp: OpenDART API 실제 연결 서비스
// jp: API 키는 절대 로그에 출력하지 않음

import axios from 'axios';
import AdmZip from 'adm-zip';
import { XMLParser } from 'fast-xml-parser';
import { ENV } from '../../config/env';
import { DartListResponse, DartListItem, DartCorpCodeXmlItem } from '../../types/dart';
import { AppError } from '../../types/errors';

const DART_BASE_URL = 'https://opendart.fss.or.kr/api';
const CORP_CODE_ZIP_URL = 'https://opendart.fss.or.kr/api/corpCode.xml';

// jp: DART 원문 URL 생성
export function createDartOriginalUrl(receiptNo: string): string {
  return `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${receiptNo}`;
}

// jp: 날짜 포맷 YYYYMMDD
function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}

function getDateDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return formatDate(d);
}

// jp: DART API 공통 요청 함수
export async function requestDartApi<T>(
  path: string,
  params: Record<string, string | number> = {}
): Promise<T> {
  if (!ENV.DART.API_KEY) {
    throw new AppError('DART_API_ERROR', 'DART API 키가 설정되지 않았습니다.');
  }

  try {
    const res = await axios.get(`${DART_BASE_URL}${path}`, {
      params: {
        crtfc_key: ENV.DART.API_KEY,
        ...params,
      },
      timeout: 10000,
    });

    if (res.data?.status && res.data.status !== '000') {
      const status = res.data.status;
      if (status === '020') throw new AppError('DART_RATE_LIMIT', 'DART API 호출 제한 초과');
      // jp: status 013 = 조회 결과 없음 → 빈 응답으로 처리 (에러 아님)
      if (status === '013') return { ...res.data, list: [] } as T;
      throw new AppError('DART_API_ERROR', `DART API 오류: ${res.data.message}`);
    }

    return res.data as T;
  } catch (err) {
    if (err instanceof AppError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    throw new AppError('DART_API_ERROR', `DART API 요청 실패: ${msg}`);
  }
}

// jp: 최신 공시 목록 조회 (전체)
export async function fetchLatestDisclosures(
  startDate?: string,
  endDate?: string
): Promise<DartListItem[]> {
  const bgn_de = startDate || getDateDaysAgo(ENV.DISCLOSURE_SYNC_DAYS);
  const end_de = endDate   || formatDate(new Date());

  try {
    const all: DartListItem[] = [];
    const MAX_PAGES = 200;
    for (let page = 1; page <= MAX_PAGES; page++) {
      const res = await requestDartApi<DartListResponse>('/list.json', {
        bgn_de,
        end_de,
        page_no: page,
        page_count: 100,
      });
      const list = res.list || [];
      all.push(...list);
      const totalPage = res.total_page ? parseInt(String(res.total_page), 10) : page;
      if (list.length < 100 || page >= totalPage) break;
    }
    return all;
  } catch (err) {
    console.error('[DART] 최신 공시 조회 실패:', err instanceof Error ? err.message : err);
    return [];
  }
}

// jp: corp_code 기준 공시 조회
// jp: ★ 과거 공시 전체 수집 - MAX_PAGES 상향(20→100, 최대 1만건)으로 대형주 누락 해결
// jp:    (기존 20페이지=2000건 상한 때문에 삼성전자가 최근 ~7개월치만 들어왔던 문제 수정)
export async function fetchDisclosuresByCorpCode(
  corpCode: string,
  startDate?: string,
  endDate?: string
): Promise<DartListItem[]> {
  // jp: 기본 10년치 조회 (약 3650일)
  const bgn_de = startDate || getDateDaysAgo(3650);
  const end_de = endDate   || formatDate(new Date());

  try {
    const all: DartListItem[] = [];
    // jp: 대형주(삼성전자 등)는 10년이면 수천~1만건 → 상한 넉넉히. DART 페이지당 100건.
    const MAX_PAGES = 100; // jp: 최대 1만건 안전장치 (무한루프 방지용 상한)

    for (let page = 1; page <= MAX_PAGES; page++) {
      const res = await requestDartApi<DartListResponse>('/list.json', {
        corp_code:  corpCode,
        bgn_de,
        end_de,
        page_no:    page,
        page_count: 100,
      });

      const list = res.list || [];
      all.push(...list);

      const totalPage = res.total_page ? parseInt(String(res.total_page), 10) : page;

      // jp: 진행 로그 (대형주 수집 추적)
      if (page === 1) {
        console.log(`[DART backfill] corp_code(${corpCode}) 총 ${totalPage}페이지 / 예상 ${totalPage * 100}건`);
      }

      // jp: 마지막 페이지 도달하면 종료
      if (list.length < 100 || page >= totalPage) break;

      // jp: 상한 도달 경고 (1만건 넘는 초대형주)
      if (page === MAX_PAGES) {
        console.warn(`[DART backfill] corp_code(${corpCode}) ${MAX_PAGES}페이지 상한 도달 - 일부 과거 공시 누락 가능`);
      }
    }

    console.log(`[DART backfill] corp_code(${corpCode}) 수집 완료 - 총 ${all.length}건`);
    return all;
  } catch (err) {
    console.error(`[DART] corp_code(${corpCode}) 공시 조회 실패:`, err instanceof Error ? err.message : err);
    return [];
  }
}

// ============================================================
// jp: corp_code.xml 다운로드 및 파싱
// ============================================================

export async function fetchDartCorpCodeFile(): Promise<Buffer> {
  if (!ENV.DART.API_KEY) {
    throw new AppError('DART_CORP_CODE_SYNC_ERROR', 'DART API 키가 없습니다.');
  }

  try {
    console.log('[DART] corp_code.xml 다운로드 시작...');
    const res = await axios.get(CORP_CODE_ZIP_URL, {
      params: { crtfc_key: ENV.DART.API_KEY },
      responseType: 'arraybuffer',
      timeout: 30000,
    });
    console.log('[DART] corp_code.xml 다운로드 완료');
    return Buffer.from(res.data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new AppError('DART_CORP_CODE_SYNC_ERROR', `corp_code 파일 다운로드 실패: ${msg}`);
  }
}

export function parseCorpCodeXml(zipBuffer: Buffer): DartCorpCodeXmlItem[] {
  try {
    const zip = new AdmZip(zipBuffer);
    const xmlEntry = zip.getEntry('CORPCODE.xml');
    if (!xmlEntry) throw new Error('CORPCODE.xml 파일을 찾을 수 없습니다.');

    const xmlContent = xmlEntry.getData().toString('utf-8');

    const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: false });
    const parsed = parser.parse(xmlContent);
    const items = parsed?.result?.list;

    if (!items) return [];

    const list = Array.isArray(items) ? items : [items];

    return list.map((item: Record<string, string>) => ({
      corp_code:   String(item.corp_code  || '').trim(),
      corp_name:   String(item.corp_name  || '').trim(),
      stock_code:  String(item.stock_code || '').trim(),
      modify_date: String(item.modify_date || '').trim(),
    }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new AppError('DART_CORP_CODE_SYNC_ERROR', `XML 파싱 실패: ${msg}`);
  }
}

export async function checkDartApiHealth(): Promise<{ ok: boolean; message: string }> {
  if (!ENV.DART.API_KEY) {
    return { ok: false, message: 'DART_API_KEY 미설정' };
  }
  try {
    await requestDartApi('/list.json', {
      bgn_de: formatDate(new Date()),
      end_de: formatDate(new Date()),
      page_count: 1,
    });
    return { ok: true, message: 'DART API 정상' };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'DART API 연결 실패',
    };
  }
}
