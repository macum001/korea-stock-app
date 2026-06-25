// jp: 커뮤니티 서비스 - 종목별 게시판 API 연결

import { apiClient } from './apiClient';

export interface CommunityPost {
  id: string;
  stockCode: string;
  userId: string;
  nickname: string;
  content: string;
  likeCount: number;
  commentCount: number;
  createdAt: string;
  updatedAt: string;
  likedByMe: boolean;
}

export interface CommunityComment {
  id: string;
  postId: string;
  userId: string;
  nickname: string;
  content: string;
  createdAt: string;
}

// jp: 게시글 목록 (페이징)
export async function getPosts(stockCode: string, limit = 20, offset = 0): Promise<CommunityPost[]> {
  return apiClient.get<CommunityPost[]>(`/api/community/stock/${stockCode}/posts?limit=${limit}&offset=${offset}`);
}

// jp: 게시글 작성
export async function createPost(stockCode: string, content: string): Promise<CommunityPost> {
  return apiClient.post<CommunityPost>(`/api/community/stock/${stockCode}/posts`, { content });
}

// jp: 게시글 수정
export async function updatePost(id: string, content: string): Promise<CommunityPost> {
  return apiClient.patch<CommunityPost>(`/api/community/posts/${id}`, { content });
}

// jp: 게시글 삭제
export async function deletePost(id: string): Promise<{ deleted: boolean }> {
  return apiClient.delete<{ deleted: boolean }>(`/api/community/posts/${id}`);
}

// jp: 좋아요 토글
export async function toggleLike(id: string): Promise<{ liked: boolean; likeCount: number }> {
  return apiClient.post<{ liked: boolean; likeCount: number }>(`/api/community/posts/${id}/like`, {});
}

// jp: 댓글 목록
export async function getComments(postId: string): Promise<CommunityComment[]> {
  return apiClient.get<CommunityComment[]>(`/api/community/posts/${postId}/comments`);
}

// jp: 댓글 작성
export async function createComment(postId: string, content: string): Promise<CommunityComment> {
  return apiClient.post<CommunityComment>(`/api/community/posts/${postId}/comments`, { content });
}

// jp: 댓글 삭제
export async function deleteComment(id: string): Promise<{ deleted: boolean }> {
  return apiClient.delete<{ deleted: boolean }>(`/api/community/comments/${id}`);
}

// jp: 상대 시간 포맷 (방금/N분 전/N시간 전/N일 전)
export function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return '방금';
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}일 전`;
  return new Date(iso).toLocaleDateString('ko-KR');
}
