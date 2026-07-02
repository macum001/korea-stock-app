// jp: DART 공시 원문 추출 서비스
// jp: OpenDART document.xml API → ZIP → 텍스트 추출 → 핵심 섹션 추출
// jp: 하이브리드: 재무 키워드 발췌(분기/사업보고서) → 공시유형별 핵심 섹션 → fallback

import axios from 'axios';
import AdmZip from 'adm-zip';
import { ENV } from '../../config/env';

const DOC_URL = 'https://opendart.fss.or.kr/api/document.xml';
const MAX_FALLBACK_CHARS = 20000;
const SNIPPET_LEN = 400; // jp: 라벨 주변 추출 길이 (표·선정경위 등 긴 항목 대응, 기존 150 → 400)

// jp: 원문 추출 결과
export interface DartDocResult {
  ok: boolean;
  text: string;
  mode: 'section' | 'fallback' | 'none';
  rawLength: number;
}

// jp: 1) document API로 원문 ZIP 받아서 텍스트 추출
export async function fetchDartDocumentText(receiptNo: string): Promise<{ text: string; rawLength: number } | null> {
  if (!ENV.DART.API_KEY || ENV.DART.API_KEY === 'your_dart_api_key_here') return null;

  try {
    const res = await axios.get(DOC_URL, {
      params: { crtfc_key: ENV.DART.API_KEY, rcept_no: receiptNo },
      responseType: 'arraybuffer',
      timeout: 30000,
    });

    const buf = Buffer.from(res.data);

    if (buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4b) {
      const errText = buf.toString('utf-8').slice(0, 300);
      console.warn(`[DART원문] ZIP 아님 (에러 가능): ${errText}`);
      return null;
    }

    const zip = new AdmZip(buf);
    const entries = zip.getEntries();
    if (entries.length === 0) return null;

    let raw = '';
    for (const entry of entries) {
      if (entry.isDirectory) continue;
      const content = entry.getData();
      raw += decodeKorean(content) + '\n';
    }

    const text = stripMarkup(raw);
    return { text, rawLength: text.length };
  } catch (err) {
    console.error('[DART원문] 조회 실패:', err instanceof Error ? err.message : err);
    return null;
  }
}

// jp: 2) 핵심 섹션 추출 + fallback
export async function extractDisclosureCore(
  receiptNo: string,
  reportName: string
): Promise<DartDocResult> {
  const doc = await fetchDartDocumentText(receiptNo);
  if (!doc || !doc.text || doc.text.trim().length < 20) {
    return { ok: false, text: '', mode: 'none', rawLength: 0 };
  }

  // jp: 재무 키워드 발췌는 "재무/실적 공시"일 때만 (분기/반기/사업보고서/실적/손익구조)
  // jp: [수정] 기존 if(true)는 모든 공시에 재무발췌를 강제 → 증자/배당 공시의
  // jp: 대상자 재무표가 먼저 잡혀 발행가·배당금 등 핵심 누락. 재무 공시일 때만 적용.
  const isFinancialReport = /분기보고서|반기보고서|사업보고서|결산|잠정실적|영업.{0,3}실적|매출액또는손익|손익구조/.test(reportName);
  if (isFinancialReport) {
    const fin = extractFinancialSection(doc.text, reportName);
    if (fin && fin.length > 60) {
      return { ok: true, text: fin, mode: 'section', rawLength: doc.rawLength };
    }
  }

  const section = extractCoreSection(doc.text, reportName);
  if (section && section.length > 30) {
    return { ok: true, text: section, mode: 'section', rawLength: doc.rawLength };
  }

  // jp: 재무 공시가 아니어서 위 재무발췌를 건너뛴 경우라도, 유형별 추출이 비면 재무발췌 시도
  if (!isFinancialReport) {
    const fin = extractFinancialSection(doc.text, reportName);
    if (fin && fin.length > 60) {
      return { ok: true, text: fin, mode: 'section', rawLength: doc.rawLength };
    }
  }

  return {
    ok: true,
    text: doc.text.slice(0, MAX_FALLBACK_CHARS),
    mode: 'fallback',
    rawLength: doc.rawLength,
  };
}

