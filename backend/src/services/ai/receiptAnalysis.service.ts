// jp: 공시 접수번호 AI 분석 서비스 (원문 기반) — 개선판
// jp: 흐름: Redis 캐시 → DB 조회 → [DART원문추출 + DB병렬] → Claude(스트리밍) → 저장
// jp: 개선: 스트리밍, 유형별 프롬프트 분기, keyNumbers/timeline 구조화, JSON retry, 병렬화, 선분석

import { ENV } from '../../config/env';
import { query } from '../../config/db';
import { safeGet, safeSetEx } from '../../config/redis';
import { extractDisclosureCore } from './dartDocument.service';
import { getPrompt } from './promptStore.service';
import { embedAndStoreNotes } from './notesEmbedding.service';

// ─────────────────────────────────────────────
// 타입 정의
// ─────────────────────────────────────────────

export interface KeyNumber {
  label: string;   // jp: 예) "발행주식수", "발행가액", "납입일"
  value: string;   // jp: 예) "1,200만주", "주당 5,000원", "2024-03-15"
}

export interface ReceiptAnalysis {
  summary: string;
  detail: string;
  reason: string;
  impact: string;
  impactLabel: string;
  risks: string[];
  keyNumbers?: KeyNumber[];   // jp: 핵심 숫자 구조화 (신규)
  timeline?: string;          // jp: 주요 일정 흐름 (신규)
  subtype?: string;
  promptTokens?: number;
  completionTokens?: number;
  sourceMode?: string;
}

export interface ReceiptAnalysisResponse {
  receiptNo: string;
  stockCode: string;
  stockName: string;
  reportName: string;
  originalUrl: string;
  disclosedAt: string;
  analysis: ReceiptAnalysis;
  tokens?: number;
  cached?: boolean;
}

interface DisclosureRow {
  receipt_no: string;
  stock_code: string | null;
  stock_name: string | null;
  corp_code: string | null;
  report_name: string;
  disclosure_type: string | null;
  category: string | null;
  importance: string | null;
  sentiment: string | null;
  summary: string | null;
  original_url: string | null;
  disclosed_at: string;
  is_important: boolean;
  is_capital: boolean;
  is_good: boolean;
  is_bad: boolean;
  ai_summary: string | null;
  ai_key_points: string[] | null;
  ai_investor_note: string | null;
  ai_risk_note: string | null;
  impact_level: string | null;
  // jp: ai_status — 'completed' | 'failed' | 'partial' | null
  // jp: 컬럼이 없는 구버전 DB에서는 undefined로 오므로 optional 처리
  ai_status?: string | null;
}

// ─────────────────────────────────────────────
// 상수
// ─────────────────────────────────────────────

export const DISCLOSURE_SUBTYPES = [
  // jp: 증자 (세분화)
  '유상증자_주주배정후실권주공모',
  '유상증자_제3자배정',
  '유상증자_일반공모',
  '유상증자_주주우선공모',
  '유상증자_기타',
  '무상증자',
  // jp: 감자
  '유상감자',
  '무상감자',
  // jp: 사채
  '전환사채_CB',
  '신주인수권부사채_BW',
  '교환사채_EB',
  '일반사채',
  // jp: 실적
  '실적공시_잠정',
  '실적공시_확정',
  '실적공시_수정',
  '매출손익변동',
  // jp: 주요사항
  '단일판매공급계약',
  '타인채무보증',
  '자기주식_취득',
  '자기주식_처분',
  '자기주식_소각',
  // jp: 지배구조
  '최대주주변경',
  '임원변경_대표이사',
  '임원변경_기타',
  '주주총회',
  // jp: 감사/재무
  '감사보고서_적정',
  '감사보고서_한정',
  '감사보고서_거절부적정',
  '자본잠식',
  // jp: 기업변화
  '합병',
  '분할',
  '영업양수도',
  '상장폐지관련',
  '관리종목지정',
  // jp: 배당
  '현금배당',
  '주식배당',
  // jp: 소송/제재
  '소송판결',
  '공정위제재',
  // jp: 기타
  '대량보유보고',
  '기업설명회IR',
  '기타',] as const;

// jp: v2: 캐시 버전 bump — 배포 시 기존 v1 키(ai:disclosure:*)는 건드리지 않음
// jp: v1 키는 TTL(7일) 후 자연 만료. 롤백 시 'ai:disclosure:'로 되돌리면 v1 캐시 복원 가능
const CACHE_PREFIX = 'ai:disclosure:v2:';
const CACHE_TTL = 60 * 60 * 24 * 7;  // jp: 7일 (공시는 안 바뀜)

// ─────────────────────────────────────────────
// 유틸
// ─────────────────────────────────────────────

function isAiEnabled(): boolean {
  return ENV.AI_DISCLOSURE.ENABLED && !!ENV.AI_DISCLOSURE.API_KEY;
}



function impactLabel(impact: string): string {
  switch (impact) {
    case 'positive': return '긍정적';
    case 'negative': return '부정적';
    case 'neutral':  return '중립';
    default:         return '판단 유보';
  }
}

function normalizeImpact(level: string | null, sentiment: string | null): string {
  const s = (level || '').toLowerCase();
  if (s.includes('긍정')) return 'positive';
  if (s.includes('부정')) return 'negative';
  if (s.includes('중립')) return 'neutral';
  if (sentiment === 'positive') return 'positive';
  if (sentiment === 'negative') return 'negative';
  if (sentiment === 'neutral')  return 'neutral';
  return 'unknown';
}

function normalizeSubtype(raw: unknown): string {
  const s = String(raw || '').trim();
  return (DISCLOSURE_SUBTYPES as readonly string[]).includes(s) ? s : '기타';
}

