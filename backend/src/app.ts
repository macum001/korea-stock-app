// jp: Express ???ㅼ젙
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
import notesSearchRoutes from './routes/notesSearch.routes';
import aiHistoryRoutes from './routes/aiHistory.routes';
import aiDocTestRoutes from './routes/aiDocTest.routes';
import adminAuthRoutes from './routes/admin/auth.routes';
import adminDataRoutes from './routes/admin/data.routes';
import adminPromptsRoutes from './routes/admin/prompts.routes';
import adminBriefingRoutes from './routes/admin/briefing.routes';
import adminTokenStatsRoutes from './routes/admin/tokenStats.routes';
import { requireAdmin, requireRole } from './middleware/requireAdmin';
import { requireAuth } from './middleware/requireAuth';
import metricsRoutes from './routes/metrics.routes';
import capitalHistoryRoutes from './routes/capitalHistory.routes';
import reportInfoRoutes from './routes/reportInfo.routes';
import newsRoutes from './routes/news.routes';
import dailyExamplesRoutes from './routes/dailyExamples.routes'; // jp: import????긽 ?곷떒??
// jp: ?덉슜 origin ??媛쒕컻: localhost 紐⑤뱺 ?ы듃 ?먮룞 ?덉슜(硫붿씤 5173 + admin 5174 ??, ?꾨줈?뺤뀡: .env??CORS_ORIGIN
// jp: 諛고룷 ??諛섎뱶??CORS_ORIGIN=https://your-domain.com ?ㅼ젙??寃?(?쇳몴濡?蹂듭닔 ?꾨찓??媛??
const corsAllowList: string[] = [
  'https://korea-stock-app-virid.vercel.app',
  ...(ENV.CORS_ORIGIN ? ENV.CORS_ORIGIN.split(',').map((s) => s.trim()) : []),
];
const corsOptions = {
  // jp: ?⑥닔??origin ??媛쒕컻 以??ы듃媛 5173/5174/5175濡?諛붾뚯뼱???먮룞 ?덉슜
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // jp: origin ?녿뒗 ?붿껌(?쒕쾭 媛??몄텧, curl, ?ъ뒪泥댄겕 ?? ?덉슜
    if (!origin) return callback(null, true);
    // jp: 媛쒕컻 ?섍꼍 - localhost / 127.0.0.1 ??紐⑤뱺 ?ы듃 ?덉슜
    if (ENV.NODE_ENV !== 'production' && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) {
      return callback(null, true);
    }
    // jp: ?꾨줈?뺤뀡 - .env??CORS_ORIGIN 紐⑸줉留??덉슜 (蹂댁븞)
    if (corsAllowList.includes(origin)) return callback(null, true);
    // jp: 洹???李⑤떒
    return callback(null, false);
  },
  methods: ['GET', 'POST', 'DELETE', 'PATCH', 'OPTIONS'],
  credentials: false,
};

const app = express();
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(compression());
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json({ limit: '1mb' }));

// jp: ?꾩뿭 throttle rate limit (?낆쓽?곸씤 ?붿껌 李⑤떒 諛⑹뼱)
app.use('/api', globalLimiter);

// jp: 愿由ъ옄 ?몄쬆 (濡쒓렇??+ AI)
app.use('/api/admin/auth', adminAuthRoutes);

// jp: AI 遺꾩꽍/湲곕줉 = 濡쒓렇???꾩닔 (requireAuth) - 鍮꾨줈洹몄씤 401 李⑤떒
app.use('/api/ai', requireAuth, aiAnalysisRoutes);
app.use('/api/ai', requireAuth, aiDocTestRoutes);
app.use('/api/ai', requireAuth, aiHistoryRoutes);
app.use('/api/ai', dailyExamplesRoutes);