// jp: ===== 재무 핵심 발췌 =====
function extractFinancialSection(text: string, reportName: string): string | null {
  const FIN_KEYS = [
    '매출액', '영업이익', '영업손실', '당기순이익', '당기순손실', '법인세',
    '자산총계', '부채총계', '자본총계', '유동자산', '유동부채', '매출총이익',
    '판매비와관리비', '재무상태표', '손익계산서', '포괄손익',
    '영업활동현금흐름', '투자활동현금흐름', '재무활동현금흐름', '현금및현금성자산', '현금흐름',
    '감사의견', '적정의견', '한정의견', '부적정', '의견거절', '계속기업', '강조사항', '핵심감사사항',
    '특수관계자', '우발부채', '우발채무', '소송', '지급보증', '담보제공', '채무보증',
    '최대주주', '주요주주', '차입금', '사채', '전환사채', '신주인수권',
    '자본금', '자본잠식', '결손금', '미처리결손금', '관리종목', '상장폐지', '상장적격성', '영업손실', '감사범위제한',
  ];
  const found: { idx: number; key: string }[] = [];
  for (const k of FIN_KEYS) {
    let from = 0;
    while (true) {
      const idx = text.indexOf(k, from);
      if (idx < 0) break;
      found.push({ idx, key: k });
      from = idx + k.length;
      if (found.length > 120) break;
    }
  }
  if (found.length === 0) return null;
  found.sort((a, b) => a.idx - b.idx);

  const WINDOW = 400;
  const ranges: { start: number; end: number }[] = [];
  for (const f of found) {
    const start = Math.max(0, f.idx - 80);
    const end = Math.min(text.length, f.idx + WINDOW);
    const last = ranges[ranges.length - 1];
    if (last && start <= last.end) {
      last.end = Math.max(last.end, end);
    } else {
      ranges.push({ start, end });
    }
  }

  let out = `[공시 제목] ${reportName}\n[재무 핵심 발췌]\n`;
  for (const r of ranges) {
    const seg = text.slice(r.start, r.end).replace(/\s+/g, ' ').trim();
    if (seg.length > 20) out += seg + '\n---\n';
    if (out.length > 28000) break;
  }
  return out.length > 60 ? out : null;
}

