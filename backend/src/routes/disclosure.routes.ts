// jp: 공시 API 라우터
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import {
  getLatestDisclosures,
  getLatestDisclosuresPage,
  getImportantDisclosures,
  getDisclosuresByStockCode,
  searchDisclosures,
  getDisclosureByReceiptNo,
  syncDisclosuresByStockCode,
  getStockDisclosurePage,
} from '../services/disclosure/disclosureSync.service';
import { getMyDisclosureFeed } from '../services/disclosure/userFeed.service';
import { setDisclosureAlert, removeDisclosureAlert, setDisclosureAlertPrefs, getDisclosureAlertPrefs } from '../repositories/disclosureAlert.repository';
import { getDisclosureAi, saveDisclosureAi, findDisclosureByReceiptNo, getDisclosuresByFlag } from '../repositories/disclosure.repository';
import { analyzeDisclosure, isAiAnalysisEnabled } from '../services/disclosure/disclosureAiAnalysis.service';
import { analyzeByReceiptNo } from '../services/ai/receiptAnalysis.service';
import { getUserStatByReceiptNo, getUserStatByType } from '../services/disclosure/disclosureStatsUser.service';
import { query, isDbReady } from '../config/db';
import { requireAuth, AuthedRequest } from '../middleware/requireAuth';

const router = Router();

// jp: GET /api/disclosures - 전체 공시 목록 (프론트 기본 노출)
router.get('/', async (req: Request, res: Response) => {
  try {
    const flag = req.query.flag as string | undefined;
    const limit = Math.min(parseInt(String(req.query.limit ?? '200'), 10) || 200, 500);
    const offset = parseInt(String(req.query.offset ?? '0'), 10) || 0;
    if (flag && ['important', 'capital', 'good', 'bad'].includes(flag)) {
      const data = await getDisclosuresByFlag(flag as 'important' | 'capital' | 'good' | 'bad', limit, offset);
      return res.json({ success: true, data });
    }
    const page = await getLatestDisclosuresPage(limit, offset);
    res.json({ success: true, data: page.items, page: { limit, offset, hasMore: page.hasMore } });
  } catch {
    res.status(500).json({ success: false, error: '공시 정보를 불러오지 못했어요.' });
  }
});

// jp: GET /api/disclosures/latest - 최신 공시
router.get('/latest', async (_req: Request, res: Response) => {
  try {
    const data = await getLatestDisclosures();
    res.json({ success: true, data });
  } catch {
    res.status(500).json({ success: false, error: '공시 정보를 불러오지 못했어요.' });
  }
});

// jp: GET /api/disclosures/important - 중요 공시
router.get('/important', async (_req: Request, res: Response) => {
  try {
    const data = await getImportantDisclosures();
    res.json({ success: true, data });
  } catch {
    res.status(500).json({ success: false, error: '공시 정보를 불러오지 못했어요.' });
  }
});

// jp: GET /api/disclosures/stats - 공시 수집 현황 (모니터링용)
router.get('/stats', async (_req: Request, res: Response) => {
  if (!isDbReady()) {
    return res.status(503).json({ success: false, error: 'DB 미연결' });
  }
  try {
    const rows = await query<{
      total: string;
      last1h: string;
      last24h: string;
      last_collected: string | null;
      latest_disclosed: string | null;
      oldest_disclosed: string | null;
    }>(
      `SELECT
         COUNT(*)                                                            AS total,
         COUNT(*) FILTER (WHERE collected_at > NOW() - INTERVAL '1 hour')    AS last1h,
         COUNT(*) FILTER (WHERE collected_at > NOW() - INTERVAL '24 hours')  AS last24h,
         MAX(collected_at)                                                   AS last_collected,
         MAX(disclosed_at)                                                   AS latest_disclosed,
         MIN(disclosed_at)                                                   AS oldest_disclosed
       FROM disclosures`
    );
    const r = rows[0];

    const recent = await query<{ stock_name: string; report_name: string; collected_at: string }>(
      `SELECT stock_name, report_name, collected_at
         FROM disclosures
        ORDER BY collected_at DESC
        LIMIT 5`
    );

    res.json({
      success: true,
      data: {
        total: Number(r.total),
        recent1h: Number(r.last1h),
        recent24h: Number(r.last24h),
        lastCollectedAt: r.last_collected,
        latestDisclosedAt: r.latest_disclosed,
        oldestDisclosedAt: r.oldest_disclosed,
        recentItems: recent,
        serverNow: new Date().toISOString(),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: '현황 조회 실패: ' + (err instanceof Error ? err.message : '오류') });
  }
});

// jp: GET /api/disclosures/stats/stock/:stockCode - 특정 종목 공시 현황
router.get('/stats/stock/:stockCode', async (req: Request, res: Response) => {
  if (!isDbReady()) {
    return res.status(503).json({ success: false, error: 'DB 미연결' });
  }
  const { stockCode } = req.params;
  try {
    const rows = await query<{ cnt: string; latest: string | null }>(
      `SELECT COUNT(*) AS cnt, MAX(disclosed_at) AS latest
         FROM disclosures WHERE stock_code = $1`,
      [stockCode]
    );
    res.json({ success: true, data: { stockCode, count: Number(rows[0].cnt), latestDisclosedAt: rows[0].latest } });
  } catch {
    res.status(500).json({ success: false, error: '종목 현황 조회 실패' });
  }
});

// jp: GET /api/disclosures/feed/my - 내 관심종목 공시 피드
router.get('/feed/my', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const userId =
      ((req as unknown as { userId?: string }).userId) ||
      (req.query.userId as string) ||
      'default';
    const data = await getMyDisclosureFeed(userId);
    res.json({ success: true, data });
  } catch {
    res.status(500).json({ success: false, error: '내 공시 피드를 불러오지 못했어요.' });
  }
});

