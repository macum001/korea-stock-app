// jp: ??諭띈첋??怨쀬뵠??鈺곌퀬???온??API (/api/admin/data/*)
// jp: requireAdmin ??곗쨮 癰귣똾??(app.ts?癒?퐣 ?怨몄뒠)
// jp: ?⑤벊??/ AI ?브쑴苑?疫꿸퀡以?/ ?뚣끇???딅뼒 / ???뵝

import { Router, Response } from 'express';
import { query } from '../../config/db';
import { AdminRequest } from '../../middleware/requireAdmin';
import { ApiResponse } from '../../types';
import { createNotification, createNotificationsForUsers } from '../../repositories/notification.repository';
import { getUserFcmTokens, getAllFcmTokens } from '../../repositories/fcmToken.repository';
import { sendPushToTokens } from '../../services/fcm/firebase.service';

const router = Router();

// jp: ===== ?⑤벊??筌뤴뫖以?=====
router.get('/disclosures', async (req: AdminRequest, res: Response) => {
  try {
    const q = (req.query.q as string || '').trim();
    const category = (req.query.category as string || '').trim();
    const aiStatus = (req.query.aiStatus as string || '').trim();
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const size = Math.min(100, Math.max(1, parseInt(req.query.size as string) || 20));
    const offset = (page - 1) * size;
    const where: string[] = []; const params: unknown[] = []; let i = 1;
    if (q) { where.push(`(stock_name ILIKE $${i} OR report_name ILIKE $${i} OR stock_code ILIKE $${i} OR receipt_no ILIKE $${i})`); params.push(`%${q}%`); i++; }
    if (category) { where.push(`category = $${i}`); params.push(category); i++; }
    if (aiStatus) { where.push(`ai_status = $${i}`); params.push(aiStatus); i++; }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const countRows = await query<{ cnt: string }>(`SELECT COUNT(*)::text AS cnt FROM disclosures ${whereSql}`, params);
    const total = parseInt(countRows[0]?.cnt || '0');
    const rows = await query(
      `SELECT receipt_no, stock_code, stock_name, report_name, disclosure_type, category, importance, sentiment, impact_level, ai_status, ai_model, disclosed_at, collected_at, ai_analyzed_at, is_important, is_capital, is_good, is_bad
         FROM disclosures ${whereSql} ORDER BY disclosed_at DESC LIMIT ${size} OFFSET ${offset}`, params);
    res.json({ success: true, data: { items: rows, total, page, size } } as ApiResponse);
  } catch (err) {
    console.error('[??諭띈첋? ?⑤벊??筌뤴뫖以???쎈솭:', err instanceof Error ? err.message : err);
    res.status(500).json({ success: false, error: '?⑤벊??筌뤴뫖以???븍뜄???? 筌륁궢六??곸뒄.' } as ApiResponse);
  }
});

// jp: ===== ?⑤벊???怨멸쉭 =====
router.get('/disclosures/:receiptNo', async (req: AdminRequest, res: Response) => {
  try {
    const rows = await query(`SELECT * FROM disclosures WHERE receipt_no = $1 LIMIT 1`, [req.params.receiptNo]);
    if (rows.length === 0) return res.status(404).json({ success: false, error: '?⑤벊?녺몴?筌≪뼚??????곷선??' } as ApiResponse);
    res.json({ success: true, data: rows[0] } as ApiResponse);
  } catch (err) {
    console.error('[??諭띈첋? ?⑤벊???怨멸쉭 ??쎈솭:', err instanceof Error ? err.message : err);
    res.status(500).json({ success: false, error: '?⑤벊?녺몴??븍뜄???? 筌륁궢六??곸뒄.' } as ApiResponse);
  }
});

