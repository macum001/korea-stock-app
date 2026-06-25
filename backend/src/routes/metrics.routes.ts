// jp: Prometheus scrape endpoint

import { Router } from 'express';
import { renderPrometheusMetrics } from '../services/metrics/prometheusMetrics.service';

const router = Router();

router.get('/metrics', async (_req, res) => {
  const text = await renderPrometheusMetrics();
  res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  res.send(text);
});

export default router;
