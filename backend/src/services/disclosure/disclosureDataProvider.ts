// jp: 데이터 제공자 팩토리 - mock/실제 환경에 따라 자동 선택

import { IDisclosureDataProvider } from '../../types/disclosure';
import { ENV } from '../../config/env';
import { MockDisclosureDataProvider } from './mockDisclosureDataProvider';
import { DartDisclosureDataProvider } from './dartDisclosureDataProvider';

let _provider: IDisclosureDataProvider | null = null;

export function getDisclosureDataProvider(): IDisclosureDataProvider {
  if (_provider) return _provider;

  if (ENV.USE_MOCK_DISCLOSURE || ENV.USE_MOCK_DATA) {
    console.log('[Disclosure] mock 데이터 제공자 사용');
    _provider = new MockDisclosureDataProvider();
  } else {
    console.log('[Disclosure] 실제 DART API 데이터 제공자 사용');
    _provider = new DartDisclosureDataProvider();
  }

  return _provider;
}
