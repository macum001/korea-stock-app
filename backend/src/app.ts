// jp: Express 앱 설정
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
import dailyExamplesRoutes from './routes/dailyExamples.routes'; // jp: import는 항상 상단에

// jp: 허용 origin — 개발: localhost 모든 포트 자동 허용(메인 5173 + admin 5174 등), 프로덕션: .env의 CORS_ORIGIN
// jp: 배포 시 반드시 CORS_ORIGIN=https://your-domain.com 설정할 것 (쉼표로 복수 도메인 가능)
const corsAllowList: string[] = ENV.CORS_ORIGIN
  ? ENV.CORS_ORIGIN.split(',').map((s) => s.trim())
  : [];
const corsOptions = {
  // jp: 함수형 origin — 개발 중 포트가 5173/5174/5175로 바뀌어도 자동 허용
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // jp: origin 없는 요청(서버 간 호출, curl, 헬스체크 등) 허용
    if (!origin) return callback(null, true);
    // jp: 개발 환경 - localhost / 127.0.0.1 의 모든 포트 허용
    if (ENV.NODE_ENV !== 'production' && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) {
      return callback(null, true);
    }
    // jp: 프로덕션 - .env의 CORS_ORIGIN 목록만 허용 (보안)
    if (corsAllowList.includes(origin)) return callback(null, true);
    // jp: 그 외 차단
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

// jp: 전역 throttle rate limit (악의적인 요청 차단 방어)
app.use('/api', globalLimiter);

// jp: 관리자 인증 (로그인 + AI)
app.use('/api/admin/auth', adminAuthRoutes);

// jp: AI 분석/기록 = 로그인 필수 (requireAuth) - 비로그인 401 차단
app.use('/api/ai', requireAuth, aiAnalysisRoutes);
app.use('/api/ai', requireAuth, aiDocTestRoutes);
app.use('/api/ai', requireAuth, aiHistoryRoutes);
app.use('/api/ai', dailyExamplesRoutes);

// jp: 관리자 데이터 조회/관리 - strictLimiter 빼고 (관리자 작업 우선 보장)
// jp: 조회가 주 작업이라 strict(분당5회) 적용하면 막힘. requireAdmin만 적용.
app.use('/api/admin/data',    requireAdmin, adminDataRoutes);
app.use('/api/admin/prompts', requireAdmin, requireRole('admin'), adminPromptsRoutes);  // jp: 프롬프트 편집 (admin 이상)
app.use('/api/admin/briefing', requireAdmin, adminBriefingRoutes);
app.use('/api/admin/token-stats', requireAdmin, adminTokenStatsRoutes);

// jp: Prometheus scrape endpoint
app.use(metricsRoutes);

// jp: 헬스체크
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
app.use('/api/notifications', notificationRoutes);     // jp: 알림함 (optionalAuth - 비로그인도 목록 접근)
app.use('/api/bootstrap',   bootstrapRoutes);          // jp: 첫 화면 한번에
app.use('/api/market', marketRoutes);
app.use('/api/ranking', rankingRoutes);
app.use('/api/fcm',         fcmRoutes);
app.use('/api',             healthRoutes);             // jp: /api/health
app.use('/api/stocks',      stockRoutes);
app.use('/api/stocks',      orderbookRouter);
app.use('/api/stocks',      tradesRouter);
app.use('/api/stocks',      stockDisclosureRouter);    // jp: /api/stocks/:code/disclosures
app.use('/api/disclosures', disclosureRoutes);         // jp: 중복 등록 제거
app.use('/api/capital-history', capitalHistoryRoutes);
app.use('/api/report-info', reportInfoRoutes);
app.use('/api/notes', requireAuth, notesSearchRoutes);   // jp: RAG 주석 의미 검색 (로그인 필수)
app.use('/api/news', newsRoutes);

app.use('/api/alerts',      alertRoutes);              // jp: 관심 공시 알림 조건 CRUD (requireAuth)
app.use('/api/stocks',      minuteChartRouter);
app.use('/api/watchlist',   watchlistRoutes);          // jp: 관심종목 (requireAuth = 로그인 필수)
app.use('/api/community',   communityRoutes);          // jp: 종목 커뮤니티 (로그인 필수)
app.use('/api/discovery',   discoveryRoutes);
app.use('/api/discovery',   stockFeatureRoutes);       // jp: /api/discovery/featured
app.use('/api/stocks',      stockFeatureRouter);       // jp: /api/stocks/:code/features

// jp: 관리자 API (작업) - requireAdmin + 비싼 작업 strict limit (분당 5회)
app.use('/api/admin',       requireAdmin, strictLimiter, adminDisclosureRoutes);
app.use('/api/dev',         requireAdmin, classifyTestRoutes); // jp: 분류 테스트 (관리자 전용)
app.use('/api/admin',       requireAdmin, strictLimiter, adminPriceRoutes);
app.use('/api/admin',       requireAdmin, adminHealthRouter);
app.use('/api/admin',       requireAdmin, strictLimiter, adminFeatureRouter);

app.use((_req, res) => {
  res.status(404).json({ success: false, error: '존재하지 않는 API입니다.' });
});
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[App] 에러:', err.message);
  res.status(500).json({ success: false, error: '서버 오류가 발생했습니다.' });
});

export default app;
