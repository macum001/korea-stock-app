// jp: 종목 마스터 조회/검색 저장소

import { query, isDbReady } from '../config/db';

export interface StockMasterItem {
  code: string;
  name: string;
  market: string;
  sector: string | null;
  isEtf: boolean;
}

// jp: 한글 검색어 → DB 영문 종목명 별칭 (DB에 영문으로 저장된 종목 한글 검색 지원)
// jp: 예: "네이버" 검색 → DB의 "NAVER"도 매칭
const SEARCH_ALIASES: Record<string, string[]> = {
  '네이버': ['NAVER'],
  'sk하이닉스': ['SK하이닉스'],
  '에스케이하이닉스': ['SK하이닉스'],
  '엘지': ['LG'],
  '엘지전자': ['LG전자'],
  '엘지화학': ['LG화학'],
  '엘지에너지솔루션': ['LG에너지솔루션'],
  '포스코': ['POSCO', 'POSCO홀딩스'],
  '케이티': ['KT'],
  '에스케이': ['SK'],
  '제이와이피': ['JYP'],
  '와이지': ['YG'],
};

// jp: 종목 검색 (이름 또는 코드 부분일치). 검색은 전부 DB에서 처리 (KIS 호출 X)
export async function searchStockMaster(keyword: string, limit = 30): Promise<StockMasterItem[]> {
  if (!isDbReady() || !keyword.trim()) return [];
  const kw = keyword.trim();
  try {
    // jp: 한글 별칭 → 영문명 추가 매칭 (네이버 → NAVER 등)
    const aliases = SEARCH_ALIASES[kw.toLowerCase()] ?? [];
    const aliasConds = aliases.map((_, i) => `name ILIKE $${7 + i}`).join(' OR ');
    const aliasParams = aliases.map(a => `%${a}%`);

    const rows = await query<{
      code: string; name: string; market: string; sector: string | null; is_etf: boolean;
    }>(
      `SELECT code, name, market, sector, is_etf
         FROM stock_master
        WHERE name ILIKE $1 OR code LIKE $2${aliasConds ? ' OR ' + aliasConds : ''}
        ORDER BY
          CASE WHEN code = $3 THEN 0 WHEN name = $4 THEN 1 ELSE 2 END,
          is_etf ASC,
          CASE WHEN name ILIKE $5 THEN 0 ELSE 1 END,
          length(name),
          name
        LIMIT $6`,
      [`%${kw}%`, `${kw}%`, kw, kw, `${kw}%`, limit, ...aliasParams]
    );

    const found = rows.map(r => ({
      code: r.code, name: r.name, market: r.market, sector: r.sector, isEtf: r.is_etf,
    }));

    // jp: stock_master에 없는 종목 보완 - dart_companies(전체 상장사)에서도 검색
    // jp: stock_master가 일부 종목(00으로 시작 등)을 놓쳐도 dart_companies로 커버
    if (found.length < limit) {
      const existing = new Set(found.map(s => s.code));
      const supplement = await searchDartCompanies(kw, limit - found.length, existing);
      found.push(...supplement);
    }
    return found;
  } catch {
    return [];
  }
}

// jp: dart_companies(DART 전체 상장사 목록)에서 종목 검색 - stock_master 보완용
async function searchDartCompanies(
  kw: string, limit: number, exclude: Set<string>
): Promise<StockMasterItem[]> {
  try {
    const rows = await query<{ stock_code: string; corp_name: string; corp_cls: string | null }>(
      `SELECT stock_code, corp_name, corp_cls
         FROM dart_companies
        WHERE stock_code IS NOT NULL AND stock_code <> ''
          AND (corp_name ILIKE $1 OR stock_code LIKE $2)
        ORDER BY
          CASE WHEN stock_code = $3 THEN 0 WHEN corp_name = $4 THEN 1 ELSE 2 END,
          CASE WHEN corp_name ILIKE $5 THEN 0 ELSE 1 END,
          length(corp_name), corp_name
        LIMIT $6`,
      [`%${kw}%`, `${kw}%`, kw, kw, `${kw}%`, limit]
    );
    return rows
      .filter(r => !exclude.has(r.stock_code))
      .map(r => ({
        code: r.stock_code,
        name: r.corp_name,
        // jp: corp_cls Y=유가증권(코스피), K=코스닥
        market: r.corp_cls === 'K' ? 'KOSDAQ' : 'KOSPI',
        sector: null,
        isEtf: false,
      }));
  } catch {
    return [];
  }
}

