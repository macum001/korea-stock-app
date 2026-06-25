// jp: 큐 모니터링 API - /api/admin/queues
// jp: 큐 상태 조회, Worker 상태, 잡 통계

import { Router, Request, Response } from 'express';
import { getDisclosureQueueStats } from '../services/queue/disclosureQueue.service';
import { getPriceQueueStats } from '../services/queue/priceQueue.service';
import { getWorkerStatus } from '../workers/workerManager';
import { getConnectedClientsCount } from '../services/ws/wsBroadcast.service';

const router = Router();

// jp: GET /api/admin/queues - 전체 큐 상태
router.get('/', async (_req: Request, res: Response) => {
  try {
    const [disclosureStats, priceStats] = await Promise.all([
      getDisclosureQueueStats(),
      getPriceQueueStats(),
    ]);

    res.json({
      ok: true,
      data: {
        queues: {
          disclosure: disclosureStats,
          price: priceStats,
        },
        workers: getWorkerStatus(),
        websocket: {
          connectedClients: getConnectedClientsCount(),
        },
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

export default router;
