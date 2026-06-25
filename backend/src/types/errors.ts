// jp: 에러 타입 정의

export type AppErrorType =
  | 'DART_API_ERROR'
  | 'DART_RATE_LIMIT'
  | 'DART_CORP_CODE_SYNC_ERROR'
  | 'DISCLOSURE_DUPLICATE'
  | 'DATABASE_ERROR'
  | 'REDIS_ERROR'
  | 'UNKNOWN_ERROR';

export const ERROR_USER_MESSAGES: Record<AppErrorType, string> = {
  DART_API_ERROR:            '공시 정보를 불러오지 못했어요.',
  DART_RATE_LIMIT:           '공시 API 요청이 너무 많아요. 잠시 후 다시 시도해주세요.',
  DART_CORP_CODE_SYNC_ERROR: '회사 코드 정보를 동기화하지 못했어요.',
  DISCLOSURE_DUPLICATE:      '이미 수집된 공시예요.',
  DATABASE_ERROR:            '공시 데이터 저장에 실패했어요.',
  REDIS_ERROR:               '공시 캐시를 갱신하지 못했어요.',
  UNKNOWN_ERROR:             '알 수 없는 오류가 발생했어요.',
};

export class AppError extends Error {
  constructor(
    public readonly type: AppErrorType,
    message: string,
    public readonly statusCode: number = 500
  ) {
    super(message);
    this.name = 'AppError';
  }

  get userMessage(): string {
    return ERROR_USER_MESSAGES[this.type];
  }
}
