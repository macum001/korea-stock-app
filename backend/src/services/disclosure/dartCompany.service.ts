// jp: DART 기업 코드 관리 서비스 - corp_code ↔ stock_code 매핑

import { db, query } from '../../config/db';
import { DartCompany } from '../../types/disclosure';
import { DartCorpCodeXmlItem } from '../../types/dart';
import { AppError } from '../../types/errors';
import { fetchDartCorpCodeFile, parseCorpCodeXml } from './dartApi.service';

// jp: 메모리 캐시 (DB 없을 때 fallback)
const companyCache = new Map<string, DartCompany>(); // jp: corpCode → company
const stockToCorpCache = new Map<string, string>();   // jp: stockCode → corpCode

// jp: 기본 매핑 (DB/API 없을 때 사용)
const DEFAULT_MAPPINGS: DartCompany[] = [
  { corpCode: '00164779', stockCode: '000660', corpName: 'SK하이닉스',      corpCls: 'Y' },
  { corpCode: '00126380', stockCode: '005930', corpName: '삼성전자',         corpCls: 'Y' },
  { corpCode: '00918444', stockCode: '042700', corpName: '한미반도체',       corpCls: 'K' },
  { corpCode: '00916184', stockCode: '196170', corpName: '알테오젠',         corpCls: 'K' },
  { corpCode: '00105947', stockCode: '034020', corpName: '두산에너빌리티',   corpCls: 'Y' },
  { corpCode: '00526929', stockCode: '035720', corpName: '카카오',           corpCls: 'K' },
  { corpCode: '00119650', stockCode: '035420', corpName: 'NAVER',            corpCls: 'Y' },
  { corpCode: '00861032', stockCode: '207940', corpName: '삼성바이오로직스', corpCls: 'Y' },
];

// jp: 초기 메모리 캐시 설정
function initDefaultCache(): void {
  DEFAULT_MAPPINGS.forEach(company => {
    companyCache.set(company.corpCode, company);
    if (company.stockCode) stockToCorpCache.set(company.stockCode, company.corpCode);
  });
}
initDefaultCache();

// ============================================================
// jp: 조회 함수
// ============================================================

// jp: stockCode → corpCode 변환
export async function getCorpCodeByStockCode(stockCode: string): Promise<string | null> {
  // jp: 1. 메모리 캐시
  const cached = stockToCorpCache.get(stockCode);
  if (cached) return cached;

  // jp: 2. DB 조회
  try {
    const rows = await query<{ corp_code: string }>(
      'SELECT corp_code FROM dart_companies WHERE stock_code = $1 LIMIT 1',
      [stockCode]
    );
    if (rows.length > 0) {
      stockToCorpCache.set(stockCode, rows[0].corp_code);
      return rows[0].corp_code;
    }
  } catch {
    // jp: DB 없으면 캐시만 사용
  }

  return null;
}

// jp: dart_companies 테이블 회사 수 (초기 동기화 필요 판단용)
export async function getDartCompanyCount(): Promise<number> {
  try {
    const rows = await query<{ cnt: string }>('SELECT COUNT(*) AS cnt FROM dart_companies');
    return parseInt(rows[0]?.cnt || '0') || 0;
  } catch {
    return 0;
  }
}

// jp: corpCode → 기업 정보 조회
export async function getCompanyByCorpCode(corpCode: string): Promise<DartCompany | null> {
  // jp: 1. 메모리 캐시
  const cached = companyCache.get(corpCode);
  if (cached) return cached;

  // jp: 2. DB 조회
  try {
    const rows = await query<{
      corp_code: string; stock_code: string; corp_name: string; corp_cls: string;
    }>(
      'SELECT corp_code, stock_code, corp_name, corp_cls FROM dart_companies WHERE corp_code = $1',
      [corpCode]
    );
    if (rows.length > 0) {
      const company: DartCompany = {
        corpCode:  rows[0].corp_code,
        stockCode: rows[0].stock_code,
        corpName:  rows[0].corp_name,
        corpCls:   rows[0].corp_cls,
      };
      companyCache.set(corpCode, company);
      return company;
    }
  } catch {
    // jp: DB 없으면 null 반환
  }

  return null;
}

// ============================================================
// jp: 동기화 함수
// ============================================================

// jp: DART corp_code.xml 전체 동기화
export async function syncDartCompanies(): Promise<{ total: number; saved: number; skipped: number }> {
  const result = { total: 0, saved: 0, skipped: 0 };

  try {
    // jp: 1. ZIP 다운로드
    const zipBuffer = await fetchDartCorpCodeFile();

    // jp: 2. XML 파싱
    const items: DartCorpCodeXmlItem[] = parseCorpCodeXml(zipBuffer);
    result.total = items.length;

    // jp: 3. 상장사만 필터 (stock_code 있는 것)
    const listedItems = items.filter(item => item.stock_code && item.stock_code.trim() !== '');
    console.log(`[DART] 전체 ${items.length}개 중 상장사 ${listedItems.length}개`);

    // jp: 4. DB upsert (배치 처리)
    const BATCH_SIZE = 100;
    for (let i = 0; i < listedItems.length; i += BATCH_SIZE) {
      const batch = listedItems.slice(i, i + BATCH_SIZE);
      await saveDartCompaniesBatch(batch);
      result.saved += batch.length;
    }

    // jp: 5. 메모리 캐시 갱신
    listedItems.forEach(item => {
      const company: DartCompany = {
        corpCode:   item.corp_code,
        stockCode:  item.stock_code || null,
        corpName:   item.corp_name,
        modifyDate: item.modify_date,
      };
      companyCache.set(item.corp_code, company);
      if (item.stock_code) stockToCorpCache.set(item.stock_code, item.corp_code);
    });

    console.log(`[DART] 기업 코드 동기화 완료: ${result.saved}개 저장`);
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError('DART_CORP_CODE_SYNC_ERROR', `기업 코드 동기화 실패: ${err}`);
  }

  return result;
}

// jp: 배치 upsert
async function saveDartCompaniesBatch(items: DartCorpCodeXmlItem[]): Promise<void> {
  if (items.length === 0) return;

  try {
    // jp: PostgreSQL unnest를 이용한 배치 upsert
    const corpCodes  = items.map(i => i.corp_code);
    const stockCodes = items.map(i => i.stock_code || null);
    const corpNames  = items.map(i => i.corp_name);
    const modifyDates = items.map(i => i.modify_date);

    await db.query(`
      INSERT INTO dart_companies (corp_code, stock_code, corp_name, modify_date, updated_at)
      SELECT * FROM UNNEST($1::text[], $2::text[], $3::text[], $4::text[])
        AS t(corp_code, stock_code, corp_name, modify_date),
        NOW() AS updated_at
      ON CONFLICT (corp_code) DO UPDATE SET
        stock_code  = EXCLUDED.stock_code,
        corp_name   = EXCLUDED.corp_name,
        modify_date = EXCLUDED.modify_date,
        updated_at  = NOW()
    `, [corpCodes, stockCodes, corpNames, modifyDates]);
  } catch (err) {
    // jp: DB 없으면 조용히 무시 (메모리 캐시만 사용)
    console.warn('[DART] DB 저장 실패 (메모리 캐시만 사용):', err instanceof Error ? err.message : err);
  }
}