// jp: 愿由ъ옄 ?곗씠??議고쉶/愿由?- strictLimiter 鍮쇨퀬 (愿由ъ옄 ?묒뾽 ?곗꽑 蹂댁옣)
// jp: 議고쉶媛 二??묒뾽?대씪 strict(遺꾨떦5?? ?곸슜?섎㈃ 留됲옒. requireAdmin留??곸슜.
app.use('/api/admin/data',    requireAdmin, adminDataRoutes);
app.use('/api/admin/prompts', requireAdmin, requireRole('admin'), adminPromptsRoutes);  // jp: ?꾨＼?꾪듃 ?몄쭛 (admin ?댁긽)
app.use('/api/admin/briefing', requireAdmin, adminBriefingRoutes);
app.use('/api/admin/token-stats', requireAdmin, adminTokenStatsRoutes);

// jp: Prometheus scrape endpoint
app.use(metricsRoutes);

// jp: ?ъ뒪泥댄겕
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
app.use('/api/auth', authLimiter, naverAuthRoutes);   // jp: ?ㅼ씠踰??뚯뀥 濡쒓렇??app.use('/api/auth', authLimiter, googleAuthRoutes);  // jp: 援ш? ?뚯뀥 濡쒓렇??app.use('/api/notifications', notificationRoutes);     // jp: ?뚮┝??(optionalAuth - 鍮꾨줈洹몄씤??紐⑸줉 ?묎렐)
app.use('/api/bootstrap',   bootstrapRoutes);          // jp: 泥??붾㈃ ?쒕쾲??app.use('/api/market', marketRoutes);
app.use('/api/ranking', rankingRoutes);
app.use('/api/fcm',         fcmRoutes);
app.use('/api',             healthRoutes);             // jp: /api/health
app.use('/api/stocks',      stockRoutes);
app.use('/api/stocks',      orderbookRouter);
app.use('/api/stocks',      tradesRouter);
app.use('/api/stocks',      stockDisclosureRouter);    // jp: /api/stocks/:code/disclosures
app.use('/api/disclosures', disclosureRoutes);         // jp: 以묐났 ?깅줉 ?쒓굅
app.use('/api/capital-history', capitalHistoryRoutes);
app.use('/api/report-info', reportInfoRoutes);
app.use('/api/notes', requireAuth, notesSearchRoutes);   // jp: RAG 二쇱꽍 ?섎? 寃??(濡쒓렇???꾩닔)
app.use('/api/news', newsRoutes);

app.use('/api/alerts',      alertRoutes);              // jp: 愿??怨듭떆 ?뚮┝ 議곌굔 CRUD (requireAuth)
app.use('/api/stocks',      minuteChartRouter);
app.use('/api/watchlist',   watchlistRoutes);          // jp: 愿?ъ쥌紐?(requireAuth = 濡쒓렇???꾩닔)
app.use('/api/community',   communityRoutes);          // jp: 醫낅ぉ 而ㅻ??덊떚 (濡쒓렇???꾩닔)
app.use('/api/discovery',   discoveryRoutes);
app.use('/api/discovery',   stockFeatureRoutes);       // jp: /api/discovery/featured
app.use('/api/stocks',      stockFeatureRouter);       // jp: /api/stocks/:code/features

// jp: 愿由ъ옄 API (?묒뾽) - requireAdmin + 鍮꾩떬 ?묒뾽 strict limit (遺꾨떦 5??
app.use('/api/admin',       requireAdmin, strictLimiter, adminDisclosureRoutes);
app.use('/api/dev',         requireAdmin, classifyTestRoutes); // jp: 遺꾨쪟 ?뚯뒪??(愿由ъ옄 ?꾩슜)
app.use('/api/admin',       requireAdmin, strictLimiter, adminPriceRoutes);
app.use('/api/admin',       requireAdmin, adminHealthRouter);
app.use('/api/admin',       requireAdmin, strictLimiter, adminFeatureRouter);

app.use((_req, res) => {
  res.status(404).json({ success: false, error: '議댁옱?섏? ?딅뒗 API?낅땲??' });
});
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[App] ?먮윭:', err.message);
  res.status(500).json({ success: false, error: '?쒕쾭 ?ㅻ쪟媛 諛쒖깮?덉뒿?덈떎.' });
});

export default app;
