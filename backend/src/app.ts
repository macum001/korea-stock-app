// jp: Express ??? 정
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { ENV } from './config/env';
import stockRoutes from './routes/stock.routes';
import disclosureRoutes, { stockDisclosureRouter } from './routes/disclosure.routes';
import adminDisclosureRoutes from './routes/adminDisclosure.routes';
import adminPriceRoutes from './routes/adminPrice.routes';
import watchlistRoutes from './routes/watchlist.routes';
import communityRoutes from './routes/community.routes';
import discoveryRoutes from './routes/discovery.routes';
import stockFeatureRoutes, { stockFeatureRouter, adminFeatureRouter } from './routes/stockFeature.routes';
import bootstrapRoutes from './routes/bootstrap.routes';
import authRoutes from './routes/auth.routes';
import naverAuthRoutes from './routes/naverAuth.routes';
import googleAuthRoutes from './routes/googleAuth.routes';
import marketRoutes from './routes/market.routes';
import healthRoutes, { adminHealthRouter } from './routes/performanceHealth.routes';
import alertRoutes from './routes/alert.routes';
import { minuteChartRouter } from './routes/minuteChart.routes';
import { orderbookRouter } from './routes/orderbook.routes';
import { tradesRouter } from './routes/trades.routes';
import { globalLimiter, strictLimiter, authLimiter } from './middleware/rateLimiter';
import { kisWsService } from './services/kis/kisWebSocket.service';
import { socketServer } from './services/realtime/socketServer.service';
import rankingRoutes from './routes/ranking.routes';
import fcmRoutes from './routes/fcm.routes';
import classifyTestRoutes from './routes/classifyTest.routes';
import notificationRoutes from './routes/notification.routes';
import aiAnalysisRoutes from './routes/aiAnalysis.routes';
import aiHistoryRoutes from './routes/aiHistory.routes';
import aiDocTestRoutes from './routes/aiDocTest.routes';
import adminAuthRoutes from './routes/admin/auth.routes';
import adminDataRoutes from './routes/admin/data.routes';
import adminPromptsRoutes from './routes/admin/prompts.routes';
import adminBriefingRoutes from './routes/admin/briefing.routes';
import adminTokenStatsRoutes from './routes/admin/tokenStats.routes';
import { requireAdmin, requireRole } from './middleware/requireAdmin';
import { requireAuth, optionalAuth } from './middleware/requireAuth';
import metricsRoutes from './routes/metrics.routes';
import devBackfillRoutes from './routes/devBackfill.routes';
import capitalHistoryRoutes from './routes/capitalHistory.routes';
import reportInfoRoutes from './routes/reportInfo.routes';
import newsRoutes from './routes/news.routes';

const app = express();
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(compression());
app.use(cors({ origin: '*', methods: ['GET','POST','DELETE','PATCH','OPTIONS'], credentials: false }));
app.options('*', cors({ origin: '*' }));
app.use(express.json({ limit: '1mb' }));

// jp: ? 역 throttle rate limit (? 아지??? 청 차단 방 ?)
app.use('/api', globalLimiter);

// jp: 관리자 ? 증 (로그?? + AI
app.use('/api/admin/auth', adminAuthRoutes);

// jp: ??AI 분석/기록 = ? 원가??? 수 (requireAuth) - 비로그인 401 차단
// jp:    ??? 용? 별 ?AI 분석 기록??철 ???분리??(default-user ?? ??????
app.use('/api/ai', requireAuth, aiAnalysisRoutes);
app.use('/api/ai', requireAuth, aiDocTestRoutes);
app.use('/api/ai', requireAuth, aiHistoryRoutes);
import dailyExamplesRoutes from './routes/dailyExamples.routes';
app.use('/api/ai', dailyExamplesRoutes);

// jp: ??? 드 ?? 이??조회/관 ?- strictLimiter 빼고 (거른 ? 업 ? 우? 보??? 에!)
// jp: 조회??? 주 ?  ? ?strict(분당5?? ? 용? 면 막힘. requireAdmin ?? 용.
app.use('/api/admin/data',    requireAdmin, adminDataRoutes);
app.use('/api/admin/prompts', requireAdmin, requireRole('admin'), adminPromptsRoutes);  // jp: ? 롬? 트 ? 집 (admin ? 상)
app.use('/api/admin/briefing', requireAdmin, adminBriefingRoutes);
app.use('/api/admin/token-stats', requireAdmin, adminTokenStatsRoutes);

// jp: Prometheus scrape endpoint
app.use(metricsRoutes);

// jp: ? 스체크
app.get('/health', (_req, res) => {
  res.json({
    status:  'ok',
    env:     ENV.NODE_ENV,
    mode:    kisWsService.getMode(),
    clients: socketServer.getClientCount(),
    time:    new Date().toISOString(),
  });
});

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/auth', authLimiter, naverAuthRoutes);   // jp: 네이버 소셜 로그인
app.use('/api/auth', authLimiter, googleAuthRoutes);  // jp: 구글 소셜 로그인
app.use('/api/notifications', notificationRoutes);     // jp: ? 림??(optionalAuth - 비로그인?   ?목록)
app.use('/api/bootstrap',   bootstrapRoutes);       // jp:  ?? 면 ??번에
app.use('/api/market', marketRoutes);
app.use('/api/ranking', rankingRoutes);
app.use('/api/fcm',         fcmRoutes);
app.use('/api',             healthRoutes);          // jp: /api/health
app.use('/api/stocks',      stockRoutes);
app.use('/api/stocks',      orderbookRouter);
app.use('/api/stocks',      tradesRouter);
app.use('/api/stocks',      stockDisclosureRouter);   // jp: /api/stocks/:code/disclosures
app.use('/api/disclosures', disclosureRoutes);
app.use('/api/disclosures', disclosureRoutes);
app.use('/api/capital-history', capitalHistoryRoutes);  // ← 이 줄 추가
app.use('/api/report-info', reportInfoRoutes);
app.use('/api/news', newsRoutes);

app.use('/api/alerts',      alertRoutes);           // jp: 가 ?공시 ? 림 조건 CRUD (alert.routes ?  ? requireAuth)
app.use('/api/stocks',      minuteChartRouter);
app.use('/api/watchlist',   watchlistRoutes);       // jp: 관? 종 ?(watchlist.routes ?  ? requireAuth = ? 원가??? 수)
app.use('/api/community',   communityRoutes);   // jp: 종목 ?커 ?? 티 (? 기??requireAuth = ? 원가??? 수)
app.use('/api/discovery',   discoveryRoutes);
app.use('/api/discovery',   stockFeatureRoutes);   // jp: /api/discovery/featured
app.use('/api/stocks',      stockFeatureRouter);    // jp: /api/stocks/:code/features

// jp: 관리자 API (? 업) - requireAdmin + 비싼 ? 업 strict limit (분당 5??
app.use('/api/admin',       requireAdmin, strictLimiter, adminDisclosureRoutes);
app.use('/api/dev',         classifyTestRoutes);
app.use('/api/dev', devBackfillRoutes);
app.use('/api/dev', devBackfillRoutes);
app.use('/api/admin', requireAdmin, strictLimiter, adminPriceRoutes);
app.use('/api/admin', requireAdmin, adminHealthRouter);
app.use('/api/admin',       requireAdmin, strictLimiter, adminFeatureRouter);  // jp: ? 계관 보호

app.use((_req, res) => {
  res.status(404).json({ success: false, error: '존재?  ? ? 는 API? 니??' });
});
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[App] ? 러:', err.message);
  res.status(500).json({ success: false, error: '? 버 ? 류가 발생? 어??' });
});

export default app;

