require("dotenv").config();
require("ts-node/register");
(async () => {
  const { getStockDisclosurePage } = require("./src/services/disclosure/disclosureSync.service.ts");
  let offset = 0, total = 0, page = 0;
  while (true) {
    const r = await getStockDisclosurePage("006660", 50, offset);
    page++;
    total += r.items.length;
    console.log(`P${page}: +${r.items.length}건 (누적${total}) hasMore=${r.hasMore} 오래된것=${r.items[r.items.length-1]?.disclosedAt?.slice(0,10)}`);
    if (!r.hasMore || r.items.length === 0) break;
    offset += r.items.length;
    if (page > 20) break;
  }
  console.log("=> 총", total, "건 (DB엔 283건)");
  process.exit(0);
})().catch(e => { console.error("ERROR:", e.message); process.exit(1); });
