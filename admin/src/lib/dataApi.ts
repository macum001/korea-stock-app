// jp: ?대뱶誘??곗씠??議고쉶/愿由?API

import { api } from './api';

// jp: ===== 怨듭떆 =====
export interface DisclosureListItem {
  receipt_no: string; stock_code: string | null; stock_name: string | null;
  report_name: string; disclosure_type: string | null; category: string | null;
  importance: string | null; sentiment: string | null; impact_level: string | null;
  ai_status: string | null; ai_model: string | null;
  disclosed_at: string; collected_at: string | null; ai_analyzed_at: string | null;
  is_important: boolean; is_capital: boolean; is_good: boolean; is_bad: boolean;
}
export interface DisclosureListResult { items: DisclosureListItem[]; total: number; page: number; size: number; }
export interface DisclosureStats { total: number; today: number; byAiStatus: { status: string; count: number }[]; byCategory: { category: string; count: number }[]; }

// jp: ===== AI 遺꾩꽍 湲곕줉 =====
export interface AiHistoryItem {
  user_email?: string | null;
  user_nickname?: string | null;
  id: string; user_id: string; kind: string; question: string;
  receipt_no: string | null; stock_code: string | null; stock_name: string | null;
  answer: { receiptNo?: string; stockName?: string; reportName?: string; originalUrl?: string; analysis?: { summary?: string; detail?: string; reason?: string; category?: string; categoryLabel?: string; impact?: string; impactLabel?: string; risks?: string[]; }; };
  created_at: string;
}
export interface AiHistoryListResult { items: AiHistoryItem[]; total: number; page: number; size: number; }
export interface AiHistoryStats { total: number; today: number; users: number; byKind: { kind: string; count: number }[]; }
export interface AiUserAggItem {
  user_id: string;
  user_nickname: string | null;
  user_email: string | null;
  count: number;
  tokens: number;
  last_at: string;
  topStocks: { name: string; count: number }[];
}
export interface AiUserAggResult { items: AiUserAggItem[]; total: number; page: number; size: number; }

// jp: ===== 而ㅻ??덊떚 =====
export interface CommunityPost { id: string; stock_code: string; stock_name: string; user_id: string; nickname: string; content: string; like_count: number; comment_count: number; created_at: string; }
export interface CommunityPostResult { items: CommunityPost[]; total: number; page: number; size: number; }
export interface CommunityComment { id: string; post_id: string; user_id: string; nickname: string; content: string; created_at: string; }
export interface CommunityStats { posts: number; comments: number; todayPosts: number; }

// jp: ===== ?뚮┝ =====
export interface NotificationItem {
  id: string; user_id: string; type: string; stock_code: string | null;
  title: string; body: string | null; target_id: string | null; is_read: boolean; created_at: string;
}
export interface NotificationListResult { items: NotificationItem[]; total: number; page: number; size: number; }
export interface NotificationStats { total: number; today: number; unread: number; byType: { type: string; count: number }[]; }

export interface TokenStats { totalTokens: number; todayTokens: number; estimatedCostUsd: number; disclosure: { totalTokens: number; todayTokens: number; totalCount: number; todayCount: number }; briefing: { totalTokens: number; todayTokens: number; totalCount: number; todayCount: number }; stock: { totalTokens: number; todayTokens: number; totalCount: number; todayCount: number }; }

export const dataApi = {
  tokenStats(): Promise<TokenStats> { return api.get<TokenStats>('/api/admin/token-stats'); },
  // jp: 怨듭떆
  listDisclosures(params: { q?: string; category?: string; aiStatus?: string; page?: number; size?: number }): Promise<DisclosureListResult> {
    const sp = new URLSearchParams();
    if (params.q) sp.set('q', params.q);
    if (params.category) sp.set('category', params.category);
    if (params.aiStatus) sp.set('aiStatus', params.aiStatus);
    sp.set('page', String(params.page || 1)); sp.set('size', String(params.size || 20));
    return api.get<DisclosureListResult>(`/api/admin/data/disclosures?${sp.toString()}`);
  },
  getDisclosure(receiptNo: string): Promise<Record<string, unknown>> { return api.get(`/api/admin/data/disclosures/${receiptNo}`); },
  disclosureStats(): Promise<DisclosureStats> { return api.get<DisclosureStats>('/api/admin/data/disclosures-stats'); },

  // jp: AI 遺꾩꽍 湲곕줉
  listAiHistory(params: { q?: string; kind?: string; page?: number; size?: number }): Promise<AiHistoryListResult> {
    const sp = new URLSearchParams();
    if (params.q) sp.set('q', params.q);
    if (params.kind) sp.set('kind', params.kind);
    sp.set('page', String(params.page || 1)); sp.set('size', String(params.size || 20));
    return api.get<AiHistoryListResult>(`/api/admin/data/ai-history?${sp.toString()}`);
  },
  aiHistoryStats(): Promise<AiHistoryStats> { return api.get<AiHistoryStats>('/api/admin/data/ai-history-stats'); },
  listAiByUser(params: { q?: string; sort?: string; page?: number; size?: number }): Promise<AiUserAggResult> {
    const sp = new URLSearchParams();
    if (params.q) sp.set('q', params.q);
    if (params.sort) sp.set('sort', params.sort);
    sp.set('page', String(params.page || 1)); sp.set('size', String(params.size || 20));
    return api.get<AiUserAggResult>(`/api/admin/data/ai-history/by-user?${sp.toString()}`);
  },
  listAiByUserDetail(userId: string, limit = 20): Promise<{ items: AiHistoryItem[] }> {
    return api.get<{ items: AiHistoryItem[] }>(`/api/admin/data/ai-history/by-user/${userId}?limit=${limit}`);
  },

  // jp: 而ㅻ??덊떚
  listPosts(params: { q?: string; page?: number; size?: number }): Promise<CommunityPostResult> {
    const sp = new URLSearchParams();
    if (params.q) sp.set('q', params.q);
    sp.set('page', String(params.page || 1)); sp.set('size', String(params.size || 20));
    return api.get<CommunityPostResult>(`/api/admin/data/community/posts?${sp.toString()}`);
  },
  getComments(postId: string): Promise<CommunityComment[]> { return api.get<CommunityComment[]>(`/api/admin/data/community/posts/${postId}/comments`); },
  deletePost(postId: string): Promise<void> { return api.delete(`/api/admin/data/community/posts/${postId}`); },
  deleteComment(commentId: string): Promise<void> { return api.delete(`/api/admin/data/community/comments/${commentId}`); },
  communityStats(): Promise<CommunityStats> { return api.get<CommunityStats>('/api/admin/data/community-stats'); },

  // jp: ?뚮┝
  listNotifications(params: { q?: string; type?: string; page?: number; size?: number }): Promise<NotificationListResult> {
    const sp = new URLSearchParams();
    if (params.q) sp.set('q', params.q);
    if (params.type) sp.set('type', params.type);
    sp.set('page', String(params.page || 1)); sp.set('size', String(params.size || 20));
    return api.get<NotificationListResult>(`/api/admin/data/notifications?${sp.toString()}`);
  },
  deleteNotification(id: string): Promise<void> { return api.delete(`/api/admin/data/notifications/${id}`); },
  notificationStats(): Promise<NotificationStats> { return api.get<NotificationStats>('/api/admin/data/notifications-stats'); },
};
