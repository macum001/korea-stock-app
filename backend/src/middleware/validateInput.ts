// jp: 입력 검증 미들웨어 - 종목코드 형식 확인 (이상한 값이 외부 API로 흘러가는 것 방지)

import { Request, Response, NextFunction } from 'express';

// jp: 한국 종목코드 = 6자리 숫자
const STOCK_CODE_RE = /^\d{6}$/;

export function isValidStockCode(code: string): boolean {
  return STOCK_CODE_RE.test(code);
}

// jp: :code 경로 파라미터 검증
export function validateStockCodeParam(req: Request, res: Response, next: NextFunction): void {
  const code = req.params.code;
  if (!code || !isValidStockCode(code)) {
    res.status(400).json({ success: false, error: '올바르지 않은 종목 코드예요.' });
    return;
  }
  next();
}

// jp: codes= 쿼리(콤마 구분) 검증 + 정제 - 유효 코드만 남겨 req에 부착
export function sanitizeCodesQuery(req: Request, _res: Response, next: NextFunction): void {
  const raw = (req.query.codes as string) || '';
  const valid = raw.split(',')
    .map(c => c.trim())
    .filter(c => isValidStockCode(c))
    .slice(0, 30); // jp: 최대 30개
  // jp: 정제된 코드를 별도 프로퍼티로 전달
  (req as Request & { validCodes?: string[] }).validCodes = valid;
  next();
}