// jp: JSON 파싱 — 마크다운 펜스 제거 후 파싱, 실패 시 null
function safeParseJson(text: string): Record<string, unknown> | null {
  try {
    const clean = text.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
    return JSON.parse(clean);
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────
// 유형별 분석 체크리스트 (정확성 핵심)
// ─────────────────────────────────────────────

function getSubtypeChecklist(subtype: string | null | undefined, reportName: string): string {
  const s = subtype || reportName;

  // jp: ===== 투자위험 (가장 치명적 — 위험도/탈출시점/회생가능성을 1순위로) =====

  // 상장폐지 / 정리매매
  if (s.includes('상장폐지') || s.includes('정리매매')) {
    return `[이 공시 유형 전용 체크리스트 — 반드시 원문에서 찾아 keyNumbers에 포함]
- 상장폐지 사유 (감사의견 거절 / 자본잠식 / 횡령 등 — 회생 가능성 판단의 핵심)
- 단계 구분: 폐지 "사유 발생" vs "결정" vs "확정" (반드시 명확히)
- 정리매매 기간 (시작일~종료일 — 투자자가 팔 수 있는 마지막 시점)
- 이의신청 / 개선기간 부여 여부 (살아날 가능성이 있는지)
- 투자자 행동 시점을 summary에 반드시 명시
[판단 가이드] 개선기간 부여 = 회생 여지, 폐지 확정 = 정리매매 기간 내 탈출이 사실상 마지막 기회`;
  }

  // 관리종목 / 투자환기 / 불성실공시
  if (s.includes('관리종목') || s.includes('투자주의환기') || s.includes('불성실공시') || s.includes('투자환기')) {
    return `[이 공시 유형 전용 체크리스트 — 반드시 원문에서 찾아 keyNumbers에 포함]
- 지정 사유 (매출액 미달 / 자본잠식 / 감사의견 / 공시벌점 등)
- 사유가 일시적인지(매출 미달 등 회복 가능) 구조적인지(자본잠식 등 위험)
- 해제 요건 (무엇을 충족하면 풀리는지)
- 지정 "예정" vs "확정" 구분
- 상장폐지로 이어지는 경로인지 여부
[판단 가이드] 관리종목은 상장폐지 예비단계. 자본잠식·감사의견 사유는 구조적 위험으로 강하게 경고`;
  }

  // 거래정지 / 매매거래정지
  if (s.includes('거래정지') || s.includes('매매거래정지')) {
    return `[이 공시 유형 전용 체크리스트 — 반드시 원문에서 찾아 keyNumbers에 포함]
- 정지 사유 (호재성=M&A·중요공시 / 악재성=불성실공시·조회 등 구분)
- 정지 기간 / 거래 재개 예정일 (자금이 묶이는 기간)
- 재개 후 가격 변동 위험
[판단 가이드] 재개일을 summary에 반드시 명시. 사유의 호재/악재 성격을 판정에 반영`;
  }

  // 회생 / 파산 / 부도 / 당좌거래정지
  if (s.includes('회생') || s.includes('파산') || s.includes('부도') || s.includes('당좌거래정지')) {
    return `[이 공시 유형 전용 체크리스트 — 반드시 원문에서 찾아 keyNumbers에 포함]
- 단계: "신청" vs "법원 결정(개시)" (신청과 인용은 천지차이 — 반드시 구분)
- 신청 주체 (회사 자발적 / 채권자)
- 채무 규모 / 관련 금액
- 상장폐지로 직결되는지 여부
[판단 가이드] 부도·당좌거래정지는 거의 상장폐지 직결로 강한 악재. 회생"신청"은 아직 미확정 단계임을 명시`;
  }

  // 횡령 / 배임
  if (s.includes('횡령') || s.includes('배임')) {
    return `[이 공시 유형 전용 체크리스트 — 반드시 원문에서 찾아 keyNumbers에 포함]
- 횡령/배임 발생 금액
- 금액이 자기자본에서 차지하는 비율 (원문에 있으면 포함 — 충격 규모)
- 대상자/직위 (대표이사·임원이면 상장적격성 실질심사 위험)
- 상장적격성 실질심사 사유 해당 여부
- 진행 상황 (혐의 / 기소 / 확정)
[판단 가이드] 대표이사 횡령은 실질심사→거래정지·상장폐지 위험으로 강하게 경고`;
  }

  // jp: ===== 증자·감자 (희석이 핵심) =====

  // 전환청구권 / 신주인수권 행사 (CB/BW보다 위 — 더 구체적)
  if (s.includes('전환청구권행사') || s.includes('신주인수권행사') || s.includes('전환청구') || s.includes('권리행사')) {
    return `[이 공시 유형 전용 체크리스트 — 반드시 원문에서 찾아 keyNumbers에 포함]
- 이번 행사로 발행되는 신주 주수
- 전환가액 / 행사가액
- 신주 상장 예정일 (물량 출회 시점)
- 발행주식총수 대비 비율 (희석 규모)
- 미상환 잔액 (앞으로 더 나올 물량)
[판단 가이드] CB/BW가 실제 주식으로 풀리는 단계 — 물량 출회와 희석을 명시`;
  }

  // 전환사채 / 신주인수권부사채 / 교환사채
  if (s.includes('전환사채') || s.includes('CB') || s.includes('신주인수권') || s.includes('BW') || s.includes('교환사채') || s.includes('EB')) {
    return `[이 공시 유형 전용 체크리스트 — 반드시 원문에서 찾아 keyNumbers에 포함]
- 발행총액 (원)
- 표면이율 / 만기이율 (%)
- 전환(행사)가액 (원/주)
- 리픽싱(전환가액 하향조정) 조건: 최저 조정가액, 조정 주기 (희석 폭탄 여부)
- 풋옵션(조기상환청구권) / 콜옵션(매도청구권) 유무 및 시점
- 만기일 / 전환청구 가능 기간
- 주식 전환 시 발행 예정 주수 + 발행주식총수 대비 (잠재 희석 규모)
- 사채 인수자(대상자) 명칭 및 회사와의 관계
[판단 가이드] 리픽싱 있으면 주가 하락 시 희석 폭증 위험 경고. 풋옵션은 회사 자금부담. 오너 관계인 인수면 의도 주목`;
  }

  // 유상증자
  if (s.includes('유상증자')) {
    return `[이 공시 유형 전용 체크리스트 — 반드시 원문에서 찾아 keyNumbers에 포함]
- 신주 발행 주수
- 발행가액 (예정가 또는 확정가, 원/주)
- 기준주가 대비 할인율 (%)
- 증자 전 발행주식총수 → 증자 후 (희석률 = 신주 ÷ 증자후 총주식)
- 조달 총액 (원)
- 증자 방식 (주주배정 / 제3자배정 / 일반공모)
- 제3자배정이면: 배정 대상자 명칭 + 회사·최대주주와의 관계 + 선정경위
- 자금 사용 목적 (시설투자/R&D vs 운영자금/채무상환 — 매우 중요)
- 청약일 / 납입일 / 신주 상장 예정일 / 보호예수 기간
[판단 가이드] 자금용도가 시설투자·R&D면 성장 신호(긍정), 채무상환·운영자금이면 자금난 신호(부정). 희석률 큰지, 대상자가 전략적투자자인지 오너관계인인지 주목`;
  }

  // 무상증자
  if (s.includes('무상증자')) {
    return `[이 공시 유형 전용 체크리스트]
- 신주 배정 비율 (기존 1주당 몇 주)
- 신주 발행 주수
- 신주 배정 기준일 (이 날 보유해야 받음)
- 권리락 예정일
- 신주 상장 예정일
- 재원 (자본잉여금 등)
[판단 가이드] 무상증자는 통상 호재(주주환원·유동성·수급). 단 기업가치 실질 증가는 없으므로 착시 주의`;
  }

  // 감자
  if (s.includes('감자')) {
    return `[이 공시 유형 전용 체크리스트 — 반드시 원문에서 찾아 keyNumbers에 포함]
- 무상감자 vs 유상감자 (가장 중요 — 명확히 구분)
- 감자 비율 (몇 대 1)
- 감자 목적 (결손 보전 / 자본 환원)
- 감자 기준일 / 효력 발생일 / 매매거래정지 기간
- 감자 후 자본금
[판단 가이드] 무상감자(결손보전)는 자본잠식 신호로 거의 악재. 유상감자는 주주에게 보상 지급(중립~긍정). 이 구분을 판정에 반드시 반영`;
  }

  // 주식소각 / 이익소각 (자사주보다 위 — 더 구체적, 강한 호재)
  if (s.includes('소각')) {
    return `[이 공시 유형 전용 체크리스트 — 반드시 원문에서 찾아 keyNumbers에 포함]
- 소각 주식 수 + 발행주식총수 대비 비율
- 소각 방법 (이익소각 / 자본감소 없는 자기주식 소각)
- 소각 후 발행주식총수
- 취득 재원 / 소각 예정일
[판단 가이드] 주식소각은 주식 수 영구 감소 → 주당가치 상승, 진정한 주주환원으로 호재`;
  }

  // 자사주
  if (s.includes('자사주') || s.includes('자기주식')) {
    return `[이 공시 유형 전용 체크리스트 — 반드시 원문에서 찾아 keyNumbers에 포함]
- 취득 vs 처분 vs 소각 (효과가 정반대 — 명확히 구분)
- 취득/처분 주수 및 금액 + 발행주식총수 대비 비율
- 취득/처분 단가 (예정)
- 취득 기간 (시작일 ~ 종료일)
- 취득 목적 (소각 / 주가안정 / 임직원 성과급 등)
- 취득 방법 (직접 장내매수 / 신탁계약)
[판단 가이드] 소각 목적이면 강한 호재. 단순 취득은 나중에 되팔 수 있어 효과 약함. 처분은 오히려 물량 출회로 부정적`;
  }

  // jp: ===== 지분변동 =====

  // 최대주주 변경 (지분변동보다 위 — 더 구체적)
  if (s.includes('최대주주') && (s.includes('변경') || s.includes('경영권'))) {
    return `[이 공시 유형 전용 체크리스트 — 반드시 원문에서 찾아 keyNumbers에 포함]
- 변경 전 최대주주 → 변경 후 최대주주 (이름/지분율)
- 변경 사유 (M&A / 상속·증여 / 주식담보 실행 — 매우 중요)
- 취득 자금 조달방법 (자기자금 / 차입 — 차입이면 위험)
- 주식담보 제공 여부 / 담보설정금액
- 경영권 프리미엄 / 거래 단가
[판단 가이드] 담보 실행에 의한 변경은 기존 대주주 부실 신호. 차입 인수는 향후 회사 자금유출 위험. 단순 승계와 적대적 M&A를 구분`;
  }

  // 지분변동 (대량보유 / 임원·주요주주 소유)
  if (s.includes('대량보유') || s.includes('주식등의') || s.includes('임원') || s.includes('주요주주') || s.includes('특정증권')) {
    return `[이 공시 유형 전용 체크리스트 — 반드시 원문에서 찾아 keyNumbers에 포함]
- 보고자(변동 주체) 이름/법인명, 회사와의 관계(임원/최대주주/기관/외국인 등)
- 변동 전 보유 주식수·지분율 → 변동 후 보유 주식수·지분율
- 이번 변동 수량 (취득/처분 주식 수)
- 보유 목적 (단순투자 / 경영참가 / 경영권 영향 — 매우 중요)
- 변동 사유 (장내매수/장외/상속/증여/신주취득 등)
- 취득/처분 단가, 평균 단가
- 발행주식 총수 (지분율 계산 근거)
[판단 가이드] 보유목적이 '경영참가'면 경영권 분쟁·행동주의 신호. CEO 자사매수는 자신감 신호, 대량매도는 경고. 차입 매수는 반대매매 위험`;
  }

  // jp: ===== 합병·분할 =====

  // 분할 (합병보다 위 — 인적/물적 구분이 핵심)
  if (s.includes('분할')) {
    return `[이 공시 유형 전용 체크리스트 — 반드시 원문에서 찾아 keyNumbers에 포함]
- 인적분할 vs 물적분할 (가장 중요 — 명확히 구분)
- 분할 비율
- 존속회사 / 신설회사의 사업 내용
- 분할 기일 / 재상장(변경상장) 일정
- 반대주주 주식매수청구권 가격 및 행사 기간
[판단 가이드] 물적분할은 알짜사업을 자회사로 떼어 별도상장 시 모회사 주주가치 희석('쪼개기 상장') 위험. 인적분할은 주주가 양쪽 주식 모두 받음. 이 차이를 반드시 설명`;
  }

  // 합병
  if (s.includes('합병')) {
    return `[이 공시 유형 전용 체크리스트 — 반드시 원문에서 찾아 keyNumbers에 포함]
- 합병 방식 (흡수합병 / 신설합병)
- 합병 비율 (내 주식이 몇 주로 바뀌나 — 유불리 핵심)
- 상대 법인명 및 사업 (우량 / 부실)
- 합병가액 / 합병 기일 / 신주 상장 예정일
- 반대주주 주식매수청구권 가격 및 행사 기간 (현재가와 비교)
- 우회상장 해당 여부
[판단 가이드] 합병비율이 불리하면 소액주주 손해. 매수청구가가 현재가보다 높으면 차익기회. 우회상장이면 부실기업 뒷문상장 가능성 주목`;
  }

  // jp: ===== 실적·재무 =====

  // 실적 공시
  if (s.includes('실적') || s.includes('매출') || s.includes('영업이익') || s.includes('손익구조') || reportName.includes('사업보고') || reportName.includes('분기보고')) {
    return `[이 공시 유형 전용 체크리스트 — 반드시 원문에서 찾아 keyNumbers에 포함]
- 매출액 (당기 vs 전기·전년동기 비교)
- 영업이익 / 영업이익률
- 당기순이익
- 전년 동기 대비 증감률 (%)
- 흑자전환 / 적자전환 여부 (강한 시그널)
- 사업부문별 매출 비중 (있으면)
- 특이 항목 (일회성 손익 등)
[판단 가이드] 절대값보다 증감률·방향성이 핵심. 적자전환은 강한 악재, 흑자전환은 강한 호재. 일회성 요인인지 구조적인지 구분`;
  }

  // jp: ===== 계약·소송 =====

  // 단일 판매/공급계약
  if (s.includes('계약') || s.includes('수주') || s.includes('공급')) {
    return `[이 공시 유형 전용 체크리스트 — 반드시 원문에서 찾아 keyNumbers에 포함]
- 계약 금액 (원)
- 최근 매출액 대비 비율 (%) (규모 체감 — 매우 중요)
- 계약 상대방 (대기업/신뢰도)
- 계약 기간 (시작일 ~ 종료일)
- 계약 내용 (제품/서비스명)
- 조건부/해지가능 여부 (확정 매출 여부)
[판단 가이드] 매출 대비 비율이 임팩트를 결정(연매출 대비 큰 계약일수록 호재). MOU·조건부 계약은 확정매출 아님 — 과대평가 주의`;
  }

  // 소송 / 가처분
  if (s.includes('소송') || s.includes('소제기') || s.includes('판결') || s.includes('가처분') || s.includes('손해배상')) {
    return `[이 공시 유형 전용 체크리스트 — 반드시 원문에서 찾아 keyNumbers에 포함]
- 소송 당사자 (회사가 원고인지 피고인지 — 방향 정반대)
- 청구 금액 (소송 가액)
- 청구 금액이 자기자본에서 차지하는 비율 (원문에 있으면 포함)
- 소송의 내용/요지
- 진행 단계 (제소 / 1심 / 항소 / 확정)
- 패소 시 회사에 미치는 영향
[판단 가이드] 회사가 피고면 패소 리스크, 원고면 권리주장. 자기자본 대비 큰 소송은 존립 위협 가능성`;
  }

  // 영업양수도 / 자산양수도
  if (s.includes('영업양수') || s.includes('영업양도') || s.includes('자산양수') || s.includes('자산양도') || s.includes('영업양수도')) {
    return `[이 공시 유형 전용 체크리스트 — 반드시 원문에서 찾아 keyNumbers에 포함]
- 양수 vs 양도 (사업을 사오나 파나)
- 대상 자산/사업 내용
- 거래 금액 + 자기자본 대비 비율 (원문에 있으면)
- 거래 상대방
- 양수도 목적 / 기준일
[판단 가이드] 핵심사업 양도는 미래 수익원 상실 가능성, 양수는 사업 확장. 거래규모가 자기자본 대비 큰지 주목`;
  }

  // 채무보증 / 담보제공
  if (s.includes('채무보증') || s.includes('담보제공') || s.includes('채무인수')) {
    return `[이 공시 유형 전용 체크리스트 — 반드시 원문에서 찾아 keyNumbers에 포함]
- 보증/담보 금액 + 자기자본 대비 비율 (원문에 있으면)
- 보증 상대방 (계열사 / 특수관계자 여부)
- 보증 기간
[판단 가이드] 자기자본 대비 큰 보증, 특히 부실 계열사 지원성 보증은 우발채무 위험으로 경고`;
  }

  // jp: ===== 배당·주총 =====

  // 배당
  if (s.includes('배당')) {
    return `[이 공시 유형 전용 체크리스트 — 반드시 원문에서 찾아 keyNumbers에 포함]
- 주당 배당금 (보통주/우선주)
- 시가배당률 (%)
- 배당 총액
- 배당성향 (순이익 대비, 원문에 있으면)
- 배당 기준일 / 지급 예정일 / 배당락일
- 배당 종류 (현금 / 현물 / 중간배당 / 결산배당)
- 전년 대비 배당 증감
[판단 가이드] 시가배당률이 투자매력 결정. 배당성향이 과도하면(100% 초과 등) 지속가능성 의심. 기준일을 놓치면 배당 못 받음을 명시`;
  }

  // 주주총회 소집
  if (s.includes('주주총회') || s.includes('주총')) {
    return `[이 공시 유형 전용 체크리스트 — 반드시 원문에서 찾아 keyNumbers에 포함]
- 주요 안건 (이사 선임 / 정관 변경 / 합병·분할 승인 등 중대 안건)
- 일시 / 장소
- 전자투표 가능 여부
- 행동주의·표대결 이슈 여부
[판단 가이드] 정관변경(제3자배정 한도 확대 등)은 향후 희석 예고. 이사선임·표대결 안건은 경영권·변동성 이슈로 주목`;
  }

  // jp: ===== IR·기타 =====

  // 조회공시 / 풍문·보도 해명
  if (s.includes('조회공시') || s.includes('풍문') || s.includes('보도') || s.includes('해명')) {
    return `[이 공시 유형 전용 체크리스트 — 반드시 원문에서 찾아 keyNumbers에 포함]
- 조회/풍문의 대상 내용 (무엇에 대한 것인가)
- 회사 답변 (사실 / 부인 / 미확정 — 가장 중요)
- 미확정이면 재공시 예정일
[판단 가이드] '사실'이면 그 내용이 정보, '부인'이면 루머, '미확정'이면 진행 중. 답변 성격을 판정에 반영`;
  }

  // 기본 체크리스트
  return `[공통 체크리스트]
- 공시의 핵심 숫자 (금액, 주식 수, 비율, 날짜)
- 단계 구분 (결정/신청/잠정 vs 확정)
- 이 공시로 인해 변화하는 것
- 주주에게 직접적 영향을 주는 항목 (호재/악재/중립 방향)
- 투자자가 행동해야 할 시점 (기준일/기간 등)`;
}

// ─────────────────────────────────────────────
// 원문 전처리 — 앞 + 핵심 섹션 + 끝 조합 (세세함 개선)
// ─────────────────────────────────────────────

function buildDocContext(docText: string): string {
  if (!docText) return '';

  if (docText.length <= 16000) return docText;

  // jp: 긴 원문: 앞 2500자(표지·결의 내용) + 마지막 1500자(세부 조건·일정) 조합
  const head = docText.slice(0, 8000);
  const tail = docText.slice(-5000);
  const mid  = docText.length > 20000
    ? `\n...(중략 ${Math.round((docText.length - 13000) / 1000)}k자)...\n`
    : docText.slice(8000, docText.length - 5000);

  return head + mid + tail;
}

// ─────────────────────────────────────────────
// 프롬프트 빌더
// ─────────────────────────────────────────────

const SUBTYPE_GUIDE = `[disclosure_subtype 분류 지침]
아래 목록에서 정확히 하나만 고른다:
- 유상증자는 증자방식을 반드시 구분: 유상증자_주주배정 / 유상증자_제3자배정 / 유상증자_일반공모 / 유상증자_주주배정후실권주공모 / 유상증자_기타
- 무상증자 / 유무상증자
- 전환사채(CB) / 신주인수권부사채(BW) / 교환사채(EB)
- 자사주취득 / 자사주처분 / 자사주신탁
- 감자는 반드시 구분: 유상감자 / 무상감자
- 주식소각 / 단일판매공급계약 / 실적공시 / 영업정지
- 최대주주변경 / 합병 / 분할 / 소송
- 위 어디에도 해당 없으면 기타`;

function buildUserPrompt(row: DisclosureRow, docText: string, docMode: string): string {
  const processedDoc = buildDocContext(docText);

  // jp: 유형별 체크리스트 — subtype은 아직 모를 수 있으므로 report_name + disclosure_type으로 추론
  const checklist = getSubtypeChecklist(row.disclosure_type, row.report_name);

  const base = `다음 한국 공시를 초등학생도 이해할 수 있게 분석해서 JSON으로만 답하라.

회사명: ${row.stock_name || '-'}
종목코드: ${row.stock_code || '-'}
공시 제목: ${row.report_name}
공시 유형: ${row.disclosure_type || '-'}`;

  const docPart = processedDoc
    ? `\n\n[공시 원문 — 이 데이터를 근거로 분석하라. 원문에 없는 사실은 절대 지어내지 말 것]\n${processedDoc}`
    : `\n\n(공시 원문을 가져오지 못했습니다. 제목과 유형만으로 일반적인 설명을 하되, 구체적 숫자는 절대 지어내지 마세요. keyNumbers는 빈 배열로.)`;

  const format = `\n\n${checklist}

${SUBTYPE_GUIDE}

출력 형식(JSON만, 설명·마크다운 없이):
{
  "summary": "공시 핵심을 초등학생도 알 수 있게 한 문장으로 (40~90자)",
  "detail": "무슨 내용인지 쉬운 말로 설명. 어려운 용어는 괄호로 풀이. 원문의 핵심 숫자 포함 (150~350자)",
  "reason": "이 공시가 투자자에게 왜 중요한지 쉽게 (80~200자)",
  "impact": "positive|neutral|negative|unknown 중 하나",
  "risks": ["투자자가 확인해야 할 점 1~3개. 쉬운 말로"],
  "keyNumbers": [
    { "label": "항목명", "value": "원문 그대로의 값 (없으면 빈 배열)" }
  ],
  "timeline": "주요 일정 흐름 한 줄 (예: 이사회결의(1/5) → 청약(2/10~11) → 납입(2/15) → 신주상장(2/25)). 날짜 정보 없으면 빈 문자열.",
  "disclosure_subtype": "위 목록 중 정확히 하나"
}`;

  return base + docPart + format;
}

// ─────────────────────────────────────────────
// Claude 호출 — 스트리밍으로 전문 수집 후 파싱
// ─────────────────────────────────────────────

async function callClaudeStreaming(
  row: DisclosureRow,
  docText: string,
  docMode: string,
  systemPrompt: string,
): Promise<Partial<ReceiptAnalysis> | null> {
  const userPrompt = buildUserPrompt(row, docText, docMode);

  // jp: 스트리밍 요청 — 사용자는 프론트에서 SSE로 바로 받고, 백엔드는 전체 수집 후 DB 저장
  let fullText = '';
  let promptTokens = 0;
  let completionTokens = 0;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': ENV.AI_DISCLOSURE.API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: ENV.AI_DISCLOSURE.MODEL,
        max_tokens: 1800,
        stream: true,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      console.error(`[AI분석] Claude 오류: ${res.status} ${await res.text()}`);
      return null;
    }

    // jp: SSE 스트림 읽기
    const reader = res.body?.getReader();
    if (!reader) return null;
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      for (const line of chunk.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;
        try {
          const event = JSON.parse(data) as {
            type: string;
            delta?: { type: string; text?: string };
            usage?: { input_tokens?: number; output_tokens?: number };
            message?: { usage?: { input_tokens?: number; output_tokens?: number } };
          };
          if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
            fullText += event.delta.text || '';
          }
          // jp: 토큰 집계 (message_start 또는 message_delta 이벤트)
          if (event.type === 'message_start' && event.message?.usage) {
            promptTokens = event.message.usage.input_tokens || 0;
          }
          if (event.type === 'message_delta' && event.usage) {
            completionTokens = event.usage.output_tokens || 0;
          }
        } catch { /* 파싱 불가 라인 무시 */ }
      }
    }
  } catch (err) {
    console.error('[AI분석] 스트리밍 실패:', err instanceof Error ? err.message : err);
    return null;
  }

  // jp: JSON 파싱 — 실패 시 1회 retry (모델이 가끔 앞뒤에 텍스트 붙임)
  let parsed = safeParseJson(fullText);
  if (!parsed) {
    // jp: JSON 블록만 추출 시도
    const match = fullText.match(/\{[\s\S]*\}/);
    if (match) parsed = safeParseJson(match[0]);
  }
  if (!parsed) {
    console.error('[AI분석] JSON 파싱 실패. 원문:', fullText.slice(0, 300));
    return null;
  }

  // jp: keyNumbers 정규화
  const rawNums = Array.isArray(parsed.keyNumbers) ? parsed.keyNumbers : [];
  const keyNumbers: KeyNumber[] = rawNums
    .filter((n): n is { label: unknown; value: unknown } => n && typeof n === 'object')
    .map((n) => ({ label: String(n.label || ''), value: String(n.value || '') }))
    .filter((n) => n.label && n.value);

  return {
    summary:          String(parsed.summary || ''),
    detail:           String(parsed.detail || ''),
    reason:           String(parsed.reason || ''),
    impact:           String(parsed.impact || 'unknown'),
    risks:            Array.isArray(parsed.risks) ? parsed.risks.map(String) : [],
    keyNumbers,
    timeline:         String(parsed.timeline || ''),
    subtype:          normalizeSubtype(parsed.disclosure_subtype),
    promptTokens,
    completionTokens,
  };
}