// jp: 종목코드로 종목명 조회 (stock_master → 없으면 dart_companies)
// jp: 관심종목 등에서 코드만 있고 이름이 없을 때 보완
export async function getStockNameByCode(code: string): Promise<string | null> {
  if (!isDbReady() || !code) return null;
  try {
    const m = await query<{ name: string }>(
      `SELECT name FROM stock_master WHERE code = $1 LIMIT 1`, [code]
    );
    if (m.length > 0) return m[0].name;
    const d = await query<{ corp_name: string }>(
      `SELECT corp_name FROM dart_companies WHERE stock_code = $1 LIMIT 1`, [code]
    );
    return d.length > 0 ? d[0].corp_name : null;
  } catch {
    return null;
  }
}

// jp: 코드 리스트로 종목 조회 (증권 탭 주요 종목용). 입력 순서 유지
// jp: 종목명/시장은 DB에서 정확히 가져옴. DB에 없는 코드는 제외
export async function getStocksByCodes(codes: string[]): Promise<StockMasterItem[]> {
  if (!isDbReady() || codes.length === 0) return [];
  try {
    const rows = await query<{
      code: string; name: string; market: string; sector: string | null; is_etf: boolean;
    }>(
      `SELECT code, name, market, sector, is_etf FROM stock_master WHERE code = ANY($1)`,
      [codes]
    );
    // jp: 입력 codes 순서대로 정렬 (대략 시총순 유지)
    const byCode = new Map(rows.map(r => [r.code, r]));
    const ordered: StockMasterItem[] = [];
    for (const code of codes) {
      const r = byCode.get(code);
      if (r) ordered.push({ code: r.code, name: r.name, market: r.market, sector: r.sector, isEtf: r.is_etf });
    }
    return ordered;
  } catch {
    return [];
  }
}

// jp: 전 종목 마스터 목록 (증권 탭 - 상장사 전체). ETF/ETN 제외 옵션
// jp: 코드만이 아니라 이름/시장/섹터 포함 (목록 표시용)
export async function getAllStockMaster(excludeEtf = true): Promise<StockMasterItem[]> {
  if (!isDbReady()) return [];
  try {
    const sql = excludeEtf
      ? `SELECT code, name, market, sector, is_etf FROM stock_master WHERE is_etf = false ORDER BY name`
      : `SELECT code, name, market, sector, is_etf FROM stock_master ORDER BY name`;
    const rows = await query<{
      code: string; name: string; market: string; sector: string | null; is_etf: boolean;
    }>(sql);
    return rows.map(r => ({
      code: r.code, name: r.name, market: r.market, sector: r.sector, isEtf: r.is_etf,
    }));
  } catch {
    return [];
  }
}

// jp: 전 종목 코드 목록 (공시 backfill 대상). ETF/ETN 제외 옵션
export async function getAllStockCodes(excludeEtf = true): Promise<string[]> {
  if (!isDbReady()) return [];
  try {
    const sql = excludeEtf
      ? `SELECT code FROM stock_master WHERE is_etf = false ORDER BY code`
      : `SELECT code FROM stock_master ORDER BY code`;
    const rows = await query<{ code: string }>(sql);
    return rows.map(r => r.code);
  } catch {
    return [];
  }
}

// jp: 단일 종목 메타 조회
export async function getStockMasterByCode(code: string): Promise<StockMasterItem | null> {
  if (!isDbReady()) return null;
  try {
    const rows = await query<{
      code: string; name: string; market: string; sector: string | null; is_etf: boolean;
    }>(
      `SELECT code, name, market, sector, is_etf FROM stock_master WHERE code = $1 LIMIT 1`,
      [code]
    );
    if (rows.length === 0) return null;
    const r = rows[0];
    return { code: r.code, name: r.name, market: r.market, sector: r.sector, isEtf: r.is_etf };
  } catch {
    return null;
  }
}
