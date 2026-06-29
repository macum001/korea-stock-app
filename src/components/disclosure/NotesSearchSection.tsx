// jp: 주석 내용 검색 섹션 - 공시 분석 시트 내. 표준 응답 계약 기반 안전 렌더링
// jp: 핵심: 단일 results 배열(kind='prose'|'table')만 받아서 ErrorBoundary로 보호
// jp:   - result.kind === 'table' → tableMarkdown ?? chunkText 만 렌더
// jp:   - 깨진 item은 isValidNotesResult로 사전 필터
// jp:   - 카드 1개가 터져도 그 카드만 fallback, 전체 섹션 생존

import React, { useState } from 'react';
import { Search, Table, SearchX, ExternalLink, Coins, ArrowLeftRight, Package, ScrollText, Gift, Sparkles, FileText, MessageSquareText } from 'lucide-react';
import {
  searchNotes,
  isValidNotesResult,
  type NotesSearchResult,
} from '@/services/notesSearchService';

// jp: 주석 본문을 금융감독원 사업보고서 레이아웃으로 정렬 (내용은 한 글자도 안 바꿈)
// jp: 번호 체계를 인식해 행 단위로 분리 + 들여쓰기 레벨 부여:
// jp:   레벨0: 5. / 6. (대항목)        들여쓰기 0
// jp:   레벨1: (1) (2) (3) (중항목)     들여쓰기 1
// jp:   레벨2: 1) 2) (소항목)           들여쓰기 1.5
// jp:   레벨3: (*1) (*2) (각주)         들여쓰기 2
// jp: marker(번호)와 body(본문)를 분리해 번호를 왼쪽에 정렬(매달린 들여쓰기)
interface NoteLine { marker: string; body: string; level: number; }

function splitIntoNoteLines(text: string): NoteLine[] {
  if (!text || typeof text !== 'string') return [];
  let s = text.trim();
  if (!s) return [];

  // jp: 줄바꿈은 공백으로 정규화 (번호 기준으로 다시 나눌 것이므로)
  s = s.replace(/\s*\n\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();

  // jp: 각 번호 마커 앞에서 분리 (마커는 보존). 소수점(2.5)은 영향 없음(뒤에 ) 필요)
  // jp: 순서 중요: (*1) → (1) → 1) → 5. 순으로 우선 매칭되도록 분리 정규식 구성
  // jp: 분리 지점: " (*1)" / " (1)" / " 1)" / 문장 시작 "5. "
  const parts = s.split(/(?=\(\*\d+\))|(?=\(\d+\))|(?<=[.\s])(?=\d+\)\s)|(?<=\s)(?=\d+\.\s+[가-힣])/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length <= 1) {
    // jp: 번호 구조가 없으면 통째로 한 덩어리 (강제 분리 안 함)
    return [{ marker: '', body: s, level: 0 }];
  }

  return parts.map((p) => {
    let m: RegExpMatchArray | null;
    // jp: (*1) 각주
    if ((m = p.match(/^(\(\*\d+\))\s*(.*)$/s))) {
      return { marker: m[1], body: m[2].trim(), level: 3 };
    }
    // jp: (1) (2) 중항목
    if ((m = p.match(/^(\(\d+\))\s*(.*)$/s))) {
      return { marker: m[1], body: m[2].trim(), level: 1 };
    }
    // jp: 1) 2) 소항목
    if ((m = p.match(/^(\d+\))\s*(.*)$/s))) {
      return { marker: m[1], body: m[2].trim(), level: 2 };
    }
    // jp: 5. 6. 대항목
    if ((m = p.match(/^(\d+\.)\s+(.*)$/s))) {
      return { marker: m[1], body: m[2].trim(), level: 0 };
    }
    // jp: 마커 없는 일반 문단
    return { marker: '', body: p, level: 0 };
  });
}

// jp: 차분한 로즈톤
const C = {
  accent: '#8b5cf6', accentText: '#a78bfa', accentBtn: '#8b5cf6',
  bg: '#000000', border: 'rgba(139,92,246,0.45)', inputBg: '#0b0712',
  chipBg: 'rgba(139,92,246,0.14)', tableBg: '#0b0712', tableBorder: 'rgba(139,92,246,0.30)',
};

