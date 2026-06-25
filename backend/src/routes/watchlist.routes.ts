// jp: 관심종목 API 라우트 - 인증 필수, 본인 데이터만 접근 (멀티유저)

import { Router, Response } from 'express';
import { ApiResponse } from '../types';
import { isDbReady } from '../config/db';
import { requireAuth, AuthedRequest } from '../middleware/requireAuth';
import * as wl from '../repositories/watchlist.repository';
import * as alert from '../repositories/alertCondition.repository';

const router = Router();

// jp: 이 라우터 전체에 인증 적용 - 본인 데이터만
router.use(requireAuth);

function requireDb(res: Response): boolean {
  if (!isDbReady()) {
    res.status(503).json({ success: false, error: 'DB 미연결' } as ApiResponse);
    return false;
  }
  return true;
}

// jp: 전체 상태 조회 (그룹 + 종목)
router.get('/', async (req: AuthedRequest, res: Response) => {
  if (!requireDb(res)) return;
  const uid = req.userId!;
  try {
    const [groups, items] = await Promise.all([wl.getGroups(uid), wl.getItems(uid)]);
    res.json({ success: true, data: { groups, items } } as ApiResponse);
  } catch {
    res.status(500).json({ success: false, error: '관심종목 조회 실패' } as ApiResponse);
  }
});

// jp: 그룹
router.post('/groups', async (req: AuthedRequest, res: Response) => {
  if (!requireDb(res)) return;
  const { id, name, sortOrder } = req.body as { id: string; name: string; sortOrder: number };
  try {
    await wl.createGroup(req.userId!, id, name, sortOrder ?? 0);
    res.json({ success: true } as ApiResponse);
  } catch {
    res.status(500).json({ success: false, error: '그룹 생성 실패' } as ApiResponse);
  }
});

router.patch('/groups/:id', async (req: AuthedRequest, res: Response) => {
  if (!requireDb(res)) return;
  const { name, sortOrder } = req.body as { name?: string; sortOrder?: number };
  try {
    if (name !== undefined) await wl.renameGroup(req.userId!, req.params.id, name);
    if (sortOrder !== undefined) await wl.updateGroupOrder(req.userId!, req.params.id, sortOrder);
    res.json({ success: true } as ApiResponse);
  } catch {
    res.status(500).json({ success: false, error: '그룹 수정 실패' } as ApiResponse);
  }
});

router.delete('/groups/:id', async (req: AuthedRequest, res: Response) => {
  if (!requireDb(res)) return;
  const mode = (req.query.mode as string) === 'delete_all' ? 'delete_all' : 'move_to_default';
  try {
    await wl.deleteGroup(req.userId!, req.params.id, mode);
    res.json({ success: true } as ApiResponse);
  } catch {
    res.status(500).json({ success: false, error: '그룹 삭제 실패' } as ApiResponse);
  }
});

// jp: 종목
router.post('/', async (req: AuthedRequest, res: Response) => {
  if (!requireDb(res)) return;
  const { stockCode, stockName, groupId = 'default' } = req.body as { stockCode: string; stockName: string; groupId?: string };
  if (!stockCode || !/^\d{6}$/.test(stockCode)) {
    return res.status(400).json({ success: false, error: '올바른 종목 코드가 필요해요.' } as ApiResponse);
  }
  try {
    await wl.addItem(req.userId!, stockCode, stockName || stockCode, groupId);
    res.json({ success: true } as ApiResponse);
  } catch {
    res.status(500).json({ success: false, error: '관심종목 추가 실패' } as ApiResponse);
  }
});

router.delete('/:code', async (req: AuthedRequest, res: Response) => {
  if (!requireDb(res)) return;
  try {
    await wl.removeItem(req.userId!, req.params.code);
    res.json({ success: true } as ApiResponse);
  } catch {
    res.status(500).json({ success: false, error: '관심종목 삭제 실패' } as ApiResponse);
  }
});

router.patch('/:code', async (req: AuthedRequest, res: Response) => {
  if (!requireDb(res)) return;
  const uid = req.userId!;
  const { groupId, sortOrder, memo, deleteMemo, priceAlert, disclosureAlert } = req.body as {
    groupId?: string; sortOrder?: number; memo?: string; deleteMemo?: boolean;
    priceAlert?: boolean; disclosureAlert?: boolean;
  };
  try {
    if (groupId !== undefined) await wl.moveItemToGroup(uid, req.params.code, groupId);
    if (sortOrder !== undefined) await wl.updateItemOrder(uid, req.params.code, sortOrder);
    if (deleteMemo) await wl.deleteMemo(uid, req.params.code);
    else if (memo !== undefined) await wl.setMemo(uid, req.params.code, memo);
    if (priceAlert !== undefined) await wl.setPriceAlert(uid, req.params.code, priceAlert);
    if (disclosureAlert !== undefined) await wl.setDisclosureAlert(uid, req.params.code, disclosureAlert);
    res.json({ success: true } as ApiResponse);
  } catch {
    res.status(500).json({ success: false, error: '관심종목 수정 실패' } as ApiResponse);
  }
});

// jp: 알림 조건
router.get('/alerts/conditions', async (req: AuthedRequest, res: Response) => {
  if (!requireDb(res)) return;
  try {
    const data = await alert.getConditions(req.userId!, req.query.stockCode as string | undefined);
    res.json({ success: true, data } as ApiResponse);
  } catch {
    res.status(500).json({ success: false, error: '알림 조건 조회 실패' } as ApiResponse);
  }
});

router.post('/alerts/conditions', async (req: AuthedRequest, res: Response) => {
  if (!requireDb(res)) return;
  try {
    await alert.createCondition(req.userId!, req.body);
    res.json({ success: true } as ApiResponse);
  } catch {
    res.status(500).json({ success: false, error: '알림 조건 생성 실패' } as ApiResponse);
  }
});

router.delete('/alerts/conditions/:id', async (req: AuthedRequest, res: Response) => {
  if (!requireDb(res)) return;
  try {
    await alert.deleteCondition(req.userId!, req.params.id);
    res.json({ success: true } as ApiResponse);
  } catch {
    res.status(500).json({ success: false, error: '알림 조건 삭제 실패' } as ApiResponse);
  }
});

router.patch('/alerts/conditions/:id/toggle', async (req: AuthedRequest, res: Response) => {
  if (!requireDb(res)) return;
  try {
    await alert.toggleCondition(req.userId!, req.params.id);
    res.json({ success: true } as ApiResponse);
  } catch {
    res.status(500).json({ success: false, error: '알림 조건 토글 실패' } as ApiResponse);
  }
});

export default router;