// jp: GET /api/disclosures/search?keyword= - 공시 검색
router.get('/search', async (req: Request, res: Response) => {
  const keyword = (req.query.keyword as string) || '';
  try {
    const data = await searchDisclosures(keyword);
    res.json({ success: true, data });
  } catch {
    res.status(500).json({ success: false, error: '공시 정보를 불러오지 못했어요.' });
  }
});

// jp: GET /api/disclosures/stat-by-type/:typeName - 유형명으로 통계 직접 조회
router.get('/stat-by-type/:typeName', async (req: Request, res: Response) => {
  try {
    const stat = await getUserStatByType(decodeURIComponent(req.params.typeName));
    res.json({ success: true, data: stat });
  } catch {
    res.status(500).json({ success: false, error: '통계를 불러오지 못했어요.' });
  }
});

// jp: 종목별 과거 공시 수집 진행중 추적 (중복 트리거 방지)
const stockSyncInProgress = new Set<string>();

// jp: GET /api/disclosures/stock/:stockCode?limit=&offset= - 종목별 공시 (무한스크롤 페이지네이션)
router.get('/stock/:stockCode', async (req: Request, res: Response) => {
  const { stockCode } = req.params;
  if (!/^\d{6}$/.test(stockCode)) {
    return res.status(400).json({ success: false, error: '올바른 종목 코드가 필요해요.' });
  }
  try {
    const limit = Math.min(parseInt((req.query.limit as string) || '50', 10) || 50, 200);
    const offset = Math.max(parseInt((req.query.offset as string) || '0', 10) || 0, 0);

    const page = await getStockDisclosurePage(stockCode, limit, offset);

    // jp: 첫 페이지인데 비어있으면 → 과거 공시 수집 1회 트리거 후 재조회
    if (page.total === 0 && offset === 0 && !stockSyncInProgress.has(stockCode)) {
      stockSyncInProgress.add(stockCode);
      try {
        console.log(`[공시] ${stockCode} 공시 0건, 수집 시도`);
        await syncDisclosuresByStockCode(stockCode);
        const retry = await getStockDisclosurePage(stockCode, limit, offset);
        return res.json({ success: true, data: retry.items, page: { total: retry.total, limit: retry.limit, offset: retry.offset, hasMore: retry.hasMore } });
      } finally {
        stockSyncInProgress.delete(stockCode);
      }
    }

    res.json({
      success: true,
      data: page.items,
      page: { total: page.total, limit: page.limit, offset: page.offset, hasMore: page.hasMore },
    });
  } catch {
    res.status(500).json({ success: false, error: '공시 정보를 불러오지 못했어요.' });
  }
});

// jp: POST /api/disclosures/:receiptNo/ai-summary - on-demand AI 요약
// jp: analyzeByReceiptNo가 내부에 DB 캐시 로직 보유 → DB에 분석 있으면 전체 필드 그대로 반환(토큰 0)
router.post('/:receiptNo/ai-summary', async (req: Request, res: Response) => {
  const { receiptNo } = req.params;

  if (!isAiAnalysisEnabled()) {
    return res.status(503).json({ success: false, error: 'AI 요약 기능이 비활성화되어 있어요.' });
  }

  try {
    const disclosure = await findDisclosureByReceiptNo(receiptNo);
    if (!disclosure) {
      return res.status(404).json({ success: false, error: '공시를 찾을 수 없어요.' });
    }

    const result = await analyzeByReceiptNo(receiptNo);
    if (!result) {
      return res.status(500).json({ success: false, error: 'AI 분석에 실패했어요.' });
    }
    res.json({ success: true, data: result.analysis, cached: result.cached || false });
  } catch {
    res.status(500).json({ success: false, error: 'AI 요약 생성에 실패했어요.' });
  }
});

