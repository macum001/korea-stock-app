// jp: 실제 OpenDART 데이터 제공자 - USE_MOCK_DISCLOSURE=false 시 사용

import { Disclosure, IDisclosureDataProvider } from '../../types/disclosure';
import { DartListItem } from '../../types/dart';
import { fetchLatestDisclosures, fetchDisclosuresByCorpCode, createDartOriginalUrl } from './dartApi.service';
import { classifyDisclosure } from './disclosureClassifier.service';
import { createDisclosureSummary } from './disclosureSummary.service';
import { getCorpCodeByStockCode } from './dartCompany.service';

// jp: DART 응답 → 내부 Disclosure 타입 변환
async function normalizeDartItem(item: DartListItem): Promise<Disclosure> {
  const classification = classifyDisclosure(item.report_nm, item.pblntf_detail_ty);
  const partial: Omit<Disclosure, 'summary'> = {
    stockCode:       item.stock_code || undefined,
    stockName:       item.corp_name,
    corpCode:        item.corp_code,
    receiptNo:       item.rcept_no,
    reportName:      item.report_nm,
    disclosureType:  item.pblntf_detail_ty,
    importance:      classification.importance,
    sentiment:       classification.sentiment,
    positiveScore:   classification.positiveScore,
    negativeScore:   classification.negativeScore,
    cautionScore:    classification.cautionScore,
    matchedKeywords: classification.matchedKeywords,
    // jp: 탭 분류 플래그
    isImportant:     classification.isImportant,
    isCapital:       classification.isCapital,
    isGood:          classification.isGood,
    isBad:           classification.isBad,
    isCorrection:    classification.isCorrection,
    normalizedTitle: classification.normalizedTitle,
    category:        classification.category,
    originalUrl:     createDartOriginalUrl(item.rcept_no),
    disclosedAt:     new Date(
      item.rcept_dt.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3')
    ).toISOString(),
    collectedAt: new Date().toISOString(),
  };

  const summary = await createDisclosureSummary({
    stockName:      item.corp_name,
    reportName:     item.report_nm,
    disclosureType: item.pblntf_detail_ty,
  });

  return { ...partial, summary };
}

export class DartDisclosureDataProvider implements IDisclosureDataProvider {
  async fetchLatestDisclosures(startDate?: string): Promise<Disclosure[]> {
    const items = await fetchLatestDisclosures(startDate);
    return Promise.all(items.map(normalizeDartItem));
  }

  async fetchDisclosuresByStockCode(stockCode: string, startDate?: string): Promise<Disclosure[]> {
    const corpCode = await getCorpCodeByStockCode(stockCode);
    if (!corpCode) return [];
    return this.fetchDisclosuresByCorpCode(corpCode, startDate);
  }

  async fetchDisclosuresByCorpCode(corpCode: string, startDate?: string): Promise<Disclosure[]> {
    const items = await fetchDisclosuresByCorpCode(corpCode, startDate);
    return Promise.all(items.map(normalizeDartItem));
  }
}
