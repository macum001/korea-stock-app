// jp: 공시 요약 서비스 - rule-based (나중에 AI로 교체 가능)

interface SummaryInput {
  stockName:      string;
  reportName:     string;
  disclosureType: string;
}

// jp: 키워드 → 요약 템플릿 매핑
const TEMPLATES: Array<{ keywords: string[]; text: (n: string, r: string) => string }> = [
  { keywords: ['공급계약','단일판매'],    text: n => `${n}이(가) 대규모 공급계약을 체결했습니다. 매출 영향 가능성이 있어 확인이 필요합니다.` },
  { keywords: ['자기주식취득','자기주식 취득'], text: n => `${n}이(가) 주주가치 제고를 위해 자기주식 취득을 결정했습니다.` },
  { keywords: ['신규시설투자'],           text: n => `${n}이(가) 신규 시설 투자를 결정했습니다. 생산 능력 확대가 예상됩니다.` },
  { keywords: ['무상증자'],              text: n => `${n}이(가) 무상증자를 결정했습니다. 주식 수 증가로 주당 가격이 조정될 수 있습니다.` },
  { keywords: ['기술이전'],              text: n => `${n}이(가) 기술이전 계약을 체결했습니다. 계약 규모 및 조건은 원문을 확인해주세요.` },
  { keywords: ['FDA'],                   text: n => `${n}의 FDA 관련 공시가 등록됐습니다. 승인 여부는 원문을 확인해주세요.` },
  { keywords: ['품목허가'],              text: n => `${n}이(가) 품목허가를 취득했습니다. 상업화가 가능해졌습니다.` },
  { keywords: ['수주'],                  text: n => `${n}이(가) 신규 수주를 공시했습니다. 수주 금액은 원문을 확인해주세요.` },
  { keywords: ['유상증자'],              text: _ => `유상증자 발행 관련 공시입니다. 주식 희석 가능성을 확인해야 합니다.` },
  { keywords: ['전환사채'],              text: _ => `전환사채 발행 관련 공시입니다. 주식 희석 가능성을 확인해야 합니다.` },
  { keywords: ['신주인수권부사채'],      text: _ => `신주인수권부사채 발행 관련 공시입니다. 워런트 행사 시 희석 효과에 유의하세요.` },
  { keywords: ['최대주주변경'],          text: n => `${n}의 최대주주 변경이 발생했습니다. 경영권 변동 가능성을 확인해주세요.` },
  { keywords: ['대표이사변경'],          text: n => `${n}의 대표이사가 변경됐습니다. 새로운 경영진의 방향성을 주목해주세요.` },
  { keywords: ['거래정지'],              text: _ => `거래정지 관련 공시입니다. 투자 위험도가 높으므로 원문 확인이 필요합니다.` },
  { keywords: ['상장폐지'],              text: _ => `상장폐지 관련 공시입니다. 보유 주식에 대한 각별한 주의가 필요합니다.` },
  { keywords: ['관리종목'],              text: n => `${n}이(가) 관리종목으로 지정됐습니다. 상장폐지 위험에 유의하세요.` },
  { keywords: ['횡령','배임'],           text: n => `${n} 임직원 횡령/배임 혐의 공시입니다. 법적 절차를 주시해주세요.` },
  { keywords: ['소송'],                  text: n => `${n}이(가) 소송 관련 공시를 했습니다. 결과에 따라 재무적 영향이 발생할 수 있습니다.` },
  { keywords: ['감사의견'],              text: _ => `감사의견 관련 공시입니다. 감사의견 종류에 따라 상장 유지 여부가 결정될 수 있습니다.` },
  { keywords: ['흑자전환'],              text: n => `${n}이(가) 흑자전환을 공시했습니다. 수익성이 개선됐습니다.` },
  { keywords: ['적자전환'],              text: n => `${n}이(가) 적자전환을 공시했습니다. 수익성 악화에 주의가 필요합니다.` },
  { keywords: ['분기보고서','반기보고서','사업보고서'], text: (n, r) => `${n}의 ${r}이(가) 제출됐습니다. 재무 현황은 원문을 확인해주세요.` },
  { keywords: ['특허권','특허'],         text: n => `${n}이(가) 특허권을 취득했습니다. 기술 경쟁력 강화에 기여할 것으로 예상됩니다.` },
  { keywords: ['파산','회생절차'],       text: n => `${n}의 파산/회생 관련 공시입니다. 투자 위험이 매우 높으니 즉시 확인하세요.` },
];

// jp: rule-based 요약 생성
function generateRuleBasedSummary(stockName: string, reportName: string): string {
  for (const tmpl of TEMPLATES) {
    if (tmpl.keywords.some(kw => reportName.includes(kw))) {
      return (tmpl.text as (n: string, r: string) => string)(stockName, reportName);
    }
  }
  return `${stockName}의 ${reportName} 공시가 등록됐습니다. 상세 내용은 원문을 확인해주세요.`;
}

// jp: 핵심 요약 생성 함수 - AI 교체 시 이 함수만 수정
export async function createDisclosureSummary(input: SummaryInput): Promise<string> {
  return generateRuleBasedSummary(input.stockName, input.reportName);
}

// jp: AI 요약으로 교체할 때 아래 함수 구현 (Phase 5)
// export async function createAISummary(input: SummaryInput): Promise<string> {
//   const response = await anthropic.messages.create({
//     model: 'claude-sonnet-4-6', max_tokens: 200,
//     messages: [{ role: 'user', content: `공시 요약: ${input.stockName} - ${input.reportName}` }]
//   });
//   return response.content[0].text;
// }