// ─────────────────────────────────────────────
// DB 헬퍼
// ─────────────────────────────────────────────

function fromDb(row: DisclosureRow): ReceiptAnalysis {
  // jp: ai_key_points 배열을 자연스러운 문장으로 조합 (기존: · 구분자 → 개선: 줄바꿈 없이 자연스럽게)
  let detail = row.summary || '';
  if (row.ai_key_points && row.ai_key_points.length > 0) {
    detail = row.ai_key_points
      .filter(Boolean)
      .map((p, i) => (i === 0 ? p : p.charAt(0).toLowerCase() + p.slice(1)))
      .join(' 또한 ');
  }

  return {
    summary:       row.ai_summary || row.report_name,
    detail,
    reason:        row.ai_investor_note || '',
    impact:        normalizeImpact(row.impact_level, row.sentiment),
    impactLabel:   impactLabel(normalizeImpact(row.impact_level, row.sentiment)),
    risks:         row.ai_risk_note ? row.ai_risk_note.split(' / ').filter(Boolean) : [],
    sourceMode:    'db',
  };
}

function fallbackAnalysis(row: DisclosureRow): ReceiptAnalysis {
  const impact = normalizeImpact(row.impact_level, row.sentiment);
  return {
    summary:       row.summary || row.report_name,
    detail:        row.summary || '',
    reason:        '',
    impact,
    impactLabel:   impactLabel(impact),
    risks:         [],
    sourceMode:    'none',
  };
}