// jp: GET /api/disclosures/:receiptNo/impact-stat - 이 공시 유형의 과거 주가반응 통계
router.get('/:receiptNo/impact-stat', async (req: Request, res: Response) => {
  try {
    const stat = await getUserStatByReceiptNo(req.params.receiptNo);
    res.json({ success: true, data: stat });
  } catch {
    res.status(500).json({ success: false, error: '통계를 불러오지 못했어요.' });
  }
});

// jp: GET /api/disclosures/:receiptNo - 공시 상세
router.get('/:receiptNo', async (req: Request, res: Response) => {
  try {
    const data = await getDisclosureByReceiptNo(req.params.receiptNo);
    if (!data) return res.status(404).json({ success: false, error: '공시를 찾을 수 없어요.' });
    res.json({ success: true, data });
  } catch {
    res.status(500).json({ success: false, error: '공시 정보를 불러오지 못했어요.' });
  }
});

export default router;

// ============================================================
// jp: 종목별 공시 라우터 (별도 export - /api/stocks 에 마운트)
// ============================================================
export const stockDisclosureRouter = Router({ mergeParams: true });

// jp: GET /api/stocks/:stockCode/disclosures
stockDisclosureRouter.get('/:stockCode/disclosures', async (req: Request, res: Response) => {
  try {
    const data = await getDisclosuresByStockCode(req.params.stockCode);
    res.json({ success: true, data });
  } catch {
    res.status(500).json({ success: false, error: '공시 정보를 불러오지 못했어요.' });
  }
});

const alertSchema = z.object({
  userId:        z.string().optional(),
  importantOnly: z.boolean().optional(),
  keywords:      z.array(z.string()).optional(),
  alertAll:       z.boolean().optional(),
  alertImportant: z.boolean().optional(),
  alertCapital:   z.boolean().optional(),
  alertGood:      z.boolean().optional(),
  alertBad:       z.boolean().optional(),
});

// jp: POST /api/stocks/:stockCode/disclosure-alert - 알림 설정
stockDisclosureRouter.post('/:stockCode/disclosure-alert', requireAuth, async (req: AuthedRequest, res: Response) => {
  const parsed = alertSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: '잘못된 요청이에요.' });
  }
  const userId = req.userId!;
  try {
    const d = parsed.data;
    const has5 = d.alertAll !== undefined || d.alertImportant !== undefined ||
                 d.alertCapital !== undefined || d.alertGood !== undefined || d.alertBad !== undefined;
    if (has5) {
      await setDisclosureAlertPrefs(userId, req.params.stockCode, {
        alertAll:       d.alertAll ?? false,
        alertImportant: d.alertImportant ?? true,
        alertCapital:   d.alertCapital ?? true,
        alertGood:      d.alertGood ?? true,
        alertBad:       d.alertBad ?? true,
      });
    } else {
      await setDisclosureAlert(userId, req.params.stockCode, d.importantOnly ?? true, d.keywords ?? []);
    }
    res.json({ success: true, message: '공시 알림을 설정했어요.' });
  } catch {
    res.status(500).json({ success: false, error: '알림 설정에 실패했어요.' });
  }
});

// jp: GET /api/stocks/:stockCode/disclosure-alert - 알림 설정 조회
stockDisclosureRouter.get('/:stockCode/disclosure-alert', requireAuth, async (req: AuthedRequest, res: Response) => {
  const userId = req.userId!;
  try {
    const prefs = await getDisclosureAlertPrefs(userId, req.params.stockCode);
    res.json({ success: true, data: prefs });
  } catch {
    res.status(500).json({ success: false, error: '알림 설정을 불러오지 못했어요.' });
  }
});

// jp: DELETE /api/stocks/:stockCode/disclosure-alert - 알림 해제
stockDisclosureRouter.delete('/:stockCode/disclosure-alert', requireAuth, async (req: AuthedRequest, res: Response) => {
  const userId = req.userId!;
  try {
    await removeDisclosureAlert(userId, req.params.stockCode);
    res.json({ success: true, message: '공시 알림을 해제했어요.' });
  } catch {
    res.status(500).json({ success: false, error: '알림 해제에 실패했어요.' });
  }
});