const EXAMPLE_CHIPS: { icon: string; text: string }[] = [
  { icon: 'coin', text: '금융상품 공정가치는 얼마인가요' },
  { icon: 'exchange', text: '특수관계자와 어떤 거래를 했나요' },
  { icon: 'box', text: '재고자산은 어떻게 평가하나요' },
  { icon: 'certificate', text: '전환사채(CB)나 신주인수권부사채 내용이 있나요' },
  { icon: 'gift', text: '주식기준보상(스톡옵션) 내용이 있나요' },
];

function WaveLoading() {
  const bars = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
      {bars.map((d, i) => (
        <span key={i} style={{ width: 3, height: 8, background: C.accent, borderRadius: 2, display: 'inline-block', animation: 'notesWave 1s infinite', animationDelay: `${d}s` }} />
      ))}
      <span style={{ marginLeft: 8, fontSize: 12, color: C.accentText }}>검색 중…</span>
    </div>
  );
}

// jp: ===== ErrorBoundary — 카드 1개가 터져도 그 카드만 fallback =====
class CardErrorBoundary extends React.Component<
  { children: React.ReactNode; dartUrl?: string | null },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode; dartUrl?: string | null }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err: unknown) {
    console.warn('[NotesSearch] 결과 카드 렌더 오류 (개별 격리):', err);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-lg px-3.5 py-3" style={{ background: C.tableBg, border: `0.5px solid ${C.tableBorder}` }}>
          <p className="text-[12px]" style={{ color: 'var(--text-secondary)', margin: 0 }}>
            이 항목은 표시할 수 없어요.
          </p>
          {this.props.dartUrl && (
            <a href={this.props.dartUrl} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[12px] font-bold rounded-lg px-3 py-1.5 mt-2"
              style={{ background: C.accentBtn, color: '#fff', textDecoration: 'none' }}>
              <ExternalLink size={12} /> DART 원문 보기
            </a>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}

// jp: 마크다운 표 → 2D 배열
function parseMarkdownTable(md: string): string[][] {
  const rows: string[][] = [];
  for (const line of (md || '').split(String.fromCharCode(10))) {
    const t = line.trim();
    if (!t.startsWith('|')) continue;
    if (/^\|[\s\-|]+\|$/.test(t)) continue;
    const cells = t.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length > 0) rows.push(cells);
  }
  return rows;
}

// jp: ===== 표 카드 — tableMarkdown ?? chunkText 만 사용 =====
function TableCard({ result }: { result: NotesSearchResult }) {
  // jp: 표준 계약 — tableMarkdown 우선, 없으면 chunkText. 둘 다 없으면 안내+DART
  const md = result.tableMarkdown ?? result.chunkText ?? '';
  const rows = parseMarkdownTable(md);

  // jp: 표 파싱 실패(빈 표) → 죽이지 말고 안내 + DART 버튼
  if (rows.length === 0) {
    return (
      <div style={{ background: C.tableBg, border: `0.5px solid ${C.tableBorder}`, borderRadius: 10, padding: '12px 14px' }}>
        <div className="flex items-center gap-1.5 mb-2">
          <Table size={14} style={{ color: C.accent }} />
          <span className="text-[11px] font-medium" style={{ color: C.accentText }}>관련 표</span>
          <span className="text-[11px] ml-auto" style={{ color: 'var(--text-tertiary)' }}>{result.title}</span>
        </div>
        <p className="text-[12px]" style={{ color: 'var(--text-secondary)', margin: '0 0 8px' }}>
          표 내용은 DART 원문에서 확인해주세요.
        </p>
        {result.dartUrl && (
          <a href={result.dartUrl} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[12px] font-bold rounded-lg px-3 py-1.5"
            style={{ background: C.accentBtn, color: '#fff', textDecoration: 'none' }}>
            <ExternalLink size={12} /> 표 원문 보기
          </a>
        )}
      </div>
    );
  }

  const header = rows[0];
  const body = rows.slice(1);
  const isNum = (s: string) => /^[\(\-]?[\d,]+\.?\d*\)?$/.test((s || '').trim()) && /\d/.test(s);
  const LONG = 30;

  const tableRows: string[][] = [];
  const longNotes: { label: string; text: string }[] = [];
  for (const r of body) {
    const longCell = r.find((c) => (c || '').trim().length > LONG);
    if (longCell) {
      const label = (r[0] || '').trim();
      const text = longCell.trim();
      longNotes.push({ label: label && label !== text ? label : '', text });
    } else {
      tableRows.push(r);
    }
  }

  return (
    <div style={{ background: C.tableBg, border: `0.5px solid ${C.tableBorder}`, borderRadius: 10, padding: '12px 14px' }}>
      <div className="flex items-center gap-1.5 mb-2">
        <Table size={14} style={{ color: C.accent }} />
        <span className="text-[11px] font-medium" style={{ color: C.accentText }}>
          {result.sectionTitle ? result.sectionTitle : '관련 표'}
        </span>
        <span className="text-[11px] ml-auto" style={{ color: 'var(--text-tertiary)' }}>
          {result.title}{result.sourceYear ? ` (${result.sourceYear})` : ''}
        </span>
      </div>

      {tableRows.length > 0 && (
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 12, minWidth: '100%' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.tableBorder}` }}>
                {header.map((h, i) => (
                  <td key={i} style={{ padding: '5px 10px', color: C.accentText, fontWeight: 600, textAlign: isNum(h) ? 'right' : 'left', whiteSpace: 'nowrap' }}>{h}</td>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.map((r, ri) => (
                <tr key={ri} style={{ borderBottom: '0.5px solid rgba(139,92,246,0.15)' }}>
                  {r.map((c, ci) => (
                    <td key={ci} style={{ padding: '5px 10px', color: '#d8d8da', textAlign: isNum(c) ? 'right' : 'left', whiteSpace: 'nowrap' }}>{c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {longNotes.length > 0 && (
        <div style={{ marginTop: tableRows.length > 0 ? 12 : 0, paddingTop: tableRows.length > 0 ? 10 : 0, borderTop: tableRows.length > 0 ? `0.5px solid ${C.tableBorder}` : 'none' }}>
          <p className="text-[10px]" style={{ color: C.accentText, margin: '0 0 7px' }}>자세한 설명</p>
          <div className="flex flex-col gap-2.5">
            {longNotes.map((n, ni) => (
              <p key={ni} className="text-[12px]" style={{ color: '#d8d8da', lineHeight: 1.7, margin: 0 }}>
                {n.label && <span style={{ color: C.accentText, fontWeight: 700 }}>· {n.label}<br /></span>}
                {n.text}
              </p>
            ))}
          </div>
        </div>
      )}

      {result.dartUrl && (
        <a href={result.dartUrl} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-[11px] font-bold rounded-lg px-3 py-1.5 mt-3"
          style={{ background: 'transparent', color: C.accentText, border: `0.5px solid ${C.tableBorder}`, textDecoration: 'none' }}>
          <ExternalLink size={11} /> DART 원문
        </a>
      )}
    </div>
  );
}

// jp: ===== 산문 카드 — 2줄 미리보기 + 클릭 펼침 =====
function ProseCard({ result }: { result: NotesSearchResult }) {
  const [expanded, setExpanded] = useState(false);
  const text = result.chunkText || '';

  return (
    <div className="rounded-lg px-4 py-3.5 cursor-pointer"
      style={{ background: C.tableBg, border: `0.5px solid ${expanded ? C.accent : C.tableBorder}` }}
      onClick={() => setExpanded((v) => !v)}>
      <div className="flex justify-between items-center" style={{ marginBottom: 9 }}>
        <span className="text-[12px] flex items-center gap-1.5" style={{ color: C.accentText }}>
          <FileText size={13} style={{ color: C.accentText }} />
          {result.sectionTitle ? result.sectionTitle : (result.title || '보고서')} 주석
        </span>
        <span className="text-[11px] flex items-center gap-0.5" style={{ color: 'var(--text-secondary)' }}>
          {expanded ? '접기' : '더보기'}
          <span style={{ fontSize: 11 }}>{expanded ? '▲' : '▼'}</span>
        </span>
      </div>
      {!expanded && (
        <p className="text-[13px]" style={{ color: 'var(--text-secondary)', margin: 0, lineHeight: 1.7, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {text}
        </p>
      )}
      {expanded && (
        <div className="flex flex-col" style={{ gap: 9, paddingRight: 2 }}>
          {splitIntoNoteLines(text).map((line, pi) => {
            // jp: 레벨별 왼쪽 들여쓰기 (em 단위 — 글자 크기에 비례)
            const indentEm = line.level === 0 ? 0 : line.level === 1 ? 1 : line.level === 2 ? 1.6 : 2.2;
            // jp: 마커 폭 확보 (번호를 왼쪽에 정렬, 본문은 매달린 들여쓰기)
            const markerW = line.marker
              ? (line.marker.length <= 2 ? '1.6em' : line.marker.length <= 3 ? '2.2em' : '2.8em')
              : '0';
            return (
              <div key={pi} style={{ display: 'flex', paddingLeft: `${indentEm}em` }}>
                {line.marker && (
                  <span style={{ flexShrink: 0, width: markerW, color: C.accentText, fontWeight: 600, fontSize: 13, lineHeight: 1.85, fontVariantNumeric: 'tabular-nums' }}>{line.marker}</span>
                )}
                <p style={{ flex: 1, margin: 0, color: 'var(--text-primary)', fontSize: 13.5, lineHeight: 1.85, textAlign: 'justify', textJustify: 'inter-character', wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>{line.body}</p>
              </div>
            );
          })}
          {result.dartUrl && (
            <a href={result.dartUrl} target="_blank" rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1.5 text-[12px] font-bold rounded-lg px-3.5 py-2 self-start"
              style={{ background: C.accentBtn, color: '#ffffff', textDecoration: 'none', marginTop: 6 }}>
              <ExternalLink size={13} /> DART 원문에서 보기
            </a>
          )}
        </div>
      )}
    </div>
  );
}

// jp: ===== 결과 1개 디스패처 — kind로 분기, ErrorBoundary로 감쌈 =====
function ResultItem({ result }: { result: NotesSearchResult }) {
  return (
    <CardErrorBoundary dartUrl={result.dartUrl}>
      {result.kind === 'table'
        ? <TableCard result={result} />
        : <ProseCard result={result} />}
    </CardErrorBoundary>
  );
}

interface NotesSearchSectionProps {
  stockCode?: string;
  stockName?: string;
}

export function NotesSearchSection({ stockCode, stockName }: NotesSearchSectionProps) {
  const [query, setQuery] = useState('');
  const [inputFocused, setInputFocused] = useState(false);
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(true);
  const [results, setResults] = useState<NotesSearchResult[]>([]);
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const runSearch = async (q: string) => {
    const text = (q || '').trim();
    if (!text || loading) return;
    setLoading(true);
    setSearched(true);
    setAiAnswer(null);
    setAiOpen(true);
    try {
      const res = await searchNotes(text, { stockCode, limit: 7 });
      setAiAnswer(res.aiAnswer);
      // jp: 서비스에서 이미 가드했지만 컴포넌트에서도 한 번 더 (삼중 안전망)
      setResults(res.results.filter(isValidNotesResult));
      setFallbackUrl(res.fallbackUrl);
    } catch {
      setAiAnswer(null);
      setResults([]);
      setFallbackUrl(null);
    } finally {
      setLoading(false);
    }
  };

  const onChipClick = (chip: string) => { setQuery(chip); runSearch(chip); };
  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); runSearch(query); }
  };
  const clearQuery = () => setQuery('');

  // jp: 표/산문 분리 (렌더 순서 — 표 먼저)
  const tableResults = results.filter((r) => r.kind === 'table');
  const proseResults = results.filter((r) => r.kind === 'prose');

  return (
    <div className="rounded-xl px-4 py-3.5" style={{ background: C.bg, border: `0.5px solid ${C.border}` }}>
      <style>{`@keyframes notesWave { 0%, 100% { height: 8px; } 50% { height: 24px; } }`}</style>

      <div className="flex items-center gap-2.5 mb-3 rounded-xl" style={{ background: C.chipBg, border: `1px solid ${C.border}`, padding: '10px 12px' }}>
        <span className="flex items-center justify-center flex-shrink-0" style={{ width: 30, height: 30, borderRadius: 9, background: C.chipBg, border: `0.5px solid ${C.border}` }}><Search size={17} style={{ color: C.accentText }} /></span>
        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-bold" style={{ color: C.accentText }}>주석 내용 검색</div>
          <div className="text-[10px] truncate" style={{ color: 'var(--text-secondary)' }}>
            {stockName ? stockName : ''}{stockCode ? ` ${stockCode}` : ''}{(stockName || stockCode) ? ' · ' : ''}사업보고서 주석을 AI가 분석
          </div>
        </div>
      </div>

      <div className="rounded-xl" style={{ background: C.inputBg, border: `1.5px solid ${C.border}`, padding: '10px 12px', boxShadow: `0 0 0 3px ${C.chipBg}` }}>
        {loading ? (
          <div className="flex-1" style={{ minHeight: 44 }}><WaveLoading /></div>
        ) : (
          <>
            <div className="flex items-start gap-2">
              <span style={{ flexShrink: 0, marginTop: 3 }}><Search size={15} style={{ color: '#564d6b' }} /></span>
              <textarea
                lang="ko" rows={2} value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                onFocus={() => setInputFocused(true)}
                onBlur={() => setInputFocused(false)}
                placeholder={inputFocused ? '' : '찾고 싶은 회계 항목을 입력하세요\n예: 전환사채 이연자산, 특수관계자 거래, 연구개발비'}
                className="flex-1 text-[13px] outline-none resize-none"
                style={{ border: 'none', background: 'transparent', color: 'var(--text-primary)', fontFamily: 'inherit', lineHeight: 1.6, minHeight: 44 }}
              />
            </div>
            <div className="flex items-center justify-end gap-2 mt-1.5">
              {query.length > 0 && (
                <button type="button" onClick={clearQuery} aria-label="입력 지우기" className="text-[12px]"
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-tertiary)', padding: '4px 6px', cursor: 'pointer' }}>
                  지우기
                </button>
              )}
              <button type="button" onClick={() => runSearch(query)} disabled={!query.trim()}
                className="text-[13px] font-bold rounded-lg inline-flex items-center gap-1.5"
                style={{ padding: '7px 18px', background: C.accentBtn, color: '#ffffff', border: 'none', flexShrink: 0, opacity: query.trim() ? 1 : 0.45, cursor: query.trim() ? 'pointer' : 'default' }}>
                <Search size={14} /> 검색
              </button>
            </div>
          </>
        )}
      </div>

      <div className="rounded-lg px-3.5 py-3 mt-2.5" style={{ background: C.tableBg, border: `0.5px solid ${C.tableBorder}` }}>
        <div className="flex items-start gap-2">
          <Search size={15} style={{ color: C.accentText, flexShrink: 0, marginTop: 2 }} />
          <p className="text-[13px]" style={{ color: 'var(--text-primary)', lineHeight: 1.65, margin: 0 }}>사업·분기보고서 주석에서 원하는 내용을 찾아드려요. 재무 항목, 특수관계자 거래, 전환사채 등 궁금한 단어를 넣어보세요. 관련 표와 설명을 함께 보여드려요.</p>
        </div>
      </div>

      <div className="rounded-lg px-3.5 py-3 mt-2" style={{ background: C.tableBg, border: `0.5px solid ${C.tableBorder}` }}>
        <div className="flex items-center gap-1.5" style={{ marginBottom: 10 }}>
          <Sparkles size={13} style={{ color: C.accentText }} />
          <p className="text-[11px]" style={{ color: 'var(--text-secondary)', margin: 0 }}>이런 질문을 많이 찾아요</p>
        </div>
        <div className="flex flex-col gap-1.5">
          {EXAMPLE_CHIPS.map(({ icon, text }) => {
            const Icon = icon === 'coin' ? Coins
              : icon === 'exchange' ? ArrowLeftRight
              : icon === 'box' ? Package
              : icon === 'certificate' ? ScrollText
              : Gift;
            return (
              <button key={text} type="button" onClick={() => onChipClick(text)}
                className="flex items-center gap-2.5 text-[12.5px] rounded-[10px] px-3 py-2.5 text-left"
                style={{ background: C.chipBg, color: '#cfc4e0', border: `0.5px solid ${C.tableBorder}`, width: '100%' }}>
                <Icon size={15} style={{ color: C.accentText, flexShrink: 0 }} />
                <span>{text}</span>
              </button>
            );
          })}
        </div>
      </div>

      {searched && !loading && (
        <div className="mt-3 pt-3" style={{ borderTop: `0.5px solid ${C.border}` }}>
          {results.length === 0 ? (
            <div className="rounded-lg px-3.5 py-4" style={{ background: C.tableBg, border: `0.5px solid ${C.tableBorder}` }}>
              <div className="flex items-start gap-2.5">
                <SearchX size={17} style={{ color: 'var(--text-secondary)', flexShrink: 0, marginTop: 1 }} />
                <div style={{ flex: 1 }}>
                  <p className="text-[13px] font-medium" style={{ color: 'var(--text-primary)', margin: '0 0 6px' }}>이 종목 주석에서 찾지 못했어요</p>
                  <p className="text-[12px]" style={{ color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 10px' }}>검색한 내용이 이 회사 주석에 없거나, 다른 표현으로 적혀 있을 수 있어요. 단어를 바꿔보거나 DART 원문에서 직접 찾아보세요.</p>
                  {fallbackUrl && (
                    <a href={fallbackUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[12px] font-bold rounded-lg px-3.5 py-2" style={{ background: C.accentBtn, color: '#ffffff', textDecoration: 'none' }}>
                      <ExternalLink size={13} /> DART 원문에서 보기
                    </a>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <>
              {aiAnswer && (
                <div className="rounded-xl px-4 py-3.5 mb-3 cursor-pointer"
                  style={{ background: C.bg, border: `1px solid ${aiOpen ? C.accent : C.border}` }}
                  onClick={() => setAiOpen((v) => !v)}>
                  <div className="flex items-center gap-1.5" style={{ marginBottom: 9 }}>
                    <MessageSquareText size={14} style={{ color: C.accentText, flexShrink: 0 }} />
                    <span className="text-[13px] font-bold" style={{ color: C.accentText }}>AI 요약 설명</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-md" style={{ background: C.chipBg, color: C.accentText }}>쉽게 풀이</span>
                    <span className="ml-auto text-[11px] flex items-center gap-0.5" style={{ color: 'var(--text-secondary)' }}>
                      {aiOpen ? '접기' : '더보기'}
                      <span style={{ fontSize: 11 }}>{aiOpen ? '▲' : '▼'}</span>
                    </span>
                  </div>
                  {!aiOpen && (
                    <p className="text-[13px]" style={{ color: 'var(--text-primary)', lineHeight: 1.7, margin: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {aiAnswer.replace(/\n+/g, ' ')}
                    </p>
                  )}
                  {aiOpen && (
                    <>
                      <div>
                        {aiAnswer.split(/\n+/).map((para, pi) => {
                          const line = para.trim();
                          if (!line) return null;
                          const startsWithEmoji = /^[\u231A-\u27BF\u2B00-\u2BFF\uD83C-\uDBFF\uDC00-\uDFFF\u2600-\u26FF]/.test(line);
                          return (
                            <p key={pi} className="text-[13px]"
                              style={{ color: 'var(--text-primary)', lineHeight: 1.75, margin: pi === 0 ? '0' : '7px 0 0', paddingLeft: startsWithEmoji ? 24 : 0, textIndent: startsWithEmoji ? -24 : 0 }}>
                              {line}
                            </p>
                          );
                        })}
                      </div>
                      <p className="text-[10px] mt-3 pt-2.5" style={{ color: 'var(--text-tertiary)', borderTop: `0.5px solid ${C.border}` }}>
                        AI가 아래 주석 근거로 쉽게 풀어 설명한 내용이에요. 정확한 수치는 원문을 확인하세요.
                      </p>
                    </>
                  )}
                </div>
              )}

              <p className="text-[11px] mb-2" style={{ color: 'var(--text-secondary)' }}>
                {aiAnswer ? '근거가 된 주석 자료' : `검색 결과 ${results.length}건`}
              </p>
              <div className="flex flex-col gap-2">
                {tableResults.map((r) => (<ResultItem key={r.id} result={r} />))}
                {proseResults.map((r) => (<ResultItem key={r.id} result={r} />))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
