// jp: 어드민 프롬프트 관리 API (/api/admin/prompts/*)
// jp: requireAdmin + requireRole('admin') 으로 보호 (app.ts에서 적용)
// jp: 프롬프트는 AI 동작에 영향을 주므로 admin 이상만 수정 가능

import { Router, Response } from 'express';
import { AdminRequest } from '../../middleware/requireAdmin';
import { ApiResponse } from '../../types';
import { listPrompts, savePrompt, resetPrompt, DEFAULT_PROMPTS } from '../../services/ai/promptStore.service';

const router = Router();

// jp: GET /api/admin/prompts - 전체 프롬프트 목록 (DB값 + 코드 기본값 병합)
router.get('/', async (_req: AdminRequest, res: Response) => {
  try {
    const prompts = await listPrompts();
    res.json({ success: true, data: prompts } as ApiResponse);
  } catch (err) {
    console.error('[어드민] 프롬프트 목록 실패:', err instanceof Error ? err.message : err);
    res.status(500).json({ success: false, error: '프롬프트를 불러오지 못했어요.' } as ApiResponse);
  }
});

// jp: PATCH /api/admin/prompts/:key - 프롬프트 저장
router.patch('/:key', async (req: AdminRequest, res: Response) => {
  try {
    const key = req.params.key;
    const content = (req.body?.content as string || '').trim();

    if (!DEFAULT_PROMPTS[key]) {
      return res.status(404).json({ success: false, error: '알 수 없는 프롬프트예요.' } as ApiResponse);
    }
    if (!content) {
      return res.status(400).json({ success: false, error: '프롬프트 내용이 비어 있어요.' } as ApiResponse);
    }
    if (content.length > 20000) {
      return res.status(400).json({ success: false, error: '프롬프트가 너무 길어요. (최대 20000자)' } as ApiResponse);
    }

    const ok = await savePrompt(key, content, req.adminUsername || 'unknown');
    if (!ok) {
      return res.status(500).json({ success: false, error: '저장에 실패했어요.' } as ApiResponse);
    }
    res.json({ success: true } as ApiResponse);
  } catch (err) {
    console.error('[어드민] 프롬프트 저장 실패:', err instanceof Error ? err.message : err);
    res.status(500).json({ success: false, error: '저장에 실패했어요.' } as ApiResponse);
  }
});

// jp: POST /api/admin/prompts/:key/reset - 기본값으로 복원
router.post('/:key/reset', async (req: AdminRequest, res: Response) => {
  try {
    const key = req.params.key;
    if (!DEFAULT_PROMPTS[key]) {
      return res.status(404).json({ success: false, error: '알 수 없는 프롬프트예요.' } as ApiResponse);
    }
    const ok = await resetPrompt(key);
    if (!ok) {
      return res.status(500).json({ success: false, error: '복원에 실패했어요.' } as ApiResponse);
    }
    res.json({ success: true, data: { content: DEFAULT_PROMPTS[key].content } } as ApiResponse);
  } catch (err) {
    console.error('[어드민] 프롬프트 복원 실패:', err instanceof Error ? err.message : err);
    res.status(500).json({ success: false, error: '복원에 실패했어요.' } as ApiResponse);
  }
});

export default router;
