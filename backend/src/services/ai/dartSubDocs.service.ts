// jp: DART 공시 목차 파싱 - 각 섹션(주석/재무제표 등)의 정확한 viewer URL 추출
// jp: OpenDartReader의 sub_docs 로직을 TS로 포팅. API 키 불필요(목차 페이지 파싱).
// jp: 표형 청크를 "DART 원문 주석 섹션"으로 정확히 점프시키기 위함.

import axios from 'axios';
import { safeGet, safeSetEx } from '../../config/redis';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

export interface DartSubDoc {
  title: string;
  url: string;
}

// jp: DART 목차 페이지의 JS 변수에서 하위문서 정보 추출하는 정규식
// jp: node['text']="주석"; node['rcpNo']=..; node['dcmNo']=..; node['eleId']=..; node['offset']=..; ...
const NODE_RE = new RegExp(
  "node\\d?\\['text'\\][ =]+\"(.*?)\";" +
  "\\s*node\\d?\\['id'\\][ =]+\"(\\d+)\";" +
  "\\s*node\\d?\\['rcpNo'\\][ =]+\"(\\d+)\";" +
  "\\s*node\\d?\\['dcmNo'\\][ =]+\"(\\d+)\";" +
  "\\s*node\\d?\\['eleId'\\][ =]+\"(\\d+)\";" +
  "\\s*node\\d?\\['offset'\\][ =]+\"(\\d+)\";" +
  "\\s*node\\d?\\['length'\\][ =]+\"(\\d+)\";" +
  "\\s*node\\d?\\['dtd'\\][ =]+\"(.*?)\";",
  'g'
);

// jp: 단일 페이지 보고서용 (viewDoc('rcp','dcm','ele','off','len','dtd',''))
const SINGLE_RE = /viewDoc\('(\d+)',\s*'(\d+)',\s*'(\d+)',\s*'(\d+)',\s*'(\d+)',\s*'(\S+?)',\s*''\)/g;

// jp: receiptNo의 모든 하위문서(섹션) 목록 + 정확한 viewer URL
export async function getDartSubDocs(receiptNo: string): Promise<DartSubDoc[]> {
  const rcp = (receiptNo || '').trim();
  if (!/^\d+$/.test(rcp)) return [];

  // jp: Redis 캐시 (같은 공시는 1회만 파싱, 7일 보관)
  const cacheKey = `dart:subdocs:${rcp}`;
  try {
    const cached = await safeGet(cacheKey);
    if (cached) return JSON.parse(cached) as DartSubDoc[];
  } catch { /* jp: 캐시 실패 무시 */ }

  let html: string;
  try {
    const res = await axios.get(`https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${rcp}`, {
      headers: { 'User-Agent': USER_AGENT },
      timeout: 10000,
    });
    html = res.data as string;
  } catch (err) {
    return [];
  }

  const docs: DartSubDoc[] = [];

  // jp: 1) 다중 페이지(섹션 여러개) 파싱
  let m: RegExpExecArray | null;
  NODE_RE.lastIndex = 0;
  while ((m = NODE_RE.exec(html)) !== null) {
    const [, title, , rcpNo, dcmNo, eleId, offset, length, dtd] = m;
    const params = `rcpNo=${rcpNo}&dcmNo=${dcmNo}&eleId=${eleId}&offset=${offset}&length=${length}&dtd=${dtd}`;
    docs.push({ title: title.trim(), url: `https://dart.fss.or.kr/report/viewer.do?${params}` });
  }

  // jp: 2) 다중 실패 시 단일 페이지 파싱
  if (docs.length === 0) {
    SINGLE_RE.lastIndex = 0;
    const sm = SINGLE_RE.exec(html);
    if (sm) {
      const [, rcpNo, dcmNo, eleId, offset, length, dtd] = sm;
      const params = `rcpNo=${rcpNo}&dcmNo=${dcmNo}&eleId=${eleId}&offset=${offset}&length=${length}&dtd=${dtd}`;
      docs.push({ title: '전체 문서', url: `https://dart.fss.or.kr/report/viewer.do?${params}` });
    }
  }

  // jp: 캐시 저장 (7일)
  if (docs.length > 0) {
    try { await safeSetEx(cacheKey, 60 * 60 * 24 * 7, JSON.stringify(docs)); } catch { /* 무시 */ }
  }
  return docs;
}

// jp: 주석 섹션 URL 우선 반환 (없으면 재무 관련, 그래도 없으면 첫 섹션)
export async function getNotesSectionUrl(receiptNo: string): Promise<string | null> {
  const docs = await getDartSubDocs(receiptNo);
  if (docs.length === 0) return null;
  // jp: "주석" 포함 섹션 우선
  const notes = docs.find((d) => /주석/.test(d.title));
  if (notes) return notes.url;
  // jp: 재무제표 관련
  const fin = docs.find((d) => /재무|재무제표/.test(d.title));
  if (fin) return fin.url;
  // jp: 그래도 없으면 첫 섹션
  return docs[0].url;
}
