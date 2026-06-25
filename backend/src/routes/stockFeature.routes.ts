// jp: 종목 특징 점수 API 라우트

import { Router, Request, Response } from 'express';
import { ApiResponse } from '../types';
import { ENV } from '../config/env';
import { safeGet } from '../config/redis';
import { DISCOVERY_KEYS } from '../services/discovery/discoverySummary.service';
import {
  computeAllFeatures, computeFeatureForStock, groupBySections,
} from '../services/stockFeature/featuredSection.service';

const router = Router();

// jp: GET /api/discovery/featured - 장중 특징주 (섹션별)
// jp: ?section=quality_momentum 등으로 특정 섹션만
router.get('/featured', async (req: Request, res: Response) => {
  // jp: mock 모드면 프론트가 fallback
  if (ENV.USE_MOCK_DATA) {
    return res.status(503).json({ success: false, error: 'mock 모드' } as ApiResponse);
  }
  const sectionId = req.query.section as string | undefined;
  try {
    // jp: 1순위 - precompute가 저장한 Redis 캐시 (안정적, 매번 재계산 안 함)
    // jp: 이게 화면 깜빡임/구조 변경의 핵심 수정: 가격 일시 실패해도 마지막 정상 데이터 유지
    const cached = await safeGet(DISCOVERY_KEYS.featured);
    if (cached) {
      let sections = JSON.parse(cached);
      if (Array.isArray(sections) && sections.length > 0) {
        if (sectionId) sections = sections.filter((s: { id: string }) => s.id === sectionId);
        return res.json({ success: true, data: sections } as ApiResponse);
      }
    }

    // jp: 2순위 - 캐시 없으면 실시간 계산 (최초 1회 등)
    const all = await computeAllFeatures('intraday');
    if (all.length === 0) {
      // jp: 계산도 실패 → 빈 배열 반환(503 아님). 프론트가 마지막 데이터 유지하게
      return res.json({ success: true, data: [] } as ApiResponse);
    }
    let sections = groupBySections(all);
    if (sectionId) sections = sections.filter(s => s.id === sectionId);
    res.json({ success: true, data: sections } as ApiResponse);
  } catch {
    // jp: 오류도 빈 배열 (프론트 캐시 유지)
    res.json({ success: true, data: [] } as ApiResponse);
  }
});

export default router;

// jp: POST /api/admin/stock-features/recalculate - 전체 점수 재계산 (캐시 무효화용)
// jp: 현재는 실시간 계산이라 별도 캐시 없음. 향후 배치 계산 시 사용
export const adminFeatureRouter = Router();
adminFeatureRouter.post('/stock-features/recalculate', async (_req: Request, res: Response) => {
  try {
    const all = await computeAllFeatures('intraday');
    res.json({ success: true, data: { recalculated: all.length } } as ApiResponse);
  } catch {
    res.status(500).json({ success: false, error: '재계산 실패' } as ApiResponse);
  }
});

// jp: 종목 상세 특징 라우터 (/api/stocks/:code/features 로 마운트)
export const stockFeatureRouter = Router();

stockFeatureRouter.get('/:code/features', async (req: Request, res: Response) => {
  if (ENV.USE_MOCK_DATA) {
    return res.status(503).json({ success: false, error: 'mock 모드' } as ApiResponse);
  }
  try {
    const result = await computeFeatureForStock(req.params.code);
    if (!result) {
      return res.status(503).json({ success: false, error: '데이터 준비 중' } as ApiResponse);
    }
    res.json({ success: true, data: result } as ApiResponse);
  } catch {
    res.status(500).json({ success: false, error: '종목 특징 조회 실패' } as ApiResponse);
  }
});