// jp: ===== 핵심 섹션 추출 (공시유형별 키워드) =====
// jp: [전면 보강] 투자자 관점 필수 항목 기준으로 라벨 확충. 추출 길이도 400자로 확대.
function extractCoreSection(text: string, reportName: string): string | null {
  const name = reportName || '';

  let labels: string[] = [];
  if (/전환사채|CB|신주인수권|BW|교환사채|EB/.test(name)) {
    // jp: 투자자 핵심 = 발행규모/전환가/리픽싱 한도/이자율/풋콜옵션/희석규모/대상자
    labels = ['사채의 종류', '권면총액', '발행총액', '발행금액', '전환가액', '전환가격', '전환비율',
      '전환청구', '전환에 따라', '전환가능', '행사가액', '리픽싱', '최저 조정', '최저조정', '조정가액', '시가하락',
      '표면이자율', '만기이자율', '이자율', '사채만기', '만기일', '조기상환', '풋옵션', '콜옵션', '매도청구',
      '조달금액', '자금조달', '자금의 사용', '납입일', '대상자', '특정인'];
  } else if (/유상증자|무상증자|증자/.test(name)) {
    // jp: 투자자 핵심 = 발행가/할인율/기준주가/증자전후주식수(희석)/자금용도/배정대상자+선정경위/보호예수
    labels = ['신주의 종류', '발행주식', '신주 수', '발행가액', '발행가격', '기준주가', '할인율', '할증율',
      '주당', '증자방식', '증자전', '증자 전', '발행주식총수', '배정', '신주 배정', '제3자배정 대상자', '대상자별',
      '선정경위', '최대주주와의 관계', '회사 또는', '자금조달', '조달금액', '자금의 사용', '운영자금', '시설자금',
      '채무상환', '타법인', '납입일', '상장 예정', '증자 목적', '발행 목적', '보호예수', '보호예수기간'];
  } else if (/배당/.test(name)) {
    // jp: 투자자 핵심 = 주당배당금/시가배당률/총액/기준일/지급일/배당성향/배당락
    labels = ['1주당 배당금', '주당 배당', '배당금', '배당금총액', '배당수익률', '시가배당률', '배당률',
      '배당성향', '배당기준일', '배당락', '배당구분', '배당종류', '지급 예정', '지급예정'];
  } else if (/공급계약|단일판매|수주|계약체결/.test(name)) {
    // jp: 투자자 핵심 = 계약금액/최근매출액 대비 비율(규모체감)/계약상대/기간/조건부 여부
    labels = ['계약금액', '계약 금액', '계약상대', '계약 상대', '계약상대방', '최근 매출액', '매출액 대비', '매출 대비',
      '계약기간', '계약 내용', '판매·공급', '공급지역', '계약(수주)', '계약일자', '시작일', '종료일',
      '조건', '확정 여부', '비고'];
  } else if (/자기주식|자사주/.test(name)) {
    // jp: 투자자 핵심 = 소각 vs 단순보유(중요)/취득규모/방법(직접·신탁)/발행주식 대비 비율/기간
    labels = ['취득예정', '취득 예정', '취득금액', '취득 목적', '소각', '처분', '취득방법', '직접 취득', '신탁',
      '취득예정기간', '취득 기간', '보유주식', '취득 주식', '발행주식총수', '발행주식 대비', '취득 비율', '취득 단가'];
  } else if (/횡령|배임/.test(name)) {
    // jp: 투자자 핵심 = 금액/자기자본 대비 비율/대상자/진행상황
    labels = ['횡령', '배임', '발생금액', '금액', '자기자본', '자기자본 대비', '비율', '발생 일자', '대상자', '임원', '진행'];
  } else if (/감자/.test(name)) {
    // jp: 투자자 핵심 = 감자비율/방법(무상유상)/목적(결손보전?)/감자전후 자본금/거래정지
    labels = ['감자비율', '감자 비율', '감자방법', '무상감자', '유상감자', '감자 목적', '결손', '감자 전', '감자 후',
      '자본금', '주식수', '거래정지', '기준일', '매매거래정지'];
  } else if (/주주명부폐쇄|명의개서|기준일설정|권리주주/.test(name)) {
    labels = ['기준일', '명의개서정지기간', '명의개서 정지기간', '시작일', '종료일', '설정사유', '설정 사유', '권리주주', '주주명부', '목적'];
  } else if (/최대주주.*변경|최대주주변경|경영권.*변경/.test(name)) {
    // jp: 투자자 핵심 = 변경 전후 주주/지분율/변경사유(M&A·상속·담보실행)/취득자금(차입이면 위험)/주식담보
    labels = ['명칭', '성명', '법인명', '소유 주식 수', '소유주식수', '지분율', '변경 전', '변경 후', '변경전', '변경후',
      '변경 사유', '변경사유', '취득', '양수', '주식양수도', '자금조달', '차입', '주식담보', '담보권', '담보설정금액', '담보제공', '계약 체결일'];
  } else if (/매출액또는손익구조|매출액.*손익|손익구조/.test(name)) {
    labels = ['매출액', '영업이익', '법인세비용차감전', '당기순이익', '증감금액', '증감비율', '흑자', '적자', '전환',
      '자산총계', '부채총계', '자본총계', '자본금', '결산기간', '재무제표의 종류', '비고'];
  } else if (/상장폐지|정리매매/.test(name)) {
    labels = ['상장폐지', '정리매매', '법원', '결정', '사유', '신청일', '결정일자', '효력', '절차', '매매기간', '이의신청'];
  } else if (/관리종목|투자주의환기|불성실공시/.test(name)) {
    labels = ['관리종목', '지정', '사유', '시가총액', '미달', '미만', '상장규정', '매매거래일', '해제', '요건', '벌점'];
  } else if (/거래정지|매매거래정지/.test(name)) {
    labels = ['정지', '사유', '기간', '재개', '해제', '거래정지', '시작일', '종료일'];
  } else if (/합병/.test(name)) {
    // jp: 투자자 핵심 = 합병방식/비율/상대회사/합병가액/주식매수청구가+기간/우회상장/목적
    labels = ['합병', '합병비율', '합병 비율', '합병방법', '합병가액', '합병기일', '존속회사', '소멸회사', '상대회사', '신주',
      '상장 예정', '주식매수청구', '매수청구가격', '매수예정가격', '청구기간', '합병목적', '합병 목적', '우회상장', '신설'];
  } else if (/회사.*분할|분할합병|인적분할|물적분할/.test(name)) {
    labels = ['분할', '분할방법', '분할비율', '인적분할', '물적분할', '존속회사', '신설회사', '분할기일', '분할 목적',
      '주식매수청구', '매수청구가격', '재상장', '신주배정'];
  } else if (/회생|파산|부도|당좌거래정지/.test(name)) {
    labels = ['신청', '법원', '사건', '신청일', '결정', '금액', '사유', '회생', '파산', '부도', '당좌', '채권자', '상장폐지'];
  } else if (/전환청구권행사|신주인수권행사/.test(name)) {
    // jp: 투자자 핵심 = 이번 행사 주식수/전환가/상장일/누적 발행 + 총발행주식 대비(희석)
    labels = ['전환', '행사', '주식 수', '주식수', '전환가액', '행사가액', '상장 예정', '발행주식총수', '발행주식', '청구', '미상환', '잔액'];
  } else if (/주식소각|이익소각/.test(name)) {
    // jp: 투자자 핵심 = 소각 주식수/방법/소각 후 발행주식/취득재원
    labels = ['소각', '소각 주식', '소각방법', '소각 후', '발행주식총수', '발행주식', '취득', '자기주식', '소각 예정일', '소각금액'];
  } else if (/주식.*분할|주식.*병합|액면분할|액면병합/.test(name)) {
    labels = ['분할', '병합', '비율', '액면', '액면가', '기준일', '변경상장', '거래정지', '발행주식', '목적'];
  } else if (/소송|손해배상|가처분/.test(name)) {
    // jp: 투자자 핵심 = 청구금액/자기자본 대비 비율(규모)/원고피고/사건내용/진행단계/영향
    labels = ['소송', '청구', '청구금액', '금액', '자기자본', '자기자본 대비', '원고', '피고', '사건', '법원', '내용', '제기', '진행', '영향'];
  } else if (/영업양수도|자산양수도|영업양수|자산양수/.test(name)) {
    labels = ['양수', '양도', '대상', '금액', '자기자본', '자기자본 대비', '비율', '상대방', '목적', '양수도 기준일', '거래상대'];
  } else if (/채무보증|담보제공|채무인수/.test(name)) {
    labels = ['채무', '보증', '담보', '금액', '자기자본', '자기자본 대비', '비율', '상대', '제공', '기간', '특수관계'];
  } else if (/조회공시|풍문|보도|해명/.test(name)) {
    labels = ['조회', '풍문', '보도', '내용', '답변', '사실', '확정', '부인', '미확정', '재공시'];
  } else if (/주주총회소집/.test(name)) {
    labels = ['일시', '장소', '안건', '의안', '부의', '결의', '전자투표', '의결권', '이사 선임', '정관'];
  } else if (/잠정실적|영업.*실적|결산실적/.test(name)) {
    // jp: 투자자 핵심 = 매출·영업이익·순이익 + 전년/직전 대비 증감 + 흑자적자전환
    labels = ['매출액', '영업이익', '영업손실', '당기순이익', '당기순손실', '당해', '직전', '전년', '증감', '증감률', '흑자', '적자', '전환', '컨센서스'];
  } else {
    return null;
  }

  // jp: 라벨 주변 텍스트 추출 (라벨 + 뒤 SNIPPET_LEN자). 표·선정경위 등 긴 항목까지 포함되도록 확대.
  const chunks: string[] = [];
  const seen = new Set<number>();
  for (const label of labels) {
    const idx = text.indexOf(label);
    if (idx >= 0 && !seen.has(idx)) {
      seen.add(idx);
      const snippet = text.slice(idx, idx + SNIPPET_LEN).replace(/\s+/g, ' ').trim();
      chunks.push(snippet);
    }
  }

  if (chunks.length === 0) return null;

  const header = `[공시 제목] ${reportName}\n[핵심 항목]\n`;
  return header + chunks.map((c) => `- ${c}`).join('\n');
}

// jp: ===== 유틸 =====
function decodeKorean(buf: Buffer): string {
  const utf8 = buf.toString('utf-8');
  const broken = (utf8.match(/\uFFFD/g) || []).length;
  if (broken > 10) {
    try {
      const dec = new TextDecoder('euc-kr');
      return dec.decode(buf);
    } catch {
      return utf8;
    }
  }
  return utf8;
}

function stripMarkup(raw: string): string {
     return raw
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/&#\d+;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();
}