// ─────────────────────────────────────────────
// 분석 완전성 검증
// ─────────────────────────────────────────────

// jp: DB에 저장된 분석 결과가 완전한지 검증
// jp: ai_summary만 보면 partial 저장 결과를 완성본으로 오인할 수 있음
// jp: ai_status가 명시적으로 'completed'이고 summary/detail이 모두 있어야 재사용
function isCompleteDbAnalysis(row: DisclosureRow): boolean {
  // jp: [1] ai_status가 명시적으로 'completed'여야 함
  //     failed/partial/null/undefined 상태는 재분석 필요
  // jp: undefined = 컬럼 없는 구버전 DB → status 체크 스킵하고 summary로만 판단
  const status = row.ai_status;
  if (status && status !== 'completed') return false;

  // jp: [2] 필수 필드가 실질적으로 채워져 있어야 함
  //     빈 문자열, null, 공시 제목만 복사된 경우 불완전
  const summary = (row.ai_summary || '').trim();
  if (summary.length < 10) return false;

  // jp: [3] summary가 단순히 report_name과 같으면 Claude가 실제로 분석 안 한 것
  //     fallbackAnalysis가 report_name을 summary로 쓰고 캐시된 경우
  if (summary === (row.report_name || '').trim()) return false;

  return true;
}