// jp: ===== ?⑤벊??????=====
router.get('/disclosures-stats', async (_req: AdminRequest, res: Response) => {
  try {
    const totalRows = await query<{ cnt: string }>(`SELECT COUNT(*)::text AS cnt FROM disclosures`);
    const todayRows = await query<{ cnt: string }>(`SELECT COUNT(*)::text AS cnt FROM disclosures WHERE disclosed_at >= date_trunc('day', now())`);
    const aiRows = await query<{ ai_status: string; cnt: string }>(`SELECT ai_status, COUNT(*)::text AS cnt FROM disclosures GROUP BY ai_status`);
    const catRows = await query<{ category: string; cnt: string }>(`SELECT COALESCE(category, 'general') AS category, COUNT(*)::text AS cnt FROM disclosures GROUP BY category`);
    res.json({ success: true, data: { total: parseInt(totalRows[0]?.cnt || '0'), today: parseInt(todayRows[0]?.cnt || '0'), byAiStatus: aiRows.map((r) => ({ status: r.ai_status, count: parseInt(r.cnt) })), byCategory: catRows.map((r) => ({ category: r.category, count: parseInt(r.cnt) })) } } as ApiResponse);
  } catch (err) {
    console.error('[??諭띈첋? ?⑤벊????????쎈솭:', err instanceof Error ? err.message : err);
    res.status(500).json({ success: false, error: '???롧몴??븍뜄???? 筌륁궢六??곸뒄.' } as ApiResponse);
  }
});

// jp: ===== AI ?브쑴苑?疫꿸퀡以?筌뤴뫖以?=====
router.get('/ai-history', async (req: AdminRequest, res: Response) => {
  try {
    const q = (req.query.q as string || '').trim();
    const kind = (req.query.kind as string || '').trim();
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const size = Math.min(100, Math.max(1, parseInt(req.query.size as string) || 20));
    const offset = (page - 1) * size;
    const where: string[] = []; const params: unknown[] = []; let i = 1;
    if (q) { where.push(`(question ILIKE $${i} OR stock_name ILIKE $${i} OR receipt_no ILIKE $${i} OR user_id ILIKE $${i})`); params.push(`%${q}%`); i++; }
    if (kind) { where.push(`kind = $${i}`); params.push(kind); i++; }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const countRows = await query<{ cnt: string }>(`SELECT COUNT(*)::text AS cnt FROM ai_analysis_history ${whereSql}`, params);
    const total = parseInt(countRows[0]?.cnt || '0');
    const rows = await query(`SELECT h.id, h.user_id, u.email AS user_email, u.nickname AS user_nickname, h.kind, h.question, h.receipt_no, h.stock_code, h.stock_name, h.answer, h.created_at FROM ai_analysis_history h LEFT JOIN users u ON u.id = h.user_id ${whereSql} ORDER BY h.created_at DESC LIMIT ${size} OFFSET ${offset}`, params);
    res.json({ success: true, data: { items: rows, total, page, size } } as ApiResponse);
  } catch (err) {
    console.error('[??諭띈첋? AI疫꿸퀡以?筌뤴뫖以???쎈솭:', err instanceof Error ? err.message : err);
    res.status(500).json({ success: false, error: 'AI ?브쑴苑?疫꿸퀡以???븍뜄???? 筌륁궢六??곸뒄.' } as ApiResponse);
  }
});

// jp: ===== AI ?브쑴苑?疫꿸퀡以?????=====
router.get('/ai-history-stats', async (_req: AdminRequest, res: Response) => {
  try {
    const totalRows = await query<{ cnt: string }>(`SELECT COUNT(*)::text AS cnt FROM ai_analysis_history`);
    const todayRows = await query<{ cnt: string }>(`SELECT COUNT(*)::text AS cnt FROM ai_analysis_history WHERE created_at >= date_trunc('day', now())`);
    const kindRows = await query<{ kind: string; cnt: string }>(`SELECT kind, COUNT(*)::text AS cnt FROM ai_analysis_history GROUP BY kind`);
    const userRows = await query<{ cnt: string }>(`SELECT COUNT(DISTINCT user_id)::text AS cnt FROM ai_analysis_history`);
    res.json({ success: true, data: { total: parseInt(totalRows[0]?.cnt || '0'), today: parseInt(todayRows[0]?.cnt || '0'), users: parseInt(userRows[0]?.cnt || '0'), byKind: kindRows.map((r) => ({ kind: r.kind, count: parseInt(r.cnt) })) } } as ApiResponse);
  } catch (err) {
    console.error('[??諭띈첋? AI疫꿸퀡以???????쎈솭:', err instanceof Error ? err.message : err);
    res.status(500).json({ success: false, error: '???롧몴??븍뜄???? 筌륁궢六??곸뒄.' } as ApiResponse);
  }
});

