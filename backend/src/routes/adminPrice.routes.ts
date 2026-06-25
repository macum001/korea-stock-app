// jp: 관리자 가격 관리 API - 캐시 정리 / 비정상 가격 정리 / 디버그
// jp: requireAdmin은 app.ts에서 적용됨

import { Router, Request, Response } from 'express';
import { safeDelPattern, safeGet } from '../config/redis';
import { query, isDbReady } from '../config/db';
import { syncStockMaster, getMasterCount, debugMstLine } from '../services/stock/stockMasterSync.service';
import { getVolumeRank, getFluctuationRank } from '../services/kis/kisRest.service';
import { ApiResponse } from '../types';

const router = Router();

// jp: GET /api/admin/stocks/count - 종목 마스터 현황 (검색 가능 종목 수 증명용)
router.get('/stocks/count', async (_req: Request, res: Response) => {
  const total = await getMasterCount();
  let byMarket: unknown[] = [];
  if (isDbReady()) {
    try {
      byMarket = await query(
        `SELECT market, COUNT(*)::int AS count,
                SUM(CASE WHEN is_etf THEN 1 ELSE 0 END)::int AS etf_count
           FROM stock_master GROUP BY market ORDER BY market`
      );
    } catch { /* 무시 */ }
  }
  res.json({ success: true, data: { total, byMarket } } as ApiResponse);
});

// jp: POST /api/admin/stocks/sync-master - 전 종목 마스터 수동 동기화
router.post('/stocks/sync-master', async (_req: Request, res: Response) => {
  console.log('[admin] 종목 마스터 수동 동기화 요청');
  await syncStockMaster();
  const total = await getMasterCount();
  res.json({ success: true, data: { total } } as ApiResponse);
});

// jp: GET /api/admin/debug/mst-line?code=005930 - mst 파일 raw 구조 진단
router.get('/debug/mst-line', async (req: Request, res: Response) => {
  const code = (req.query.code as string) || '005930';
  const result = await debugMstLine(code);
  res.json({ success: true, data: result } as ApiResponse);
});

// jp: POST /api/admin/cache/clear-stock-prices - Redis 가격 캐시 전체 삭제
// jp: mock에서 저장됐을 수 있는 캐시 가격 제거용
router.post('/cache/clear-stock-prices', async (_req: Request, res: Response) => {
  const deleted = await safeDelPattern('stock:price:*');
  console.log(`[admin] 가격 캐시 삭제: ${deleted}건`);
  res.json({ success: true, data: { deleted } } as ApiResponse);
});

// jp: POST /api/admin/prices/clean-suspicious - DB의 비정상 가격 정리
// jp: 의심 기준: price <= 0, 또는 price가 비정상적으로 낮음(예: change가 price로 저장된 케이스)
router.post('/prices/clean-suspicious', async (_req: Request, res: Response) => {
  if (!isDbReady()) return res.json({ success: false, error: 'DB 미연결' } as ApiResponse);
  try {
    // jp: price <= 0 인 명백한 비정상 행 삭제
    const result = await query<{ stock_code: string; price: number }>(
      `DELETE FROM stock_prices WHERE price <= 0 RETURNING stock_code, price`
    );
    const deleted = result.length;
    console.log(`[admin] 비정상 가격 삭제: ${deleted}건`, result.map(r => r.stock_code).join(','));
    res.json({ success: true, data: { deleted, codes: result.map(r => r.stock_code) } } as ApiResponse);
  } catch (err) {
    res.json({ success: false, error: err instanceof Error ? err.message : '실패' } as ApiResponse);
  }
});

// jp: GET /api/admin/prices/debug/:code - 종목 가격 출처별 디버그
// jp: Redis 캐시값 + DB 마지막 정상값을 함께 보여줌 (어디서 이상값이 오는지 추적)
router.get('/prices/debug/:code', async (req: Request, res: Response) => {
  const { code } = req.params;
  const cached = await safeGet(`stock:price:${code}`);
  let dbRow: unknown = null;
  if (isDbReady()) {
    try {
      const rows = await query(
        `SELECT stock_code, price, change, change_rate, volume, updated_at
           FROM stock_prices WHERE stock_code = $1 LIMIT 1`,
        [code]
      );
      dbRow = rows[0] ?? null;
    } catch { /* 무시 */ }
  }
  res.json({
    success: true,
    data: {
      code,
      redisCache: cached ? JSON.parse(cached) : null,
      dbLastGood: dbRow,
    },
  } as ApiResponse);
});

// jp: GET /api/admin/ranking-test - 순위 API 작동 검증 (모의투자에서 되는지 확인용)
router.get('/ranking-test', async (_req: Request, res: Response) => {
  const result: Record<string, unknown> = {};
  try {
    const volume = await getVolumeRank(10);
    result.volumeRank = { ok: true, count: volume.length, sample: volume.slice(0, 5) };
  } catch (err) {
    result.volumeRank = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  try {
    const fluctuation = await getFluctuationRank(10);
    result.fluctuationRank = { ok: true, count: fluctuation.length, sample: fluctuation.slice(0, 5) };
  } catch (err) {
    result.fluctuationRank = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  res.json({ success: true, data: result } as ApiResponse);
});

export default router;
