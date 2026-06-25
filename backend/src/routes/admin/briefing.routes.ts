// jp: 관리자 시황 브리핑 API (/api/admin/briefing/*)
// jp: requireAdmin으로 보호 (app.ts에서 적용)
// jp: 브리핑 기록 목록 / 상세 / 통계

import { Router, Response } from 'express';
import { query } from '../../config/db';
import { AdminRequest } from '../../middleware/requireAdmin';
import { ApiResponse } from '../../types';
import { computeAllStats, getStatVisibility, setStatVisibility, getStatDetail } from '../../services/briefing/briefingStats.service';
import { computePendingImpacts } from '../../services/disclosure/disclosureImpact.service';
import { getDisclosureStats, getDisclosureStatDetail, setStatVisibility as setDisclosureStatVisibility } from '../../services/disclosure/disclosureStats.service';
import { runImpactRecompute } from '../../jobs/disclosureImpact.job';

const router = Router();

// jp: GET /api/admin/briefing/list - 브리핑 기록 목록 (페이지네이션)
router.get('/list', async (req: AdminRequest, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const size = Math.min(100, Math.max(1, parseInt(req.query.size as string) || 20));
    const offset = (page - 1) * size;
    const status = (req.query.status as string || '').trim();

    const where: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    if (status) { where.push(`status = $${i}`); params.push(status); i++; }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const countRows = await query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM market_briefings ${whereSql}`, params
    );
    const total = parseInt(countRows[0]?.cnt || '0');

    // jp: raw_data는 목록에선 제외 (무거움), 요약 정보만
    const rows = await query(
      `SELECT id, date::text AS date, slot, status, summary, ai_model, ai_tokens,
              error_message, collected_at, analyzed_at, created_at,
              (analysis->>'status') AS analysis_status,
              (analysis->>'is_important')::boolean AS is_important,
              (raw_data->>'fetchedCount')::int AS fetched_count
         FROM market_briefings ${whereSql}
         ORDER BY date DESC, slot DESC
         LIMIT ${size} OFFSET ${offset}`, params
    );

    res.json({ success: true, data: { items: rows, total, page, size } } as ApiResponse);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg } as ApiResponse);
  }
});

// jp: GET /api/admin/briefing/:id - 단일 브리핑 상세 (raw_data + analysis 전체)
router.get('/detail/:id', async (req: AdminRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, error: 'id가 올바르지 않아요' } as ApiResponse);
    }
    const rows = await query(
      `SELECT *, date::text AS date FROM market_briefings WHERE id = $1 LIMIT 1`, [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: '브리핑이 없어요' } as ApiResponse);
    }
    res.json({ success: true, data: rows[0] } as ApiResponse);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg } as ApiResponse);
  }
});

// jp: GET /api/admin/briefing/stats - 통계
router.get('/stats', async (_req: AdminRequest, res: Response) => {
  try {
    // jp: 전체/오늘/완료/실패 카운트
    const totalRows = await query<{ cnt: string }>(`SELECT COUNT(*)::text AS cnt FROM market_briefings`);
    const total = parseInt(totalRows[0]?.cnt || '0');

    const todayRows = await query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM market_briefings WHERE date = CURRENT_DATE`
    );
    const today = parseInt(todayRows[0]?.cnt || '0');

    const statusRows = await query<{ status: string; cnt: string }>(
      `SELECT status, COUNT(*)::text AS cnt FROM market_briefings GROUP BY status`
    );
    const byStatus = statusRows.map(r => ({ status: r.status, count: parseInt(r.cnt) }));

    // jp: 시장 상태(좋음/보통/나쁨) 분포 (완료된 것만)
    const marketRows = await query<{ st: string; cnt: string }>(
      `SELECT (analysis->>'status') AS st, COUNT(*)::text AS cnt
         FROM market_briefings
         WHERE status = 'completed' AND analysis IS NOT NULL
         GROUP BY (analysis->>'status')`
    );
    const byMarketStatus = marketRows
      .filter(r => r.st)
      .map(r => ({ status: r.st, count: parseInt(r.cnt) }));

    // jp: 총 토큰 사용량
    const tokenRows = await query<{ sum: string }>(
      `SELECT COALESCE(SUM(ai_tokens), 0)::text AS sum FROM market_briefings`
    );
    const totalTokens = parseInt(tokenRows[0]?.sum || '0');

    res.json({
      success: true,
      data: { total, today, byStatus, byMarketStatus, totalTokens },
    } as ApiResponse);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg } as ApiResponse);
  }
});