// jp: ===== ?뚣끇???딅뼒 疫꼲 筌뤴뫖以?=====
router.get('/community/posts', async (req: AdminRequest, res: Response) => {
  try {
    const q = (req.query.q as string || '').trim();
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const size = Math.min(100, Math.max(1, parseInt(req.query.size as string) || 20));
    const offset = (page - 1) * size;
    const where: string[] = []; const params: unknown[] = []; let i = 1;
    if (q) { where.push(`(content ILIKE $${i} OR nickname ILIKE $${i} OR stock_code ILIKE $${i} OR user_id ILIKE $${i})`); params.push(`%${q}%`); i++; }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const countRows = await query<{ cnt: string }>(`SELECT COUNT(*)::text AS cnt FROM community_posts ${whereSql}`, params);
    const total = parseInt(countRows[0]?.cnt || '0');
    const rows = await query(`SELECT p.id, p.stock_code, COALESCE(s.name, '') AS stock_name, p.user_id, p.nickname, p.content, p.like_count, p.comment_count, p.created_at FROM community_posts p LEFT JOIN stock_master s ON s.code = p.stock_code ${whereSql} ORDER BY p.created_at DESC LIMIT ${size} OFFSET ${offset}`, params);
    res.json({ success: true, data: { items: rows, total, page, size } } as ApiResponse);
  } catch (err) {
    console.error('[??諭띈첋? ?뚣끇???딅뼒 疫꼲 筌뤴뫖以???쎈솭:', err instanceof Error ? err.message : err);
    res.status(500).json({ success: false, error: '野껊슣?녷묾????븍뜄???? 筌륁궢六??곸뒄.' } as ApiResponse);
  }
});

// jp: ===== 疫꼲???蹂? 筌뤴뫖以?=====
router.get('/community/posts/:id/comments', async (req: AdminRequest, res: Response) => {
  try {
    const rows = await query(`SELECT id, post_id, user_id, nickname, content, created_at FROM community_comments WHERE post_id = $1 ORDER BY created_at ASC`, [req.params.id]);
    res.json({ success: true, data: rows } as ApiResponse);
  } catch (err) {
    console.error('[??諭띈첋? ?蹂? 筌뤴뫖以???쎈솭:', err instanceof Error ? err.message : err);
    res.status(500).json({ success: false, error: '?蹂????븍뜄???? 筌륁궢六??곸뒄.' } as ApiResponse);
  }
});

// jp: ===== 疫꼲 ????=====
router.delete('/community/posts/:id', async (req: AdminRequest, res: Response) => {
  try {
    await query(`DELETE FROM community_posts WHERE id = $1`, [req.params.id]);
    res.json({ success: true } as ApiResponse);
  } catch (err) {
    console.error('[??諭띈첋? 疫꼲 ??????쎈솭:', err instanceof Error ? err.message : err);
    res.status(500).json({ success: false, error: '疫꼲 ???????쎈솭??됰선??' } as ApiResponse);
  }
});

// jp: ===== ?蹂? ????=====
router.delete('/community/comments/:id', async (req: AdminRequest, res: Response) => {
  try {
    const rows = await query<{ post_id: string }>(`SELECT post_id FROM community_comments WHERE id = $1`, [req.params.id]);
    await query(`DELETE FROM community_comments WHERE id = $1`, [req.params.id]);
    if (rows[0]?.post_id) await query(`UPDATE community_posts SET comment_count = GREATEST(0, comment_count - 1) WHERE id = $1`, [rows[0].post_id]);
    res.json({ success: true } as ApiResponse);
  } catch (err) {
    console.error('[??諭띈첋? ?蹂? ??????쎈솭:', err instanceof Error ? err.message : err);
    res.status(500).json({ success: false, error: '?蹂? ???????쎈솭??됰선??' } as ApiResponse);
  }
});

