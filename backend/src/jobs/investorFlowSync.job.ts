// jp: 투자자별 수급 일일 수집 스케줄러
// jp: KIS 수급 API는 과거 페이지네이션이 안 되므로, 매일 받아서 DB에 누적한다.
// jp: 평일 장 마감 후 18:00, 상위 N종목을 천천히(rate limit 회피) 수집.

import cron from "node-cron";
import { getInvestorFlow } from "../services/kis/kisRest.service";
import { saveInvestorFlows } from "../repositories/investorFlow.repository";
import { MAJOR_STOCK_CODES } from "../data/majorStocks";

let task: cron.ScheduledTask | null = null;

// jp: 수집 대상 종목 수 (rate limit 고려해 상위 20개). 환경변수로 조정 가능.
function getTargetCount(): number {
  const n = parseInt(process.env.INVESTOR_FLOW_SYNC_COUNT || "20", 10);
  return Math.max(1, Math.min(n, MAJOR_STOCK_CODES.length));
}

// jp: 종목 간 간격 (ms) - KIS 초당 거래건수 보호
const GAP_MS = 1500;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// jp: 장 마감 후 확정 여부 - 18시 이후 실행이면 당일 데이터는 CONFIRMED로 간주
async function runSync(): Promise<void> {
  const codes = MAJOR_STOCK_CODES.slice(0, getTargetCount());
  console.log(`[수급수집] 시작 - 대상 ${codes.length}종목`);
  let okCount = 0;
  let totalRows = 0;

  for (const code of codes) {
    try {
      const flows = await getInvestorFlow(code, 100);
      if (flows.length > 0) {
        const saved = await saveInvestorFlows(
          flows.flatMap((f) => [
            { stockCode: code, tradeDate: f.date, investorType: "individual" as const, netBuyVolume: f.individual, netBuyValue: f.individualValue ?? 0, dataStatus: "CONFIRMED" as const },
            { stockCode: code, tradeDate: f.date, investorType: "foreigner" as const, netBuyVolume: f.foreign, netBuyValue: f.foreignValue ?? 0, dataStatus: "CONFIRMED" as const },
            { stockCode: code, tradeDate: f.date, investorType: "institution" as const, netBuyVolume: f.institution, netBuyValue: f.institutionValue ?? 0, dataStatus: "CONFIRMED" as const },
            { stockCode: code, tradeDate: f.date, investorType: "other_corporation" as const, netBuyVolume: f.other ?? 0, netBuyValue: f.otherValue ?? 0, dataStatus: "CONFIRMED" as const },
          ])
        );
        okCount++;
        totalRows += saved;
      }
    } catch (err) {
      console.error(`[수급수집] ${code} 실패:`, err instanceof Error ? err.message : err);
    }
    await sleep(GAP_MS);
  }

  console.log(`[수급수집] 완료 - 성공 ${okCount}/${codes.length}종목, ${totalRows}행 저장(누적)`);
}

export function startInvestorFlowSyncJob(): void {
  // jp: 평일(월~금) 18:00 실행
  task = cron.schedule("0 18 * * 1-5", () => { void runSync(); });
  console.log("[수급수집] 스케줄러 시작 (평일 18:00)");

  // jp: 시작 시 1회 즉시 실행 - 지금 바로 데이터 채우기
  void runSync();
}

export function stopInvestorFlowSyncJob(): void {
  if (task) {
    task.stop();
    task = null;
    console.log("[수급수집] 스케줄러 중지");
  }
}
