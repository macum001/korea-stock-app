// jp: 공통 유틸리티 함수

// jp: 숫자를 한국 원화 형식으로 포맷
export function formatPrice(price: number): string {
  return price.toLocaleString('ko-KR');
}

// jp: 퍼센트 포맷 (+2.32% / -0.80%)
export function formatChangeRate(rate: number): string {
  const sign = rate > 0 ? '+' : '';
  return `${sign}${rate.toFixed(2)}%`;
}

// jp: 금액 변화 포맷 (+4,500 / -600)
export function formatChange(change: number): string {
  const sign = change > 0 ? '+' : '';
  return `${sign}${change.toLocaleString('ko-KR')}`;
}

// jp: 거래량 포맷 (1,234,567 → 123.5만)
export function formatVolume(volume: number): string {
  if (volume >= 100000000) return `${(volume / 100000000).toFixed(1)}억`;
  if (volume >= 10000) return `${(volume / 10000).toFixed(1)}만`;
  return volume.toLocaleString('ko-KR');
}

// jp: 시가총액 포맷 (144,456,000,000,000 → 144.5조)
export function formatMarketCap(cap: number): string {
  if (cap >= 1000000000000) return `${(cap / 1000000000000).toFixed(1)}조`;
  if (cap >= 100000000) return `${(cap / 100000000).toFixed(0)}억`;
  return cap.toLocaleString('ko-KR');
}

// jp: 공시 날짜 상대 시간 (30분 전, 2시간 전)
export function formatRelativeTime(isoString: string): string {
  const now = Date.now();
  const past = new Date(isoString).getTime();
  const diff = now - past;

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return '방금';
  if (minutes < 60) return `${minutes}분 전`;
  if (hours < 24) return `${hours}시간 전`;
  if (days < 7) return `${days}일 전`;
  return new Date(isoString).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}

// jp: 공시 절대 시간 - 년-월-일 시:분 (초 숨김). 예: 2026-06-17 08:31
export function formatDisclosureDateTime(isoString: string): string {
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

// jp: 공시 신선도 - 5분 이내 '속보', 30분 이내 'NEW', 그 외 null
export function getDisclosureFreshness(isoString: string): 'breaking' | 'new' | null {
  const diffMin = (Date.now() - new Date(isoString).getTime()) / 60000;
  if (diffMin < 0) return null;
  if (diffMin <= 5) return 'breaking';
  if (diffMin <= 30) return 'new';
  return null;
}

// jp: 상승/하락 색상 반환
export function getPriceColor(change: number): string {
  if (change > 0) return 'text-rise';
  if (change < 0) return 'text-fall';
  return '';
}

// jp: cn 유틸 (tailwind 클래스 조합)
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}