// jp: ===== ?뚣끇???딅뼒 ????=====
router.get('/community-stats', async (_req: AdminRequest, res: Response) => {
  try {
    const postRows = await query<{ cnt: string }>(`SELECT COUNT(*)::text AS cnt FROM community_posts`);
    const commentRows = await query<{ cnt: string }>(`SELECT COUNT(*)::text AS cnt FROM community_comments`);
    const todayRows = await query<{ cnt: string }>(`SELECT COUNT(*)::text AS cnt FROM community_posts WHERE created_at >= date_trunc('day', now())`);
    res.json({ success: true, data: { posts: parseInt(postRows[0]?.cnt || '0'), comments: parseInt(commentRows[0]?.cnt || '0'), todayPosts: parseInt(todayRows[0]?.cnt || '0') } } as ApiResponse);
  } catch (err) {
    console.error('[??諭띈첋? ?뚣끇???딅뼒 ??????쎈솭:', err instanceof Error ? err.message : err);
    res.status(500).json({ success: false, error: '???롧몴??븍뜄???? 筌륁궢六??곸뒄.' } as ApiResponse);
  }
});

// jp: ===== ???뵝 筌뤴뫖以?=====
// jp: GET /api/admin/data/notifications?q=&type=&page=&size=
router.get('/notifications', async (req: AdminRequest, res: Response) => {
  try {
    const q = (req.query.q as string || '').trim();
    const type = (req.query.type as string || '').trim();
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const size = Math.min(100, Math.max(1, parseInt(req.query.size as string) || 20));
    const offset = (page - 1) * size;
    const where: string[] = []; const params: unknown[] = []; let i = 1;
    if (q) { where.push(`(title ILIKE $${i} OR body ILIKE $${i} OR stock_code ILIKE $${i} OR user_id ILIKE $${i})`); params.push(`%${q}%`); i++; }
    if (type) { where.push(`type = $${i}`); params.push(type); i++; }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const countRows = await query<{ cnt: string }>(`SELECT COUNT(*)::text AS cnt FROM notifications ${whereSql}`, params);
    const total = parseInt(countRows[0]?.cnt || '0');
    const rows = await query(`SELECT id, user_id, type, stock_code, title, body, target_id, is_read, created_at FROM notifications ${whereSql} ORDER BY created_at DESC LIMIT ${size} OFFSET ${offset}`, params);
    res.json({ success: true, data: { items: rows, total, page, size } } as ApiResponse);
  } catch (err) {
    console.error('[??諭띈첋? ???뵝 筌뤴뫖以???쎈솭:', err instanceof Error ? err.message : err);
    res.status(500).json({ success: false, error: '???뵝???븍뜄???? 筌륁궢六??곸뒄.' } as ApiResponse);
  }
});

// jp: ===== ???뵝 ????=====
router.delete('/notifications/:id', async (req: AdminRequest, res: Response) => {
  try {
    await query(`DELETE FROM notifications WHERE id = $1`, [req.params.id]);
    res.json({ success: true } as ApiResponse);
  } catch (err) {
    console.error('[??諭띈첋? ???뵝 ??????쎈솭:', err instanceof Error ? err.message : err);
    res.status(500).json({ success: false, error: '???뵝 ???????쎈솭??됰선??' } as ApiResponse);
  }
});

