// jp: 전 종목 마스터 수집 서비스
// jp: KIS가 제공하는 종목 마스터 파일(.mst.zip)을 받아 파싱 → stock_master 테이블 저장
// jp: KOSPI/KOSDAQ 전 종목. 검색/관심추가의 기반 데이터
// jp: 가격은 여기 없음 (stock_prices가 담당). 여긴 코드/이름/시장/업종 메타만

import axios from 'axios';
import AdmZip from 'adm-zip';
import iconv from 'iconv-lite';
import { query, isDbReady } from '../../config/db';

const KOSPI_URL  = 'https://new.real.download.dws.co.kr/common/master/kospi_code.mst.zip';
const KOSDAQ_URL = 'https://new.real.download.dws.co.kr/common/master/kosdaq_code.mst.zip';

interface MasterRow {
  code: string;
  name: string;
  market: 'KOSPI' | 'KOSDAQ';
  isEtf: boolean;
}

// jp: .mst.zip 다운로드 → 압축 해제 → EUC-KR 텍스트 반환
async function downloadMst(url: string): Promise<string> {
  const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000 });
  const zip = new AdmZip(Buffer.from(res.data));
  const entries = zip.getEntries();
  if (entries.length === 0) throw new Error('빈 zip 파일');
  // jp: .mst는 EUC-KR 인코딩 → iconv로 디코딩
  const raw = entries[0].getData();
  return iconv.decode(raw, 'euc-kr');
}

// jp: KIS 마스터 파일 파싱 (KIS 공식 형식 기준)
// jp: 공식: rf1 = row[0 : len-228], 단축코드=rf1[0:9].trim, 표준코드=rf1[9:21], 한글명=rf1[21:].trim
// jp: (뒤 228바이트는 그룹코드/시총/업종 등 고정폭 메타)
function parseMst(text: string, market: 'KOSPI' | 'KOSDAQ'): MasterRow[] {
  const rows: MasterRow[] = [];
  // jp: 줄 분리 - \r\n, \r, \n 모두 대응
  const lines = text.split(/\r\n|\r|\n/);
  let zeroPrefixCount = 0; // jp: 진단 - 00으로 시작하는 코드 개수
  let skippedShort = 0;    // jp: 진단 - 길이 부족으로 스킵
  let skippedNoName = 0;   // jp: 진단 - 이름 없어 스킵
  for (const rawLine of lines) {
    const line = rawLine.replace(/[\r\n]+$/, '');
    if (line.length < 230) { if (line.trim().length > 0) skippedShort++; continue; }

    const rf1 = line.substring(0, line.length - 228);
    const shortCode = rf1.substring(0, 9).trim();   // jp: 단축코드 (예: A005930)
    const name = rf1.substring(21).trim();          // jp: 한글명

    // jp: 종목코드 - 단축코드에서 끝 6자리 숫자 (앞 'A'/'Q' 등 시장구분 문자 제거)
    const digits = shortCode.replace(/\D/g, '');
    if (digits.length < 6) continue;
    const code = digits.slice(-6);                   // jp: 끝 6자리 (앞자리 0 보존)
    if (!name) { skippedNoName++; continue; }

    if (code.startsWith('00')) zeroPrefixCount++;

    const isEtf = /KODEX|TIGER|KBSTAR|ARIRANG|HANARO|PLUS|SOL |ACE |ETF|ETN|레버리지|인버스/i.test(name);
    rows.push({ code, name, market, isEtf });
  }
  // jp: 진단 로그 - 00으로 시작하는 종목(삼성전자/SK하이닉스 등)이 파싱됐는지 확인
  console.log(`[종목마스터] ${market} 파싱: 총 ${rows.length}종목 (00시작 ${zeroPrefixCount}개, 길이부족스킵 ${skippedShort}, 이름없음스킵 ${skippedNoName})`);
  return rows;
}