// jp: Claude 반환 결과의 필수 필드가 실질적으로 채워졌는지 검증
// jp: 빈 문자열 summary로 분석 성공 처리하는 것을 차단
function isValidAiResult(ai: Partial<ReceiptAnalysis>): boolean {
  const summary = (ai.summary || '').trim();
  const detail = (ai.detail || '').trim();
  // jp: summary 최소 10자, detail 최소 20자 — 실질적 분석 여부 기준
  return summary.length >= 10 && detail.length >= 20;
}

// ─────────────────────────────────────────────
// 메인 분석 함수
// ─────────────────────────────────────────────

export async function analyzeByReceiptNo(receiptNo: string): Promise<ReceiptAnalysisResponse | null> {

  // 1. Redis 캐시
  const cacheKey = `${CACHE_PREFIX}${receiptNo}`;
  try {
    const cached = await safeGet(cacheKey);
    if (cached) {
      const obj = JSON.parse(cached) as ReceiptAnalysisResponse;
      obj.cached = true;
      return obj;
    }
  } catch { /* 캐시 실패 무시 */ }

  // 2. DB 조회
  // jp: ai_status 컬럼이 없는 구버전 DB에서는 쿼리 자체가 실패할 수 있음
  // jp: 그 경우 ai_status 없이 재시도 → 서버가 죽지 않고 기존 동작 유지
  // jp: 단, 배포 전 마이그레이션(ALTER TABLE ... ADD COLUMN IF NOT EXISTS ai_status)을
  //     반드시 먼저 실행해야 isCompleteDbAnalysis의 status 체크가 실제로 작동함
  let rows: DisclosureRow[];
  try {
    rows = await query<DisclosureRow>(
      `SELECT receipt_no, stock_code, stock_name, corp_code, report_name, disclosure_type,
              category, importance, sentiment, summary, original_url, disclosed_at,
              is_important, is_capital, is_good, is_bad,
              ai_summary, ai_key_points, ai_investor_note, ai_risk_note, impact_level,
              ai_status
         FROM disclosures
        WHERE receipt_no = $1
        LIMIT 1`,
      [receiptNo]
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // jp: "column ai_status does not exist" — 마이그레이션 미실행 환경
    // jp: ai_status 없이 재시도 → 서버 죽지 않고 기존 동작(summary만으로 판단)
    if (msg.includes('ai_status') && msg.includes('does not exist')) {
      console.warn('[AI분석] ai_status 컬럼 없음 — 마이그레이션 필요. ai_status 제외하고 재조회.');
      try {
        rows = await query<DisclosureRow>(
          `SELECT receipt_no, stock_code, stock_name, corp_code, report_name, disclosure_type,
                  category, importance, sentiment, summary, original_url, disclosed_at,
                  is_important, is_capital, is_good, is_bad,
                  ai_summary, ai_key_points, ai_investor_note, ai_risk_note, impact_level
             FROM disclosures
            WHERE receipt_no = $1
            LIMIT 1`,
          [receiptNo]
        );
      } catch (err2) {
        console.error('[AI분석] DB 조회 실패(재시도):', err2 instanceof Error ? err2.message : err2);
        return null;
      }
    } else {
      console.error('[AI분석] DB 조회 실패:', msg);
      return null;
    }
  }

  if (!rows || rows.length === 0) return null;

  const row = rows[0];

  // 3. DB에 이미 완전한 분석 결과 있으면 재사용 (토큰 0)
  // jp: ai_summary 존재만으로 판단하지 않음
  // jp: - ai_status가 failed/partial이면 재분석 필요
  // jp: - summary가 비어있거나 공시 제목과 같으면 fallback이 캐시된 것 → 재분석
  // jp: - 위 조건을 통과한 경우에만 DB 결과를 완성본으로 신뢰
  if (isCompleteDbAnalysis(row)) {
    const dbResult: ReceiptAnalysisResponse = {
      receiptNo:   row.receipt_no,
      stockCode:   row.stock_code || '',
      stockName:   row.stock_name || '',
      reportName:  row.report_name,
      originalUrl: row.original_url || '',
      disclosedAt: row.disclosed_at,
      analysis:    fromDb(row),
      tokens:      0,
      cached:      true,
    };
    try { await safeSetEx(cacheKey, CACHE_TTL, JSON.stringify(dbResult)); } catch { /* 무시 */ }
    return dbResult;
  }

  let analysis: ReceiptAnalysis;

  if (isAiEnabled()) {
    // 4. DART 원문 추출 & 시스템 프롬프트 병렬 로드 (속도 개선)
    const [docResult, systemPrompt] = await Promise.allSettled([
      extractDisclosureCore(receiptNo, row.report_name).catch((err) => {
        console.warn('[AI분석] 원문 추출 실패, 제목 기반 분석:', err instanceof Error ? err.message : err);
        return { ok: false as const, text: '', mode: 'title' as const };
      }),
      getPrompt('disclosure_system').catch(() => ''),
    ]);

    const doc = docResult.status === 'fulfilled'
      ? docResult.value
      : { ok: false, text: '', mode: 'title' };

    const sysPrompt = systemPrompt.status === 'fulfilled' && systemPrompt.value
      ? systemPrompt.value
      : DEFAULT_SYSTEM_PROMPT;

    const docText = (doc.ok && doc.text) ? doc.text : '';
    const docMode = doc.mode || 'title';

    // 5. Claude 스트리밍 호출
    const ai = await callClaudeStreaming(row, docText, docMode, sysPrompt);

    // jp: [5-1] Claude 결과 유효성 검증
    // jp: ai !== null이어도 summary/detail이 실질적으로 비어있으면 partial 취급
    // jp: isValidAiResult 실패 = Claude가 JSON은 반환했지만 내용이 없는 케이스
    if (ai && isValidAiResult(ai)) {
      const impact = ai.impact && ai.impact !== 'unknown'
        ? ai.impact
        : normalizeImpact(row.impact_level, row.sentiment);
      const subtype = ai.subtype || '기타';
      const promptTokens = ai.promptTokens || 0;
      const completionTokens = ai.completionTokens || 0;
      const totalTokens = promptTokens + completionTokens;

      analysis = {
        // jp: ai.summary || fallback 순서 유지하되, 빈 문자열은 fallback으로
        summary:          ai.summary?.trim() || row.summary || row.report_name,
        detail:           ai.detail?.trim()  || row.summary || '',
        reason:           ai.reason  || '',
        impact,
        impactLabel:      impactLabel(impact),
        risks:            ai.risks   || [],
        keyNumbers:       ai.keyNumbers || [],
        timeline:         ai.timeline   || '',
        subtype,
        promptTokens,
        completionTokens,
        sourceMode:       docMode,
      };

      // jp: [6] DB 저장 — 성공 시에만 ai_status='completed'
      // jp: 확장 컬럼(ai_key_numbers/ai_timeline) → 기본 컬럼 fallback
      // jp: 두 번 모두 실패해도 analysis는 메모리에서 응답 가능 (저장 실패 ≠ 분석 실패)
      let dbSaved = false;
      try {
        await query(
          `UPDATE disclosures
              SET ai_summary            = $1,
                  ai_investor_note      = $2,
                  ai_risk_note          = $3,
                  impact_level          = $4,
                  disclosure_subtype    = $5,
                  ai_prompt_tokens      = $6,
                  ai_completion_tokens  = $7,
                  ai_total_tokens       = $8,
                  ai_status             = 'completed',
                  ai_analyzed_at        = now(),
                  ai_model              = $9,
                  ai_key_numbers        = $10,
                  ai_timeline           = $11
            WHERE receipt_no = $12`,
          [
            analysis.summary,
            analysis.reason,
            analysis.risks.join(' / '),
            analysis.impactLabel,
            subtype,
            promptTokens,
            completionTokens,
            totalTokens,
            ENV.AI_DISCLOSURE.MODEL,
            JSON.stringify(analysis.keyNumbers || []),
            analysis.timeline || '',
            receiptNo,
          ]
        );
        dbSaved = true;
      } catch (e) {
        // jp: 확장 컬럼 없는 경우 기본 컬럼만 저장
        console.warn('[AI분석] 확장 컬럼 저장 실패, 기본 컬럼으로 재시도:', (e as Error).message);
        try {
          await query(
            `UPDATE disclosures
                SET ai_summary = $1, ai_investor_note = $2, ai_risk_note = $3,
                    impact_level = $4, disclosure_subtype = $5,
                    ai_prompt_tokens = $6, ai_completion_tokens = $7, ai_total_tokens = $8,
                    ai_status = 'completed', ai_analyzed_at = now(), ai_model = $9
              WHERE receipt_no = $10`,
            [analysis.summary, analysis.reason, analysis.risks.join(' / '), analysis.impactLabel, subtype,
             promptTokens, completionTokens, totalTokens, ENV.AI_DISCLOSURE.MODEL, receiptNo]
          );
          dbSaved = true;
        } catch (e2) {
          // jp: 저장 실패해도 응답은 정상 반환 — 단, Redis 캐시는 하지 않음 (DB 불일치 방지)
          console.error('[AI분석] DB 저장 완전 실패:', (e2 as Error).message);
        }
      }

      const result: ReceiptAnalysisResponse = {
        receiptNo:   row.receipt_no,
        stockCode:   row.stock_code || '',
        stockName:   row.stock_name || '',
        reportName:  row.report_name,
        originalUrl: row.original_url || '',
        disclosedAt: row.disclosed_at,
        analysis,
        tokens: totalTokens,
      };

      // jp: DB 저장 성공한 경우에만 Redis 캐시 (저장 실패 시 캐시하면 DB와 불일치 영구화)
      if (dbSaved) {
        try { await safeSetEx(cacheKey, CACHE_TTL, JSON.stringify(result)); } catch { /* 무시 */ }
      }

      // jp: [7] 임베딩 — AI 분석 완전 성공 후에만 호출
      // jp: 분석 실패/partial 시 임베딩 호출 금지 (불완전 분석 공시의 임베딩 방지)
      // jp: 백그라운드 실행 (응답 대기 안 함) — 실패해도 분석 결과에 영향 없음
      // jp: 임베딩 실패 시 notes_embed_status에 failed 기록
      //     → notesEmbedRetry.job이 10분마다 자동으로 잡아서 재처리
      if (row.corp_code) {
        embedAndStoreNotes({
          corpCode:    row.corp_code,
          stockCode:   row.stock_code || undefined,
          stockName:   row.stock_name || undefined,
          receiptNo:   row.receipt_no,
          reportName:  row.report_name,
          disclosedAt: row.disclosed_at,
        }).then((r) => {
          if (r.ok && r.chunks > 0) {
            console.log(`[RAG] 주석 자동 임베딩: ${row.stock_name} ${r.chunks}청크`);
          } else if (!r.ok && r.skipped !== 'not-periodic' && r.skipped !== 'already-embedded') {
            // jp: 정기보고서인데 임베딩 실패 — 로그로 남겨서 모니터링 가능하게
            // jp: notes_embed_status는 embedAndStoreNotes 내부에서 'failed'로 기록됨
            // jp: notesEmbedRetry.job이 10분 후 자동 재처리
            console.warn(`[RAG] 주석 임베딩 실패 (${row.receipt_no}): ${r.skipped || 'unknown'} — 재시도 잡이 처리 예정`);
          }
        }).catch((err) => {
          // jp: 예외 발생 시에도 notes_embed_status는 이미 embedAndStoreNotes 내부에서 기록됨
          console.warn('[RAG] 주석 임베딩 예외 (재시도 잡이 처리 예정):', err instanceof Error ? err.message : err);
        });
      }

      return result;

    } else {
      // jp: Claude 호출 실패(ai=null) 또는 내용 불충분(isValidAiResult=false)
      // jp: ai_status='failed'로 명시적 저장 → 다음 호출 시 재시도 가능
      // jp: (isCompleteDbAnalysis는 status='failed'를 재사용 대상에서 제외함)
      const failReason = !ai
        ? 'claude-null'
        : `invalid-result:summary=${(ai.summary||'').length}chars,detail=${(ai.detail||'').length}chars`;
      console.warn(`[AI분석] 분석 실패 (${receiptNo}): ${failReason}`);
      try {
        await query(
          `UPDATE disclosures
              SET ai_status = 'failed',
                  ai_analyzed_at = now(),
                  ai_model = $1
            WHERE receipt_no = $2`,
          [ENV.AI_DISCLOSURE.MODEL, receiptNo]
        );
      } catch (e) {
        console.warn('[AI분석] failed 상태 저장 실패:', (e as Error).message);
      }
      // jp: fallback 응답 반환 — 단, Redis 캐시하지 않음 (재시도 가능하게 유지)
      analysis = isCompleteDbAnalysis(row) ? fromDb(row) : fallbackAnalysis(row);
    }
  } else {
    // jp: AI 비활성화 — fallback 반환, 캐시 안 함
    analysis = isCompleteDbAnalysis(row) ? fromDb(row) : fallbackAnalysis(row);
  }

  // jp: 여기까지 오면 AI 실패 또는 AI 비활성화 케이스
  // jp: fallback 결과는 Redis 캐시하지 않음 — 재시도 시 항상 재분석 가능하게
  const result: ReceiptAnalysisResponse = {
    receiptNo:   row.receipt_no,
    stockCode:   row.stock_code || '',
    stockName:   row.stock_name || '',
    reportName:  row.report_name,
    originalUrl: row.original_url || '',
    disclosedAt: row.disclosed_at,
    analysis,
    tokens: 0,
  };

  // jp: fallback/failed 결과는 캐시하지 않음
  // jp: 캐시하면 7일간 실패 결과가 완성본처럼 노출됨
  return result;
}

// ─────────────────────────────────────────────
// 백그라운드 선분석 — 수집 시점에 호출해서 Redis/DB 워밍업
// jp: 공시 수집 워커에서 importanceScore 높은 공시에 대해 호출
// jp: 사용자 요청 전에 미리 분석해두면 항상 캐시 히트
// ─────────────────────────────────────────────

export async function preAnalyzeDisclosure(receiptNo: string): Promise<void> {
  const cacheKey = `${CACHE_PREFIX}${receiptNo}`;

  // jp: 이미 캐시 또는 DB 분석 있으면 스킵
  try {
    const cached = await safeGet(cacheKey);
    if (cached) return;
  } catch { /* 무시 */ }

  try {
    // jp: ai_summary 단독 체크에서 isCompleteDbAnalysis 기준으로 교체
    // jp: partial/failed 결과로 스킵되는 문제 방지
    const rows = await query<Pick<DisclosureRow, 'ai_summary' | 'report_name' | 'ai_status'>>(
      `SELECT ai_summary, report_name, ai_status FROM disclosures WHERE receipt_no = $1 LIMIT 1`,
      [receiptNo]
    );
    if (rows?.[0] && isCompleteDbAnalysis(rows[0] as unknown as DisclosureRow)) return;
  } catch { /* 무시 */ }

  // jp: 분석 실행 (결과는 analyzeByReceiptNo 내부에서 캐싱됨)
  await analyzeByReceiptNo(receiptNo).catch((err) => {
    console.warn(`[선분석] ${receiptNo} 실패:`, err instanceof Error ? err.message : err);
  });
}

// ─────────────────────────────────────────────
// 기본 시스템 프롬프트 (promptStore DB 장애 시 fallback)
// ─────────────────────────────────────────────

const DEFAULT_SYSTEM_PROMPT = `너는 한국 상장사 공시를 초등학생도 이해할 수 있게 쉽게 풀어주는 AI 분석가다.

원칙:
- 어려운 금융/회계 용어가 나오면 반드시 쉬운 말로 풀어서 설명한다.
- 제공된 공시 원문 데이터만 사용한다. 원문에 없는 사실/숫자/전망은 절대 지어내지 않는다.
- 숫자(금액, 주식 수, 비율, 날짜)는 원문 그대로 정확히 쓰되, 큰 금액은 읽기 쉽게 표현한다.
- 투자 추천 금지. 매수/매도 추천 금지. "사라/팔아야 한다" 같은 단정 금지.
- 자본조달 공시(유상증자, 전환사채 등)를 무조건 호재/악재로 단정하지 않고, 방식과 목적에 따라 다르다고 설명한다.
- 따뜻하고 친절한 말투로 초등학생에게 설명하듯 한다.
- keyNumbers에는 원문에서 찾은 숫자만 넣는다. 없으면 빈 배열.

반드시 JSON만 출력한다 (설명·마크다운 없이).`;