// jp: ===== ???뵝 ????=====
router.get('/notifications-stats', async (_req: AdminRequest, res: Response) => {
  try {
    const totalRows = await query<{ cnt: string }>(`SELECT COUNT(*)::text AS cnt FROM notifications`);
    const todayRows = await query<{ cnt: string }>(`SELECT COUNT(*)::text AS cnt FROM notifications WHERE created_at >= date_trunc('day', now())`);
    const typeRows = await query<{ type: string; cnt: string }>(`SELECT type, COUNT(*)::text AS cnt FROM notifications GROUP BY type`);
    const unreadRows = await query<{ cnt: string }>(`SELECT COUNT(*)::text AS cnt FROM notifications WHERE is_read = false`);
    res.json({ success: true, data: { total: parseInt(totalRows[0]?.cnt || '0'), today: parseInt(todayRows[0]?.cnt || '0'), unread: parseInt(unreadRows[0]?.cnt || '0'), byType: typeRows.map((r) => ({ type: r.type, count: parseInt(r.cnt) })) } } as ApiResponse);
  } catch (err) {
    console.error('[??諭띈첋? ???뵝 ??????쎈솭:', err instanceof Error ? err.message : err);
    res.status(500).json({ success: false, error: '???롧몴??븍뜄???? 筌륁궢六??곸뒄.' } as ApiResponse);
  }
});
// jp: ===== ?????筌뤴뫖以?=====
router.get('/users', async (req: AdminRequest, res: Response) => {
  try {
    const q = (req.query.q as string || '').trim();
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const size = Math.min(100, Math.max(1, parseInt(req.query.size as string) || 20));
    const offset = (page - 1) * size;
    const where: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    if (q) {
      where.push(`(u.email ILIKE $${i} OR u.nickname ILIKE $${i})`);
      params.push(`%${q}%`);
      i++;
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const countRows = await query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM users u ${whereSql}`, params
    );
    const total = parseInt(countRows[0]?.cnt || '0');
    const rows = await query(
      `SELECT u.id, u.email, u.nickname, u.provider, u.created_at, u.last_login_at,
              COALESCE(a.cnt, 0)::int AS ai_count
         FROM users u
         LEFT JOIN (
           SELECT user_id, COUNT(*) AS cnt FROM ai_analysis_history GROUP BY user_id
         ) a ON a.user_id = u.id
         ${whereSql}
        ORDER BY u.created_at DESC
        LIMIT ${size} OFFSET ${offset}`,
      params
    );
    res.json({ success: true, data: { items: rows, total, page, size } } as ApiResponse);
  } catch (err) {
    console.error('[??諭띈첋? ?????筌뤴뫖以???쎈솭:', err instanceof Error ? err.message : err);
    res.status(500).json({ success: false, error: '?????筌뤴뫖以???븍뜄???? 筌륁궢六??곸뒄.' } as ApiResponse);
  }
});

// jp: ===== ?????????=====
router.get('/users-stats', async (_req: AdminRequest, res: Response) => {
  try {
    const totalRows = await query<{ cnt: string }>(`SELECT COUNT(*)::text AS cnt FROM users`);
    const todayRows = await query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM users WHERE created_at >= date_trunc('day', now())`
    );
    const activeRows = await query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM users WHERE last_login_at >= now() - interval '7 days'`
    );
    res.json({
      success: true,
      data: {
        total: parseInt(totalRows[0]?.cnt || '0'),
        today: parseInt(todayRows[0]?.cnt || '0'),
        active7d: parseInt(activeRows[0]?.cnt || '0'),
      },
    } as ApiResponse);
  } catch (err) {
    console.error('[??諭띈첋? ???????????쎈솭:', err instanceof Error ? err.message : err);
    res.status(500).json({ success: false, error: '???롧몴??븍뜄???? 筌륁궢六??곸뒄.' } as ApiResponse);
  }
});
router.post('/send-notification', async (req: AdminRequest, res: Response) => {

  try {

    const title = (req.body?.title as string || '').trim();

    const body = (req.body?.body as string || '').trim();

    const target = (req.body?.target as string || '').trim();   // jp: 'all' ?癒?뮉 ?諭??userId

    const userId = (req.body?.userId as string || '').trim();   // jp: target??'user'????????id

    if (!title) {

      return res.status(400).json({ success: false, error: '??뺛걠????낆젾??곻폒?紐꾩뒄.' } as ApiResponse);

    }

    if (title.length > 200) {

      return res.status(400).json({ success: false, error: '??뺛걠????댭?疫뀀챷堉?? (筌ㅼ뮆? 200??' } as ApiResponse);

    }

    // jp: DB ???뵝 ??낆젾 (type='system', ?ル굝????곸벉)

    const notiInput = {

      type: 'system' as const,

      stockCode: '',          // jp: ?⑤벊????ル굝????곸벉 (???얜챷???

      title,

      body,

    };

    if (target === 'all') {

      // jp: ?袁⑷퍥 獄쏆뮇??- 筌뤴뫀諭??????id 鈺곌퀬??
      const userRows = await query<{ id: string }>(`SELECT id FROM users`);

      const userIds = userRows.map((r) => r.id);

      // jp: DB ???뵝 (?袁⑷퍥)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any

      await createNotificationsForUsers(userIds, notiInput as any);

      // jp: FCM ?紐꾨뻻 (?袁⑷퍥 ?醫뤾쿃)

      let pushCount = 0;

      try {

        const tokens = await getAllFcmTokens();

        if (tokens.length > 0) {

          await sendPushToTokens(tokens, title, body);

          pushCount = tokens.length;

        }

      } catch (e) {

        console.warn('[??諭띈첋? ?袁⑷퍥 ?紐꾨뻻 ??쎈솭(???뵝?? ???貫留?:', e instanceof Error ? e.message : e);

      }

      return res.json({

        success: true,

        data: { sentTo: userIds.length, pushCount },

      } as ApiResponse);

    } else {

      // jp: ?諭???????1筌?
      if (!userId) {

        return res.status(400).json({ success: false, error: '????????癒? 筌왖?類λ퉸雅뚯눘苑??' } as ApiResponse);

      }

      // jp: DB ???뵝 (1筌?

      // eslint-disable-next-line @typescript-eslint/no-explicit-any

      await createNotification({ ...notiInput, userId } as any);

      // jp: FCM ?紐꾨뻻 (域???????醫뤾쿃)

      let pushCount = 0;

      try {

        const tokens = await getUserFcmTokens(userId);

        if (tokens.length > 0) {

          await sendPushToTokens(tokens, title, body);

          pushCount = tokens.length;

        }

      } catch (e) {

        console.warn('[??諭띈첋? ?紐꾨뻻 ??쎈솭(???뵝?? ???貫留?:', e instanceof Error ? e.message : e);

      }

      return res.json({

        success: true,

        data: { sentTo: 1, pushCount },

      } as ApiResponse);

    }

  } catch (err) {

    console.error('[??諭띈첋? ???뵝 獄쏆뮇????쎈솭:', err instanceof Error ? err.message : err);

    res.status(500).json({ success: false, error: '???뵝 獄쏆뮇?????쎈솭??됰선??' } as ApiResponse);

  }

});





// jp: ===== AI 遺꾩꽍 湲곕줉 - ?ъ슜?먮퀎 吏묎퀎 =====
interface AggRow { user_id: string; user_nickname: string | null; user_email: string | null; cnt: number; tokens: number; last_at: string; }
interface TopRow { user_id: string; stock_name: string; cnt: string }
router.get('/ai-history/by-user', async (req: AdminRequest, res: Response) => {
  try {
    const q = (req.query.q as string || '').trim();
    const sort = (req.query.sort as string || 'count').trim();
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const size = Math.min(100, Math.max(1, parseInt(req.query.size as string) || 20));
    const offset = (page - 1) * size;
    const where: string[] = []; const params: unknown[] = []; let i = 1;
    if (q) { where.push('(u.nickname ILIKE $' + i + ' OR u.email ILIKE $' + i + ' OR h.user_id ILIKE $' + i + ')'); params.push('%' + q + '%'); i++; }
    const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const countRows = await query<{ cnt: string }>(
      'SELECT COUNT(*)::text AS cnt FROM (SELECT h.user_id FROM ai_analysis_history h LEFT JOIN users u ON u.id = h.user_id ' + whereSql + ' GROUP BY h.user_id) t',
      params
    );
    const total = parseInt(countRows[0]?.cnt || '0');
    const orderSql = sort === 'recent' ? 'last_at DESC' : 'cnt DESC';
    const rows = await query<AggRow>(
      'SELECT h.user_id, u.nickname AS user_nickname, u.email AS user_email, COUNT(*)::int AS cnt, COALESCE(SUM(h.ai_tokens),0)::int AS tokens, MAX(h.created_at) AS last_at FROM ai_analysis_history h LEFT JOIN users u ON u.id = h.user_id ' + whereSql + ' GROUP BY h.user_id, u.nickname, u.email ORDER BY ' + orderSql + ' LIMIT ' + size + ' OFFSET ' + offset,
      params
    );
    const userIds = rows.map((r) => r.user_id);
    const topMap: Record<string, Array<{ name: string; count: number }>> = {};
    if (userIds.length > 0) {
      const topRows = await query<TopRow>(
        'SELECT user_id, COALESCE(stock_name,$2) AS stock_name, COUNT(*)::text AS cnt FROM ai_analysis_history WHERE user_id = ANY($1) GROUP BY user_id, stock_name',
        [userIds, '(醫낅ぉ?놁쓬)']
      );
      const grouped: Record<string, Array<{ name: string; count: number }>> = {};
      for (const r of topRows) { (grouped[r.user_id] = grouped[r.user_id] || []).push({ name: r.stock_name, count: parseInt(r.cnt) }); }
      for (const uid of Object.keys(grouped)) { grouped[uid].sort((a, b) => b.count - a.count); topMap[uid] = grouped[uid].slice(0, 3); }
    }
    const items = rows.map((r) => ({ user_id: r.user_id, user_nickname: r.user_nickname, user_email: r.user_email, count: r.cnt, tokens: r.tokens, last_at: r.last_at, topStocks: topMap[r.user_id] || [] }));
    res.json({ success: true, data: { items, total, page, size } } as ApiResponse);
  } catch (err) {
    console.error('[Admin] user agg fail:', err instanceof Error ? err.message : err);
    res.status(500).json({ success: false, error: '?ъ슜?먮퀎 吏묎퀎瑜?遺덈윭?ㅼ? 紐삵뻽?댁슂.' } as ApiResponse);
  }
});

router.get('/ai-history/by-user/:userId', async (req: AdminRequest, res: Response) => {
  try {
    const userId = req.params.userId;
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
    const rows = await query(
      'SELECT h.id, h.user_id, h.kind, h.question, h.receipt_no, h.stock_code, h.stock_name, h.answer, h.created_at FROM ai_analysis_history h WHERE h.user_id = $1 ORDER BY h.created_at DESC LIMIT ' + limit,
      [userId]
    );
    res.json({ success: true, data: { items: rows } } as ApiResponse);
  } catch (err) {
    console.error('[Admin] user detail fail:', err instanceof Error ? err.message : err);
    res.status(500).json({ success: false, error: '遺꾩꽍 ?댁뿭??遺덈윭?ㅼ? 紐삵뻽?댁슂.' } as ApiResponse);
  }
});

// jp: POST /api/admin/impact/recompute - 공시 가격영향 수동 재계산
router.post('/impact/recompute', async (_req: AdminRequest, res: Response) => {
  try {
    const { runImpactRecompute } = await import('../../jobs/disclosureImpact.job');
    const result = await runImpactRecompute('manual');
    res.json({ success: true, data: result } as ApiResponse);
  } catch (err) {
    console.error('[Admin] impact recompute fail:', err instanceof Error ? err.message : err);
    res.status(500).json({ success: false, error: '재계산 실패' } as ApiResponse);
  }
});
// jp: DELETE /api/admin/data/ai-cache - 공시 AI 분석 캐시 초기화 (DB의 분석 컬럼 NULL)
// jp: disclosures 테이블의 AI 분석 결과만 비움 → 다음 요청 시 새로 분석.
// jp: 주의: ai_analysis_history(사용자 분석 기록)는 건드리지 않음. 공시 캐시만 초기화.
// jp: Redis 캐시(ai:disclosure:*)는 TTL로 자동 만료되고, DB가 NULL이면 캐시 미스로 재분석되므로 DB만 비우면 충분.
router.delete('/ai-cache', async (_req: AdminRequest, res: Response) => {
  try {
    // jp: 먼저 초기화 대상 건수 확인 (이 코드베이스 query는 rows 배열 반환)
    const countRows = await query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM disclosures WHERE ai_summary IS NOT NULL`
    );
    const cleared = parseInt(countRows[0]?.cnt || '0');

    // jp: 분석 결과 컬럼만 NULL로 (공시 자체/상태/통계 컬럼은 보존)
    await query(
      `UPDATE disclosures
          SET ai_summary = NULL, ai_key_points = NULL, ai_investor_note = NULL,
              ai_risk_note = NULL, impact_level = NULL
        WHERE ai_summary IS NOT NULL`
    );

    console.log(`[Admin] AI 분석 캐시 초기화: ${cleared}건`);
    res.json({ success: true, data: { cleared } } as ApiResponse);
  } catch (err) {
    console.error('[Admin] AI 캐시 초기화 실패:', err instanceof Error ? err.message : err);
    res.status(500).json({ success: false, error: 'AI 캐시 초기화에 실패했어요.' } as ApiResponse);
  }
});

export default router;