// jp: DB 저장 (UPSERT - 이름 바뀌면 갱신)
async function saveMasterRows(rows: MasterRow[]): Promise<number> {
  if (!isDbReady() || rows.length === 0) return 0;
  let saved = 0;
  // jp: 한 번에 너무 큰 쿼리 방지 - 500개씩 나눠 INSERT
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const values: string[] = [];
    const params: unknown[] = [];
    chunk.forEach((r, idx) => {
      const b = idx * 4;
      values.push(`($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4})`);
      params.push(r.code, r.name, r.market, r.isEtf);
    });
    try {
      await query(
        `INSERT INTO stock_master (code, name, market, is_etf)
         VALUES ${values.join(',')}
         ON CONFLICT (code) DO UPDATE SET
           name = EXCLUDED.name,
           market = EXCLUDED.market,
           is_etf = EXCLUDED.is_etf,
           updated_at = NOW()`,
        params
      );
      saved += chunk.length;
    } catch (err) {
      console.error('[종목마스터] 청크 저장 실패:', err instanceof Error ? err.message : err);
    }
  }
  return saved;
}

// jp: 전체 동기화 (KOSPI + KOSDAQ)
export async function syncStockMaster(): Promise<void> {
  if (!isDbReady()) {
    console.warn('[종목마스터] DB 미연결 - 수집 건너뜀');
    return;
  }
  try {
    console.log('[종목마스터] KOSPI 마스터 다운로드 중...');
    const kospiText = await downloadMst(KOSPI_URL);
    const kospiRows = parseMst(kospiText, 'KOSPI');
    const kospiSaved = await saveMasterRows(kospiRows);
    console.log(`[종목마스터] KOSPI 저장 완료: ${kospiSaved}종목`);

    console.log('[종목마스터] KOSDAQ 마스터 다운로드 중...');
    const kosdaqText = await downloadMst(KOSDAQ_URL);
    const kosdaqRows = parseMst(kosdaqText, 'KOSDAQ');
    const kosdaqSaved = await saveMasterRows(kosdaqRows);
    console.log(`[종목마스터] KOSDAQ 저장 완료: ${kosdaqSaved}종목`);

    console.log(`[종목마스터] 전체 수집 완료: ${kospiSaved + kosdaqSaved}종목`);
  } catch (err) {
    console.error('[종목마스터] 수집 실패:', err instanceof Error ? err.message : err);
  }
}

// jp: 현재 마스터 종목 수 조회 (수집 필요 여부 판단용)
export async function getMasterCount(): Promise<number> {
  if (!isDbReady()) return 0;
  try {
    const rows = await query<{ cnt: string }>('SELECT COUNT(*) AS cnt FROM stock_master');
    return parseInt(rows[0]?.cnt || '0');
  } catch {
    return 0;
  }
}

// jp: [디버그] mst 파일에서 특정 코드 라인의 raw 구조를 그대로 반환 (파싱 진단용)
// jp: 삼성전자(005930)가 왜 누락되는지 실제 형식 확인
export async function debugMstLine(targetCode: string): Promise<unknown> {
  const result: Record<string, unknown> = { targetCode };
  for (const [market, url] of [['KOSPI', KOSPI_URL], ['KOSDAQ', KOSDAQ_URL]] as const) {
    try {
      const text = await downloadMst(url);
      const lines = text.split('\n');
      // jp: 대상 코드가 들어간 라인 찾기
      const found = lines.find(l => l.includes(targetCode));
      if (found) {
        const line = found.replace(/[\r\n]+$/, '');
        const rf1 = line.substring(0, line.length - 228);
        result[market] = {
          lineLength: line.length,
          first30Chars: JSON.stringify(line.substring(0, 30)),
          rf1Length: rf1.length,
          shortCode_0_9: JSON.stringify(rf1.substring(0, 9)),
          stdCode_9_21: JSON.stringify(rf1.substring(9, 21)),
          name_21_end: JSON.stringify(rf1.substring(21)),
          // jp: 현재 파서 결과
          parsedCode: (rf1.substring(0, 9).trim().replace(/\D/g, '') || '').slice(-6),
          parsedName: rf1.substring(21).trim(),
        };
      } else {
        result[market] = `'${targetCode}' 포함 라인 없음 (총 ${lines.length}줄)`;
      }
    } catch (err) {
      result[market] = '다운로드 실패: ' + (err instanceof Error ? err.message : '');
    }
  }
  return result;
}
