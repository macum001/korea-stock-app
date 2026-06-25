// jp: KIS 토큰 자동 갱신 스케줄러 - 매일 새벽 1시에 갱신

import cron from 'node-cron';
import { refreshKisToken } from '../services/kis/kisAuth.service';
import { ENV } from '../config/env';

export function startTokenRefreshJob(): void {
  if (!ENV.KIS.APP_KEY || ENV.KIS.APP_KEY === 'your_app_key_here') return;

  // jp: 매일 새벽 1시에 토큰 갱신
  cron.schedule('0 1 * * *', async () => {
    console.log('[Job] KIS 토큰 갱신 시작');
    await refreshKisToken();
  });

  console.log('[Job] 토큰 갱신 스케줄러 시작');
}
