// jp: OpenDART 공시 서비스

import axios from 'axios';
import { ENV } from '../../config/env';
import { Disclosure, DisclosureImportance, DisclosureSentiment } from '../../types';

const WARNING_KW = ['거래정지','상장폐지','관리종목','투자경고','감사의견 거절','횡령','배임'];
const POSITIVE_KW = [{kw:'공급계약',s:2},{kw:'자기주식취득',s:2},{kw:'무상증자',s:2},{kw:'기술이전',s:2},{kw:'FDA',s:3},{kw:'수주',s:2}];
const NEGATIVE_KW = [{kw:'유상증자',s:2},{kw:'전환사채',s:1},{kw:'최대주주변경',s:1},{kw:'소송',s:1}];

export function classifyDisclosure(name: string): { importance: DisclosureImportance; sentiment: DisclosureSentiment } {
  if (WARNING_KW.some(kw => name.includes(kw))) return { importance:'warning', sentiment:'negative' };
  let pos = 0, neg = 0;
  POSITIVE_KW.forEach(({kw,s}) => { if(name.includes(kw)) pos+=s; });
  NEGATIVE_KW.forEach(({kw,s}) => { if(name.includes(kw)) neg+=s; });
  const importance: DisclosureImportance = Math.max(pos,neg)>=1 ? 'important' : 'normal';
  const sentiment: DisclosureSentiment = pos>neg ? 'positive' : neg>pos ? (neg>=2?'negative':'caution') : 'neutral';
  return { importance, sentiment };
}

export function generateSummary(reportName: string, stockName: string): string {
  if (reportName.includes('공급계약')||reportName.includes('단일판매')) return `${stockName}이(가) 대규모 공급 계약을 체결했습니다.`;
  if (reportName.includes('자기주식취득')) return `${stockName}이(가) 자기주식 취득을 결정했습니다.`;
  if (reportName.includes('전환사채')) return `${stockName}이(가) 전환사채를 발행합니다. 희석 효과에 유의하세요.`;
  if (reportName.includes('기술이전')) return `${stockName}이(가) 기술이전 계약을 체결했습니다.`;
  return `${stockName}의 ${reportName} 공시가 등록됐습니다.`;
}

export async function fetchDisclosuresFromDART(corpCode: string, bgn_de?: string): Promise<Partial<Disclosure>[]> {
  if (!ENV.DART.API_KEY || ENV.DART.API_KEY === 'your_dart_api_key_here') return [];
  try {
    const res = await axios.get(`${ENV.DART.BASE_URL}/list.json`, {
      params: { crtfc_key:ENV.DART.API_KEY, corp_code:corpCode, bgn_de:bgn_de||new Date(Date.now()-86400000*7).toISOString().slice(0,10).replace(/-/g,''), page_count:20 },
    });
    if (res.data.status !== '000') return [];
    return res.data.list.map((item: Record<string,string>) => {
      const {importance,sentiment} = classifyDisclosure(item.report_nm);
      return { stockCode:item.stock_code, stockName:item.corp_name, corpCode:item.corp_code, reportName:item.report_nm, receiptNo:item.rcept_no, importance, sentiment, summary:generateSummary(item.report_nm,item.corp_name), originalUrl:`https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${item.rcept_no}`, disclosedAt:new Date(item.rcept_dt.replace(/(\d{4})(\d{2})(\d{2})/,'$1-$2-$3')).toISOString() };
    });
  } catch (err) { console.error('[DART] 공시 조회 실패:', err); return []; }
}
