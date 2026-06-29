// jp: ?쒕쾭 ?쒖옉??
// jp: ?댁쁺 ??븷 遺꾨━ 吏??
// jp: SERVER_ROLE=all(default) | api | realtime | worker | batch
// jp: ?좎뒪湲??댁쁺?먯꽌??api/realtime/worker瑜?蹂꾨룄 ?꾨줈?몄뒪/而⑦뀒?대꼫濡??꾩썙 ?μ븷 諛섍꼍怨?遺?섎? 遺꾨━?쒕떎.

import { createServer, Server as HttpServer } from 'http';
import app from './app';
import { ENV } from './config/env';
import { connectDB } from './config/db';
import { connectRedis } from './config/redis';
import { socketServer } from './services/realtime/socketServer.service';
import { kisWsService } from './services/kis/kisWebSocket.service';
import { startDisclosureSyncJob, stopDisclosureSyncJob } from './jobs/disclosureSync.job';
import { startTokenRefreshJob } from './jobs/tokenRefresh.job';
import { startDiscoveryPrecomputeJob, stopDiscoveryPrecomputeJob } from './jobs/discoveryPrecompute.job';
import { startStockMasterSyncJob, stopStockMasterSyncJob } from './jobs/stockMasterSync.job';
import { startMinuteCandleWarmupJob, stopMinuteCandleWarmupJob } from './jobs/minuteCandleWarmup.job';
import { startAllWorkers, stopAllWorkers } from './workers/workerManager';
import { closePubSub } from './services/pubsub/redisPubSub.service';
import { initPriceAlerts } from './services/alert/priceAlert.service';
import { initPriceAlertBridge } from './services/alert/priceAlertBridge.service';
import { startRollingCollector, stopRollingCollector } from './services/collector/rollingPriceCollector.service';
import { startMarketScannerJob, stopMarketScannerJob } from './jobs/marketScanner.job';
import { startMarketBriefingJob, stopMarketBriefingJob } from './jobs/marketBriefing.job';
import { startDisclosureImpactJob, stopDisclosureImpactJob } from './jobs/disclosureImpact.job';
import { startInvestorFlowSyncJob, stopInvestorFlowSyncJob } from './jobs/investorFlowSync.job';
import { initFcm } from './services/fcm/firebase.service';
import { startMarketSnapshotFinalizeJob, stopMarketSnapshotFinalizeJob } from './jobs/marketSnapshotFinalize.job';
import { startDailyExamplesJob, stopDailyExamplesJob } from './jobs/dailyExamples.job';
import { startNotesEmbedRetryJob, stopNotesEmbedRetryJob } from './jobs/notesEmbedRetry.job';
import { startLiveCandleEngine } from './services/chart/liveCandleEngine.service';
import { startRedisStreamRecovery, stopRedisStreamRecovery } from './services/realtime/redisStreamRecovery.service';
import { stopKisSubscriptionLockRenewal } from './services/realtime/distributedKisSubscriptionLock.service';

type Role = typeof ENV.SERVER_ROLE;

function runsHttp(role: Role): boolean {
  return role === 'all' || role === 'api' || role === 'realtime';
}

function runsRealtime(role: Role): boolean {
  return role === 'all' || role === 'realtime';
}

function runsWorkers(role: Role): boolean {
  return role === 'all' || role === 'worker' || role === 'batch';
}

async function startRealtime(server: HttpServer): Promise<void> {
  await socketServer.init(server);
  startLiveCandleEngine();
  await startRedisStreamRecovery();

  try { await kisWsService.connect(); } catch (err) {
    console.error('[KIS] WebSocket ?묒냽 ?ㅽ뙣:', err);
  }
}

async function startWorkersAndJobs(): Promise<void> {
  startAllWorkers();
  await initPriceAlerts();
  await initPriceAlertBridge();
  await startRedisStreamRecovery();

  startDisclosureSyncJob();
  startTokenRefreshJob();
  startDiscoveryPrecomputeJob();
  startStockMasterSyncJob();
  startMinuteCandleWarmupJob();
  startRollingCollector();
  initFcm();
  startMarketScannerJob();
  startMarketBriefingJob();
  startDisclosureImpactJob();
  startInvestorFlowSyncJob();
  startMarketSnapshotFinalizeJob();
  startDailyExamplesJob();
  startNotesEmbedRetryJob();   // jp: RAG 주석 임베딩 실패 자동 재처리 (10분)
}

async function bootstrap(): Promise<void> {
  await connectDB(); await connectRedis(); const role = ENV.SERVER_ROLE;
  let server: HttpServer | null = null;

  if (runsHttp(role)) {
    server = createServer(app);
    if (runsRealtime(role)) {
      await startRealtime(server);
    }

    server.listen(ENV.PORT, () => {
      console.log(`
?붴븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븮
??  JP 二쇱떇??諛깆뿏???쒕쾭 ?쒖옉            ??
??  role: ${role.padEnd(28)}??
??  http://localhost:${ENV.PORT}              ??
??  ws: ${runsRealtime(role) ? `ws://localhost:${ENV.PORT}/ws`.padEnd(28) : 'disabled'.padEnd(28)}??
??  KIS: ${ENV.KIS.REAL_MODE ? '?ㅼ쟾?ъ옄' : '紐⑥쓽?ъ옄  '}                  ??
??  ?섍꼍: ${ENV.NODE_ENV.padEnd(27)}??
?싢븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븴
      `);
    });
  }

  if (runsWorkers(role)) {
    await startWorkersAndJobs();
    if (!runsHttp(role)) {
      console.log(`[Worker] role=${role} 諛깃렇?쇱슫???묒뾽 ?꾨줈?몄뒪 ?쒖옉`);
    }
  }

  process.on('SIGTERM', async () => {
    console.log('[Server] 醫낅즺 ?쒖옉...');
    stopDisclosureSyncJob();
    stopDiscoveryPrecomputeJob();
    stopStockMasterSyncJob();
    stopMinuteCandleWarmupJob();
    stopRollingCollector();
    stopMarketScannerJob();
    stopMarketBriefingJob();
    stopDisclosureImpactJob();
    stopInvestorFlowSyncJob();
    stopMarketSnapshotFinalizeJob();
    stopDailyExamplesJob();
    stopRedisStreamRecovery();
    stopKisSubscriptionLockRenewal();
    kisWsService.disconnect();
    socketServer.shutdown();
    await stopAllWorkers();
    await closePubSub();
    if (server) server.close(() => process.exit(0));
    else process.exit(0);
  });
}

bootstrap().catch(err => {
  console.error('[Server] ?쒖옉 ?ㅽ뙣:', err);
  process.exit(1);
});




