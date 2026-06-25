// jp: [임시] 개발용 backfill 트리거 라우트 - 인증 없음 (전종목 공시 10년치 수집)
// jp: ★ 작업 완료 후 이 파일과 app.ts 의 마운트 라인을 제거하세요.
// jp: 전종목 backfill 은 주요 종목(MAJOR_STOCK_CODES_UNIQUE)부터 채워집니다.

import { Router, Request, Response } from 'express';
import { startBackfill, getBackfillStatus } from '../services/disclosure/disclosureBackfill.service';

const router = Router();

// jp: POST /api/dev/backfill/start - 전종목 10년치 backfill 시작
router.post('/backfill/start', async (_req: Request, res: Response) => {
  const result = await startBackfill(false);
  res.json({ success: result.started, data: result });
});

// jp: POST /api/dev/backfill/resume - 중단된 backfill 이어서 (DART 한도로 멈췄을 때)
router.post('/backfill/resume', async (_req: Request, res: Response) => {
  const result = await startBackfill(true);
  res.json({ success: result.started, data: result });
});

// jp: GET /api/dev/backfill/status - 진행률 조회
router.get('/backfill/status', async (_req: Request, res: Response) => {
  const status = await getBackfillStatus();
  if (!status) {
    return res.json({ success: true, data: null, message: '아직 실행된 backfill 작업이 없어요.' });
  }
  // jp: 진행률 % 계산해서 같이 반환
  const pct = status.total_companies > 0
    ? Math.round((status.processed_companies / status.total_companies) * 1000) / 10
    : 0;
  res.json({
    success: true,
    data: {
      ...status,
      progress_percent: pct,
      progress_text: `${status.processed_companies}/${status.total_companies} 종목 (${pct}%)`,
    },
  });
});

export default router;
