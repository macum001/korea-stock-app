// jp: mock 데이터 제공자 - USE_MOCK_DISCLOSURE=true 시 사용

import { Disclosure, IDisclosureDataProvider } from '../../types/disclosure';
import { MOCK_DISCLOSURES } from '../../mocks/mockDisclosures';

export class MockDisclosureDataProvider implements IDisclosureDataProvider {
  async fetchLatestDisclosures(): Promise<Disclosure[]> {
    return [...MOCK_DISCLOSURES].sort(
      (a, b) => new Date(b.disclosedAt).getTime() - new Date(a.disclosedAt).getTime()
    );
  }

  async fetchDisclosuresByStockCode(stockCode: string): Promise<Disclosure[]> {
    return MOCK_DISCLOSURES
      .filter(d => d.stockCode === stockCode)
      .sort((a, b) => new Date(b.disclosedAt).getTime() - new Date(a.disclosedAt).getTime());
  }

  async fetchDisclosuresByCorpCode(corpCode: string): Promise<Disclosure[]> {
    return MOCK_DISCLOSURES
      .filter(d => d.corpCode === corpCode)
      .sort((a, b) => new Date(b.disclosedAt).getTime() - new Date(a.disclosedAt).getTime());
  }
}