// jp: GET /api/admin/briefing/stats-correlation - 상관 통계 + 노출 설정
router.get('/stats-correlation', async (_req: AdminRequest, res: Response) => {
  try {
    const [stats, visibility] = await Promise.all([
      computeAllStats(),
      getStatVisibility(),
    ]);
    // jp: 각 통계에 노출 여부 병합
    const merged = stats.map(s => ({ ...s, isVisible: visibility[s.key] ?? false }));
    res.json({ success: true, data: merged } as ApiResponse);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg } as ApiResponse);
  }
});

// jp: PATCH /api/admin/briefing/stats-visibility/:key - 노출 토글
router.patch('/stats-visibility/:key', async (req: AdminRequest, res: Response) => {
  try {
    const key = req.params.key;
    const visible = req.body?.visible === true;
    const ok = await setStatVisibility(key, visible, req.adminUsername || 'unknown');
    if (!ok) {
      return res.status(400).json({ success: false, error: '설정 변경 실패' } as ApiResponse);
    }
    res.json({ success: true } as ApiResponse);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg } as ApiResponse);
  }
});

// jp: GET /api/admin/briefing/stats-detail/:key - 통계 일자별 상세 (검증용)
router.get('/stats-detail/:key', async (req: AdminRequest, res: Response) => {
  try {
    const detail = await getStatDetail(req.params.key);
    if (!detail) {
      return res.status(404).json({ success: false, error: '해당 통계가 없어요' } as ApiResponse);
    }
    res.json({ success: true, data: detail } as ApiResponse);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg } as ApiResponse);
  }
});

// jp: [관리자] POST /api/admin/briefing/compute-impacts - 공시 주가반응 일괄 계산
router.post('/compute-impacts', async (req: AdminRequest, res: Response) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.body?.limit) || 30, 1), 100);
    const fromDate = typeof req.body?.fromDate === 'string' ? req.body.fromDate : undefined;
    const result = await computePendingImpacts(limit, fromDate);
    res.json({ success: true, data: result } as ApiResponse);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg } as ApiResponse);
  }
});

// jp: [관리자] GET /api/admin/briefing/disclosure-stats - 공시 종류별 주가반응 통계
router.get('/disclosure-stats', async (_req: AdminRequest, res: Response) => {
  try {
    const stats = await getDisclosureStats();
    res.json({ success: true, data: stats } as ApiResponse);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg } as ApiResponse);
  }
});

// jp: [관리자] GET /api/admin/briefing/disclosure-stat-detail?group=&type= - 일자별 상세
router.get('/disclosure-stat-detail', async (req: AdminRequest, res: Response) => {
  try {
    const group = String(req.query.group || 'basic');
    const type = String(req.query.type || '');
    if (!type) {
      return res.status(400).json({ success: false, error: 'type 필요' } as ApiResponse);
    }
    const detail = await getDisclosureStatDetail(group, type);
    res.json({ success: true, data: detail } as ApiResponse);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg } as ApiResponse);
  }
});

// jp: [관리자] GET /api/admin/briefing/impact-status - 자동 재계산 상태 (모니터링)
router.get('/impact-status', async (_req: AdminRequest, res: Response) => {
  try {
    // jp: 최근 실행 이력 7건
    const logs = await query<{
      ran_at: string; trigger_type: string; processed: number; completed: number;
      failed: number; total_samples: number; pending_left: number;
      success: boolean; error_message: string | null; duration_ms: number | null;
    }>(
      `SELECT ran_at::text AS ran_at, trigger_type, processed, completed, failed,
              total_samples, pending_left, success, error_message, duration_ms
         FROM impact_job_log
        ORDER BY ran_at DESC
        LIMIT 7`
    );

    res.json({ success: true, data: { logs } } as ApiResponse);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg } as ApiResponse);
  }
});

// jp: [관리자] POST /api/admin/briefing/impact-run - 지금 수동 재계산
router.post('/impact-run', async (_req: AdminRequest, res: Response) => {
  try {
    const result = await runImpactRecompute('manual');
    res.json({ success: true, data: result } as ApiResponse);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg } as ApiResponse);
  }
});

// jp: [관리자] PATCH /api/admin/briefing/disclosure-stat-visibility - 유형별 사용자 노출 토글
router.patch('/disclosure-stat-visibility', async (req: AdminRequest, res: Response) => {
  try {
    const statType = String(req.body.statType || '');
    const isVisible = Boolean(req.body.isVisible);
    if (!statType) {
      return res.status(400).json({ success: false, error: 'statType 필요' } as ApiResponse);
    }
    await setDisclosureStatVisibility(statType, isVisible, req.adminUsername || 'admin');
    res.json({ success: true, data: { statType, isVisible } } as ApiResponse);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg } as ApiResponse);
  }
});

export default router;
