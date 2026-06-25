// jp: DART 공시 원문 추출 서비스
// jp: OpenDART document.xml API → ZIP → 텍스트 추출 → 핵심 섹션 추출
// jp: 하이브리드: 재무 키워드 발췌(분기/사업보고서) → 공시유형별 핵심 섹션 → fallback

import axios from 'axios';
import AdmZip from 'adm-zip';
import { ENV } from '../../config/env';

const DOC_URL = 'https://opendart.fss.or.kr/api/document.xml';
const MAX_FALLBACK_CHARS = 20000;

// jp: 원문 추출 결과
export interface DartDocResult {
  ok: boolean;
  text: string;          // jp: Claude에 전달할 텍스트
  mode: 'section' | 'fallback' | 'none';  // jp: 추출 방식
  rawLength: number;     // jp: 원문 전체 길이 (참고)
}

// jp: 1) document API로 원문 ZIP 받아서 텍스트 추출
export async function fetchDartDocumentText(receiptNo: string): Promise<{ text: string; rawLength: number } | null> {
  if (!ENV.DART.API_KEY || ENV.DART.API_KEY === 'your_dart_api_key_here') return null;

  try {
    const res = await axios.get(DOC_URL, {
      params: { crtfc_key: ENV.DART.API_KEY, rcept_no: receiptNo },
      responseType: 'arraybuffer',  // jp: ZIP 바이너리
      timeout: 30000,
    });

    const buf = Buffer.from(res.data);

    // jp: 에러 응답은 XML(텍스트)로 옴 - ZIP이 아니면 거기 메시지
    // jp: ZIP 시그니처(PK\x03\x04) 확인
    if (buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4b) {
      const errText = buf.toString('utf-8').slice(0, 300);
      console.warn(`[DART원문] ZIP 아님 (에러 가능): ${errText}`);
      return null;
    }

    // jp: ZIP 해제
    const zip = new AdmZip(buf);
    const entries = zip.getEntries();
    if (entries.length === 0) return null;

    // jp: 안의 파일들(.xml) 텍스트 합치기
    let raw = '';
    for (const entry of entries) {
      if (entry.isDirectory) continue;
      // jp: DART 원문은 EUC-KR 또는 UTF-8. adm-zip은 buffer로 주니 디코딩 시도
      const content = entry.getData();
      raw += decodeKorean(content) + '\n';
    }

    // jp: 태그 제거 → 순수 텍스트
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

  // jp: 재무 키워드 발췌 우선 시도 (분기/반기/사업보고서 등 재무 공시)
  // jp: reportName 매칭 대신 항상 시도 → 재무 키워드가 충분하면 발췌, 없으면 null
  if (true) {
    const fin = extractFinancialSection(doc.text, reportName);
    if (fin && fin.length > 60) {
      return { ok: true, text: fin, mode: 'section', rawLength: doc.rawLength };
    }
  }

  // jp: 공시유형별 핵심 섹션 추출 시도
  const section = extractCoreSection(doc.text, reportName);
  if (section && section.length > 30) {
    return { ok: true, text: section, mode: 'section', rawLength: doc.rawLength };
  }

  // jp: fallback - 앞 20000자
  return {
    ok: true,
    text: doc.text.slice(0, MAX_FALLBACK_CHARS),
    mode: 'fallback',
    rawLength: doc.rawLength,
  };
}

// jp: ===== 재무 핵심 발췌 (재무제표·감사의견·현금흐름·위험신호 키워드 주변 추출) =====
function extractFinancialSection(text: string, reportName: string): string | null {
  const FIN_KEYS = [
    // jp: 손익·재무상태
    '매출액', '영업이익', '영업손실', '당기순이익', '당기순손실', '법인세',
    '자산총계', '부채총계', '자본총계', '유동자산', '유동부채', '매출총이익',
    '판매비와관리비', '재무상태표', '손익계산서', '포괄손익',
    // jp: 현금흐름
    '영업활동현금흐름', '투자활동현금흐름', '재무활동현금흐름', '현금및현금성자산', '현금흐름',
    // jp: 감사의견
    '감사의견', '적정의견', '한정의견', '부적정', '의견거절', '계속기업', '강조사항', '핵심감사사항',
    // jp: 위험신호 (특수관계자·우발·소송·담보)
    '특수관계자', '우발부채', '우발채무', '소송', '지급보증', '담보제공', '채무보증',
    '최대주주', '주요주주', '차입금', '사채', '전환사채', '신주인수권',
    // jp: 상장폐지·자본잠식
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

  // jp: 인접한 키워드 위치를 병합해 구간(window)으로 만들기
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
function extractCoreSection(text: string, reportName: string): string | null {
  const name = reportName || '';

  // jp: 공시유형별 추출할 항목 라벨
  let labels: string[] = [];
  if (/전환사채|CB|신주인수권|BW|교환사채|EB/.test(name)) {
    labels = ['사채의 종류', '권면총액', '발행총액', '발행금액', '전환가액', '전환가격', '전환비율', '전환청구', '전환에 따라', '행사가액', '리픽싱', '시가하락', '조달금액', '자금조달', '자금의 사용', '납입일', '사채만기', '대상자'];
  } else if (/유상증자|무상증자|증자/.test(name)) {
    labels = ['신주의 종류', '발행주식', '신주 수', '발행가액', '발행가격', '주당', '증자방식', '배정', '자금조달', '조달금액', '자금의 사용', '납입일', '신주 배정', '증자 목적', '발행 목적'];
  } else if (/배당/.test(name)) {
    labels = ['배당금', '주당 배당', '배당금총액', '배당수익률', '배당기준일', '배당구분', '시가배당률', '배당률'];
  } else if (/공급계약|단일판매|수주|계약체결/.test(name)) {
    labels = ['계약금액', '계약상대', '계약 상대', '계약기간', '계약 내용', '판매·공급', '매출액 대비', '계약 일자', '계약상대방'];
  } else if (/자기주식|자사주/.test(name)) {
    labels = ['취득예정', '취득 예정', '취득금액', '취득 목적', '취득방법', '취득예정기간', '보유주식', '취득 주식'];
  } else if (/횡령|배임/.test(name)) {
    labels = ['횡령', '배임', '발생금액', '금액', '자기자본', '비율', '발생 일자'];
  } else if (/감자/.test(name)) {
    labels = ['감자비율', '감자방법', '감자 목적', '감자 전', '감자 후', '자본금'];
  } else if (/주주명부폐쇄|명의개서|기준일설정|권리주주/.test(name)) {
    labels = ['기준일', '명의개서정지기간', '명의개서 정지기간', '시작일', '종료일', '설정사유', '설정 사유', '권리주주', '주주명부'];
  } else if (/최대주주.*변경|최대주주변경|경영권.*변경/.test(name)) {
    labels = ['명칭', '성명', '법인명', '소유 주식 수', '소유주식수', '지분율', '담보권', '채무', '차입', '담보설정금액', '담보제공', '계약 체결일', '취득', '양수', '변경 전', '변경 후'];
  } else if (/매출액또는손익구조|매출액.*손익|손익구조/.test(name)) {
    labels = ['매출액', '영업이익', '법인세비용차감전', '당기순이익', '증감금액', '증감비율', '흑자', '적자', '전환', '자산총계', '부채총계', '자본총계', '자본금', '결산기간', '재무제표의 종류'];
  } else if (/상장폐지|정리매매/.test(name)) {
    labels = ['제목', '상장폐지', '정리매매', '법원', '결정', '사유', '신청일', '결정일자', '효력', '절차'];
  } else if (/관리종목|투자주의환기|불성실공시/.test(name)) {
    labels = ['제목', '관리종목', '지정', '사유', '시가총액', '미달', '미만', '상장규정', '매매거래일', '해제', '요건'];
  } else if (/거래정지|매매거래정지/.test(name)) {
    labels = ['정지', '사유', '기간', '재개', '해제', '거래정지'];
  } else if (/합병/.test(name)) {
    labels = ['합병', '합병비율', '합병 비율', '합병방법', '합병기일', '존속회사', '소멸회사', '신주', '상장 예정', '주식매수청구', '매수청구가격', '청구기간', '상대회사'];
  } else if (/회사.*분할|분할합병|인적분할|물적분할/.test(name)) {
    labels = ['분할', '분할방법', '분할비율', '인적분할', '물적분할', '존속회사', '신설회사', '분할기일', '주식매수청구'];
  } else if (/회생|파산|부도|당좌거래정지/.test(name)) {
    labels = ['신청', '법원', '사건', '신청일', '결정', '금액', '사유', '회생', '파산', '부도'];
  } else if (/전환청구권행사|신주인수권행사/.test(name)) {
    labels = ['전환', '행사', '주식 수', '주식수', '전환가액', '행사가액', '상장 예정', '발행주식', '청구'];
  } else if (/주식소각|이익소각/.test(name)) {
    labels = ['소각', '소각 주식', '소각방법', '소각 후', '발행주식', '취득'];
  } else if (/주식.*분할|주식.*병합|액면분할|액면병합/.test(name)) {
    labels = ['분할', '병합', '비율', '액면', '기준일', '변경상장', '거래정지', '발행주식'];
  } else if (/소송|손해배상|가처분/.test(name)) {
    labels = ['소송', '청구', '금액', '원고', '피고', '사건', '법원', '내용', '제기'];
  } else if (/영업양수도|자산양수도|영업양수|자산양수/.test(name)) {
    labels = ['양수', '양도', '대상', '금액', '자기자본', '비율', '상대방', '목적'];
  } else if (/채무보증|담보제공|채무인수/.test(name)) {
    labels = ['채무', '보증', '담보', '금액', '자기자본', '비율', '상대', '제공'];
  } else if (/조회공시|풍문|보도|해명/.test(name)) {
    labels = ['조회', '풍문', '보도', '내용', '답변', '사실', '확정', '부인', '미확정'];
  } else if (/주주총회소집/.test(name)) {
    labels = ['일시', '장소', '안건', '의안', '부의', '결의', '전자투표', '의결권'];
  } else if (/잠정실적|영업.*실적|결산실적/.test(name)) {
    labels = ['매출액', '영업이익', '당기순이익', '당해', '직전', '전년', '증감', '흑자', '적자'];
  } else {
    // jp: 유형 미매칭 → 섹션 추출 안 함 (fallback으로)
    return null;
  }

  // jp: 라벨 주변 텍스트 추출 (라벨 + 뒤 120자)
  const chunks: string[] = [];
  for (const label of labels) {
    const idx = text.indexOf(label);
    if (idx >= 0) {
      const snippet = text.slice(idx, idx + 150).replace(/\s+/g, ' ').trim();
      chunks.push(snippet);
    }
  }

  if (chunks.length === 0) return null;

  // jp: 제목 + 추출 항목들
  const header = `[공시 제목] ${reportName}\n[핵심 항목]\n`;
  return header + chunks.map((c) => `- ${c}`).join('\n');
}

// jp: ===== 유틸 =====

// jp: EUC-KR/UTF-8 디코딩 (DART 원문은 보통 UTF-8, 일부 EUC-KR)
function decodeKorean(buf: Buffer): string {
  // jp: UTF-8 먼저 시도
  const utf8 = buf.toString('utf-8');
  // jp: 깨짐 문자(\uFFFD)가 많으면 EUC-KR로 재시도
  const broken = (utf8.match(/\uFFFD/g) || []).length;
  if (broken > 10) {
    try {
      // jp: Node 내장 TextDecoder로 EUC-KR
      const dec = new TextDecoder('euc-kr');
      return dec.decode(buf);
    } catch {
      return utf8;
    }
  }
  return utf8;
}

// jp: XML/HTML 태그 제거 → 순수 텍스트
function stripMarkup(raw: string): string {
     return raw
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')   // jp: style 태그 내용 통째 제거
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ') // jp: script 태그 내용 통째 제거
    .replace(/<[^>]+>/g, ' ')        // jp: 태그 제거
    .replace(/&[a-z]+;/gi, ' ')      // jp: HTML 엔티티
    .replace(/&#\d+;/g, ' ')
    .replace(/[ \t]+/g, ' ')         // jp: 공백 정리
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();
}
