// jp: 시장 랭킹 스캐너 스케줄러
// jp: 장중 30초마다 / 장외엔 5분마다 (마지막 데이터 유지용)

import { scanMarket } from '../services/scanner/marketScanner.service';
import { ENV } from '../config/env';

let timer: NodeJS.Timeout | null = null;

function isMarketHours(): boolean {
  const now = new Date();
  const day = now.getDay();
  if (day === 0 || day === 6) return false;
  const time = now.getHours() * 100 + now.getMinutes();
  return time >= 900 && time <= 1540;
}

export function startMarketScannerJob(): void {
  if (ENV.USE_MOCK_DATA) {
    console.log('[스캐너] USE_MOCK_DATA=true → 비활성');
    return;
  }

  let tick = 0;
  // jp: 30초마다 동작. 장중이면 매번, 장외면 10틱(5분)마다
  timer = setInterval(() => {
    tick += 1;
    if (isMarketHours() || tick % 10 === 0) {
      void scanMarket();
    }
  }, 30_000);

  // jp: 시작 시 1회
  void scanMarket();
  console.log('[스캐너] 랭킹 스캐너 시작 (장중 30초 / 장외 5분)');
}

export function stopMarketScannerJob(): void {
  if (timer) { clearInterval(timer); timer = null; }
}
