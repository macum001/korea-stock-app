// jp: 가격/공시 알림 조건 CRUD API
// jp: ★ 회원가입 필수 - requireAuth로 로그인 사용자만, 그 사용자 id로 저장
// jp: 프론트 alertStore가 이 API로 조건을 백엔드 DB(stock_alert_conditions)에 저장
// jp: 이 조건들을 priceAlert.service.ts가 읽어서 가격 수신 시 알림 발송

import { Router, Response } from 'express';
import { z } from 'zod';
import {
  getConditions,
  createCondition,
  deleteCondition,
  toggleCondition,
} from '../repositories/alertCondition.repository';
import { requireAuth, AuthedRequest } from '../middleware/requireAuth';
import { ApiResponse } from '../types';

const router = Router();

// jp: ★ 모든 알림 라우트는 로그인 필수 (requireAuth) - 없으면 401
router.use(requireAuth);

// jp: 알림 조건 생성 스키마
const createSchema = z.object({
  id: z.string().min(1),
  stockCode: z.string().regex(/^\d{6}$/),
  stockName: z.string().min(1),
  type: z.enum([
    'price_above', 'price_below', 'change_rate_above', 'change_rate_below',
    'volume_spike', 'disclosure_all', 'disclosure_important', 'disclosure_keyword',
  ]),
  value: z.number().optional(),
  keyword: z.string().optional(),
  cooldownMinutes: z.number().int().min(1).max(1440).optional(),
});

// jp: GET /api/alerts?stockCode=005930 - 알림 조건 조회 (종목별 또는 전체)
router.get('/', async (req: AuthedRequest, res: Response) => {
  const stockCode = req.query.stockCode as string | undefined;
  try {
    const rows = await getConditions(req.userId!, stockCode);
    const data = rows.map(r => ({
      id: r.id,
      stockCode: r.stock_code,
      stockName: r.stock_name,
      type: r.type,
      value: r.value,
      keyword: r.keyword,
      isEnabled: r.is_enabled,
      cooldownMinutes: r.cooldown_minutes,
      lastTriggeredAt: r.last_triggered_at,
    }));
    res.json({ success: true, data } as ApiResponse);
  } catch (err) {
    console.error('[Alert] 조회 실패:', err instanceof Error ? err.message : err);
    res.json({ success: true, data: [] } as ApiResponse);
  }
});

// jp: POST /api/alerts - 알림 조건 생성
router.post('/', async (req: AuthedRequest, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: '잘못된 알림 조건이에요.' } as ApiResponse);
  }
  const c = parsed.data;
  try {
    await createCondition(req.userId!, {
      id: c.id,
      stockCode: c.stockCode,
      stockName: c.stockName,
      type: c.type,
      value: c.value,
      keyword: c.keyword,
      cooldownMinutes: c.cooldownMinutes ?? 10,
    });
    res.json({ success: true, data: { id: c.id } } as ApiResponse);
  } catch (err) {
    console.error('[Alert] 생성 실패:', err instanceof Error ? err.message : err);
    res.status(500).json({ success: false, error: '알림 조건 저장에 실패했어요.' } as ApiResponse);
  }
});

// jp: DELETE /api/alerts/:id - 알림 조건 삭제
router.delete('/:id', async (req: AuthedRequest, res: Response) => {
  try {
    await deleteCondition(req.userId!, req.params.id);
    res.json({ success: true } as ApiResponse);
  } catch (err) {
    console.error('[Alert] 삭제 실패:', err instanceof Error ? err.message : err);
    res.status(500).json({ success: false, error: '알림 조건 삭제에 실패했어요.' } as ApiResponse);
  }
});

// jp: PATCH /api/alerts/:id/toggle - 알림 조건 켜기/끄기
router.patch('/:id/toggle', async (req: AuthedRequest, res: Response) => {
  try {
    await toggleCondition(req.userId!, req.params.id);
    res.json({ success: true } as ApiResponse);
  } catch (err) {
    console.error('[Alert] 토글 실패:', err instanceof Error ? err.message : err);
    res.status(500).json({ success: false, error: '알림 조건 변경에 실패했어요.' } as ApiResponse);
  }
});

export default router;
