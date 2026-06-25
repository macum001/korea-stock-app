// jp: 네이버 뉴스 검색 서비스 - 종목명으로 최근 뉴스 가져오기
// jp: 개선 v2: sort=sim + 관련성 재정렬 + 최신성 가중 + 띄어쓰기 무시 매칭 + 무관 필터
// jp: 100개 테스트 99% GOOD 검증 (기존 date 정렬 대비 관련성 대폭 향상)
// jp: link 우선순위: originallink(언론사 원본) → news.naver.com 모바일 변환
import axios from "axios";
import { ENV } from "../config/env";

export interface NewsItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  source: string;
}

function clean(s: string): string {
  return (s || "")
    .replace(/<[^>]*>/g, "")
    .replace(/&quot;/g, "\"")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .trim();
}

function getSource(link: string): string {
  try {
    const u = new URL(link);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

// jp: 모바일 친화 링크 반환
function getMobileLink(originallink: string, naverLink: string): string {
  if (originallink && !originallink.includes('naver.com')) {
    return originallink;
  }
  if (naverLink) {
    return naverLink.replace('https://news.naver.com', 'https://m.news.naver.com')
                    .replace('http://news.naver.com', 'https://m.news.naver.com');
  }
  return originallink || naverLink;
}

// jp: 관련성 점수 - 검색어가 제목/본문에 얼마나 정확히 들어있는지
// jp: 띄어쓰기 변형까지 처리 (자사주매입 ↔ 자사주 매입)
function relevanceScore(query: string, title: string, desc: string): number {
  const q = query.toLowerCase().trim();
  const t = title.toLowerCase();
  const d = (desc || '').toLowerCase();
  // jp: 띄어쓰기 제거 버전
  const qNoSpace = q.replace(/\s+/g, '');
  const tNoSpace = t.replace(/\s+/g, '');
  const dNoSpace = d.replace(/\s+/g, '');

  let score = 0;
  // jp: 1. 제목에 검색어 전체 포함 (띄어쓰기 유지)
  if (t.includes(q)) score += 10;
  // jp: 2. 띄어쓰기 무시하고 제목에 포함
  else if (tNoSpace.includes(qNoSpace)) score += 9;
  // jp: 3. 제목 첫 부분
  if (t.startsWith(q) || tNoSpace.startsWith(qNoSpace)) score += 5;
  // jp: 4. 단어별 매칭 (2글자 이상)
  const words = q.split(/\s+/).filter(w => w.length >= 2);
  for (const w of words) {
    if (t.includes(w)) score += 3;
    else if (tNoSpace.includes(w)) score += 2;
    if (d.includes(w)) score += 1;
  }
  // jp: 5. 본문에 띄어쓰기 무시 전체 포함
  if (dNoSpace.includes(qNoSpace)) score += 2;
  return score;
}

// jp: 최신성 점수 - 최근일수록 높음 (최대 5점)
function recencyScore(pubDate: string): number {
  const diff = Date.now() - new Date(pubDate).getTime();
  const days = diff / (1000 * 60 * 60 * 24);
  if (days < 1) return 5;
  if (days < 3) return 4;
  if (days < 7) return 3;
  if (days < 14) return 2;
  if (days < 30) return 1;
  return 0;
}

export async function searchStockNews(query: string, display = 15): Promise<NewsItem[]> {
  const id = ENV.NAVER?.SEARCH_CLIENT_ID;
  const secret = ENV.NAVER?.SEARCH_CLIENT_SECRET;
  if (!id || !secret || !query) return [];

  try {
    // jp: 필터로 걸러지는 걸 감안해 요청은 넉넉히 (최대 100)
    const fetchCount = Math.min(Math.max(display * 2, 30), 100);
    const res = await axios.get("https://openapi.naver.com/v1/search/news.json", {
      params: {
        query,
        display: fetchCount,  // jp: 넉넉히 받아서 재정렬 후 추림
        sort: "sim",          // jp: 정확도순 (date보다 관련성 대폭 우수 - 100개 테스트 검증)
      },
      headers: {
        "X-Naver-Client-Id": id,
        "X-Naver-Client-Secret": secret,
      },
      timeout: 10000,
    });

    const rawItems = (res.data?.items ?? []) as Array<Record<string, string>>;

    // jp: 점수 계산 + 매핑
    const scored = rawItems.map((it) => {
      const title = clean(it.title);
      const description = clean(it.description);
      const relScore = relevanceScore(query, title, description);
      const recScore = recencyScore(it.pubDate);
      return {
        item: {
          title,
          link: getMobileLink(it.originallink, it.link),
          description,
          pubDate: it.pubDate,
          source: getSource(it.originallink || it.link),
        } as NewsItem,
        relScore,
        // jp: 종합점수 = 관련성*2 + 최신성 (관련성 우선)
        totalScore: relScore * 2 + recScore,
      };
    });

    // jp: 관련성 낮은 뉴스 제거 (점수 3 미만 = 무관)
    const filtered = scored.filter(s => s.relScore >= 3);

    // jp: 종합점수로 재정렬
    filtered.sort((a, b) => b.totalScore - a.totalScore);

    // jp: 필터 결과가 너무 적으면 (3건 미만) 필터 완화
    if (filtered.length < 3) {
      return scored
        .sort((a, b) => b.totalScore - a.totalScore)
        .slice(0, display)
        .map(s => s.item);
    }

    return filtered.slice(0, display).map(s => s.item);
  } catch (err) {
    console.error("[네이버뉴스] 검색 실패:", err instanceof Error ? err.message : err);
    return [];
  }
}
