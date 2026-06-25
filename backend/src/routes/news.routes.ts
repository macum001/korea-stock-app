// jp: 네이버 뉴스 라우트 - GET /api/news/:query
// jp: display 50개
import { Router, Request, Response } from "express";
import { searchStockNews } from "../services/naverNews.service";

const router = Router();

router.get("/:query", async (req: Request, res: Response) => {
  const query = decodeURIComponent(req.params.query || "").trim();
  if (!query) {
    return res.status(400).json({ success: false, error: "검색어가 필요합니다." });
  }
  try {
    const items = await searchStockNews(query, 50);
    return res.json({ success: true, data: { items } });
  } catch (err) {
    console.error("[뉴스 라우트] 오류:", err instanceof Error ? err.message : err);
    return res.status(500).json({ success: false, error: "뉴스를 불러오지 못했습니다." });
  }
});

export default router;
