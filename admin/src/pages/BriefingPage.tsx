// jp: 관리자 - 시황 브리핑 (통계 카드 + 상관 통계 + 기록 테이블)

import { useState, useEffect } from 'react';
import { briefingApi, BriefingListItem, BriefingStats, BriefingDetail } from '@/lib/briefingApi';
import { briefingStatsApi, StatCorrelation, StatDetail } from '@/lib/briefingStatsApi';

function slotLabel(slot: string): string {
  if (!slot || slot === 'test') return slot || '-';
  if (slot.length === 4) return `${slot.slice(0, 2)}:${slot.slice(2)}`;
  return slot;
}
function fmtDate(s: string): string { return String(s).slice(0, 10); }
function statusColor(st: string | null): string {
  if (st === '좋음') return '#10b981';
  if (st === '나쁨') return '#ef4444';
  return 'var(--admin-text-sec)';
}
// jp: 등락률 색 (한국식: 양수 빨강, 음수 파랑)
function rateColor(v: number): string {
  if (v > 0) return '#ef4444';
  if (v < 0) return '#3b82f6';
  return 'var(--admin-text-sec)';
}
function fmtRate(v: number | null): string {
  if (v === null) return '–';
  const sign = v > 0 ? '+' : '';
  return `${sign}${v.toFixed(2)}%`;
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div style={{ background: 'var(--admin-card)', border: '1px solid var(--admin-border)', borderRadius: 14, padding: 18 }}>
      <p style={{ fontSize: 13, color: 'var(--admin-text-sec)', margin: 0 }}>{label}</p>
      <p style={{ fontSize: 28, fontWeight: 700, margin: '6px 0 0' }}>{value}</p>
      {hint && <p style={{ fontSize: 11, color: 'var(--admin-text-ter)', margin: '4px 0 0' }}>{hint}</p>}
    </div>
  );
}

// jp: 상관 통계 카드 (노출 토글 포함)
function CorrelationCard({ stat, onToggle, onDetail }: { stat: StatCorrelation; onToggle: (key: string, v: boolean) => void; onDetail: (key: string) => void }) {
  return (
    <div onClick={() => stat.sampleSize > 0 && onDetail(stat.key)}
      style={{ background: 'var(--admin-card)', border: '1px solid var(--admin-border)', borderRadius: 14, padding: 18, cursor: stat.sampleSize > 0 ? 'pointer' : 'default' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>{stat.label}</p>
        {/* jp: 노출 토글 */}
        <label onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <span style={{ fontSize: 11, color: stat.isVisible ? 'var(--admin-accent)' : 'var(--admin-text-ter)', fontWeight: stat.isVisible ? 600 : 400 }}>
            {stat.isVisible ? '노출 중' : '노출'}
          </span>
          <input
            type="checkbox"
            checked={stat.isVisible}
            onChange={(e) => onToggle(stat.key, e.target.checked)}
            style={{ width: 32, height: 18, cursor: 'pointer' }}
          />
        </label>
      </div>
      <p style={{ fontSize: 11, color: 'var(--admin-text-ter)', margin: '0 0 12px' }}>{stat.desc}</p>

      {stat.sampleSize > 0 ? (
        <>
          <div style={{ display: 'flex', gap: 18 }}>
            {stat.values.map((v, i) => (
              <div key={i}>
                <p style={{ fontSize: 11, color: 'var(--admin-text-ter)', margin: 0 }}>{v.label}</p>
                <p style={{ fontSize: 20, fontWeight: 700, margin: '2px 0 0',
                  color: stat.key === 'hit_rate' ? '#10b981' : rateColor(v.value ?? 0) }}>
                  {stat.key === 'hit_rate' ? `${Math.round(v.value ?? 0)}%` : fmtRate(v.value)}
                </p>
              </div>
            ))}
          </div>
          {!stat.hasEnoughData && (
            <p style={{ fontSize: 11, color: '#f59e0b', margin: '8px 0 0' }}>
              ⚠️ 표본 {stat.sampleSize}건 (적어요). 더 쌓인 뒤 노출을 권장해요.
            </p>
          )}
        </>
      ) : (
        <div style={{ padding: '12px 0' }}>
          <p style={{ fontSize: 13, color: 'var(--admin-text-ter)', margin: 0 }}>
            아직 표본 없음 (조건 충족한 날이 없어요)
          </p>
          <p style={{ fontSize: 11, color: 'var(--admin-text-ter)', margin: '4px 0 0' }}>
            브리핑이 쌓이면 통계가 나타나요
          </p>
        </div>
      )}
      {stat.hitInfo && (
        <p style={{ fontSize: 10, color: 'var(--admin-text-ter)', margin: '10px 0 0' }}>{stat.hitInfo}</p>
      )}
      {stat.sampleSize > 0 && (
        <p style={{ fontSize: 10, color: 'var(--admin-accent)', margin: '6px 0 0' }}>클릭하면 일자별 상세 →</p>
      )}
    </div>
  );
}

export function BriefingPage() {
  const [stats, setStats] = useState<BriefingStats | null>(null);
  const [correlations, setCorrelations] = useState<StatCorrelation[]>([]);
  const [items, setItems] = useState<BriefingListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<BriefingDetail | null>(null);
  const [statDetail, setStatDetail] = useState<StatDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const size = 20;

  useEffect(() => {
    briefingApi.stats().then(setStats).catch(() => setStats(null));
    loadCorrelations();
  }, []);

  useEffect(() => {
    setLoading(true);
    briefingApi.list(page, size).then(r => {
      setItems(r.items);
      setTotal(r.total);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [page]);

  const loadCorrelations = () => {
    briefingStatsApi.getCorrelations().then(setCorrelations).catch(() => setCorrelations([]));
  };

  const handleToggle = (key: string, visible: boolean) => {
    // jp: 낙관적 업데이트
    setCorrelations(prev => prev.map(s => s.key === key ? { ...s, isVisible: visible } : s));
    briefingStatsApi.setVisibility(key, visible).catch(() => loadCorrelations());
  };

  const handleStatDetail = (key: string) => {
    briefingStatsApi.detail(key).then(setStatDetail).catch(() => setStatDetail(null));
  };

  const openDetail = (id: number) => {
    briefingApi.detail(id).then(setDetail).catch(() => setDetail(null));
  };

  const totalPages = Math.max(1, Math.ceil(total / size));

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>시황 브리핑</h1>
      <p style={{ fontSize: 14, color: 'var(--admin-text-sec)', margin: '8px 0 24px' }}>
        하루 5번 생성되는 시황 브리핑 기록과 통계입니다.
      </p>

      {/* 기본 통계 카드 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14, marginBottom: 28 }}>
        <StatCard label="전체 브리핑" value={stats ? stats.total.toLocaleString() : '–'} hint="누적" />
        <StatCard label="오늘" value={stats ? String(stats.today) : '–'} hint="오늘 생성" />
        <StatCard
          label="시장 상태 분포"
          value={stats ? `${stats.byMarketStatus.find(s => s.status === '좋음')?.count ?? 0} / ${stats.byMarketStatus.find(s => s.status === '보통')?.count ?? 0} / ${stats.byMarketStatus.find(s => s.status === '나쁨')?.count ?? 0}` : '–'}
          hint="좋음 / 보통 / 나쁨"
        />
        <StatCard label="총 AI 토큰" value={stats ? stats.totalTokens.toLocaleString() : '–'} hint="누적 사용량" />
      </div>

      {/* 상관 통계 */}
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 17, fontWeight: 600, margin: '0 0 4px' }}>상관 통계</h2>
        <p style={{ fontSize: 12, color: 'var(--admin-text-ter)', margin: '0 0 14px' }}>
          미국·글로벌 신호가 한국 시장에 어떻게 작용했는지. 노출 토글을 켜면 사용자 화면에 표시돼요 (표본 5건 이상부터 가능).
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
          {correlations.map(stat => (
            <CorrelationCard key={stat.key} stat={stat} onToggle={handleToggle} onDetail={handleStatDetail} />
          ))}
        </div>
      </div>

      {/* 브리핑 기록 테이블 */}
      <h2 style={{ fontSize: 17, fontWeight: 600, margin: '0 0 14px' }}>브리핑 기록</h2>
      <div style={{ background: 'var(--admin-card)', border: '1px solid var(--admin-border)', borderRadius: 14, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--admin-border)', textAlign: 'left' }}>
              <th style={thStyle}>날짜</th><th style={thStyle}>시간대</th><th style={thStyle}>상태</th>
              <th style={thStyle}>시장</th><th style={thStyle}>요약</th><th style={thStyle}>중요</th><th style={thStyle}>토큰</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: 'var(--admin-text-ter)' }}>불러오는 중...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: 'var(--admin-text-ter)' }}>브리핑이 없어요</td></tr>
            ) : items.map(it => (
              <tr key={it.id} onClick={() => openDetail(it.id)} style={{ borderBottom: '1px solid var(--admin-border)', cursor: 'pointer' }}>
                <td style={tdStyle}>{fmtDate(it.date)}</td>
                <td style={tdStyle}>{slotLabel(it.slot)}</td>
                <td style={tdStyle}>
                  <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 5, background: 'var(--admin-elevated)',
                    color: it.status === 'completed' ? '#10b981' : it.status === 'failed' ? '#ef4444' : 'var(--admin-text-sec)' }}>
                    {it.status}
                  </span>
                </td>
                <td style={{ ...tdStyle, color: statusColor(it.analysis_status), fontWeight: 600 }}>{it.analysis_status ?? '-'}</td>
                <td style={{ ...tdStyle, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.summary ?? '-'}</td>
                <td style={tdStyle}>{it.is_important ? '🔔' : ''}</td>
                <td style={tdStyle}>{it.ai_tokens ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={pageBtn}>이전</button>
          <span style={{ fontSize: 13, color: 'var(--admin-text-sec)', alignSelf: 'center' }}>{page} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={pageBtn}>다음</button>
        </div>
      )}

      {statDetail && (
        <div onClick={() => setStatDetail(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: 'var(--admin-card)', border: '1px solid var(--admin-border)', borderRadius: 14, padding: 24, maxWidth: 640, width: '100%', maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>{statDetail.label} · 일자별 검증</h2>
              <button onClick={() => setStatDetail(null)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 18, color: 'var(--admin-text-sec)' }}>✕</button>
            </div>
            <p style={{ fontSize: 12, color: 'var(--admin-text-ter)', margin: '0 0 16px' }}>{statDetail.desc}</p>

            {/* 요약 지표 */}
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16, padding: 14, background: 'var(--admin-elevated)', borderRadius: 10 }}>
              <div><p style={{ fontSize: 11, color: 'var(--admin-text-ter)', margin: 0 }}>표본</p><p style={{ fontSize: 18, fontWeight: 700, margin: '2px 0 0' }}>{statDetail.sampleSize}건</p></div>
              <div><p style={{ fontSize: 11, color: 'var(--admin-text-ter)', margin: 0 }}>적중률</p><p style={{ fontSize: 18, fontWeight: 700, margin: '2px 0 0', color: '#10b981' }}>{Math.round(statDetail.hitRate)}%</p></div>
              {statDetail.averages.map((a, i) => (
                <div key={i}>
                  <p style={{ fontSize: 11, color: 'var(--admin-text-ter)', margin: 0 }}>{a.label} 평균±편차</p>
                  <p style={{ fontSize: 16, fontWeight: 700, margin: '2px 0 0', color: rateColor(a.mean) }}>
                    {fmtRate(a.mean)} <span style={{ fontSize: 12, color: 'var(--admin-text-ter)', fontWeight: 400 }}>±{a.stdev.toFixed(2)}</span>
                  </p>
                </div>
              ))}
            </div>

            {/* 편차 주의 문구 */}
            {statDetail.averages.some(a => a.stdev > Math.abs(a.mean) * 1.5 && a.stdev > 1) && (
              <p style={{ fontSize: 12, color: '#f59e0b', margin: '0 0 14px', padding: '8px 12px', background: 'rgba(245,158,11,0.1)', borderRadius: 8 }}>
                ⚠️ 편차가 평균보다 큽니다. 결과가 들쭉날쭉해 신뢰도가 낮을 수 있어요.
              </p>
            )}

            {/* 일자별 표 */}
            {statDetail.rows.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--admin-text-ter)', textAlign: 'center', padding: 20 }}>아직 조건 충족한 날이 없어요</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--admin-border)', textAlign: 'left' }}>
                    <th style={{ padding: '8px 10px', color: 'var(--admin-text-ter)' }}>신호일</th>
                    <th style={{ padding: '8px 10px', color: 'var(--admin-text-ter)' }}>신호</th>
                    <th style={{ padding: '8px 10px', color: 'var(--admin-text-ter)' }}>반응일</th>
                    {statDetail.rows[0].targets.map((t, i) => (
                      <th key={i} style={{ padding: '8px 10px', color: 'var(--admin-text-ter)' }}>{t.label}</th>
                    ))}
                    <th style={{ padding: '8px 10px', color: 'var(--admin-text-ter)' }}>적중</th>
                  </tr>
                </thead>
                <tbody>
                  {statDetail.rows.slice().reverse().map((row, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--admin-border)' }}>
                      <td style={{ padding: '8px 10px', color: 'var(--admin-text-sec)' }}>{row.signalDate}</td>
                      <td style={{ padding: '8px 10px', fontWeight: 600, color: rateColor(row.signalValue) }}>
                        {statDetail.key === 'hit_rate' ? '좋음' : fmtRate(row.signalValue)}
                      </td>
                      <td style={{ padding: '8px 10px', color: 'var(--admin-text-sec)' }}>{row.targetDate}</td>
                      {row.targets.map((t, j) => (
                        <td key={j} style={{ padding: '8px 10px', fontWeight: 600, color: rateColor(t.value) }}>{fmtRate(t.value)}</td>
                      ))}
                      <td style={{ padding: '8px 10px' }}>{row.hit ? '✅' : '❌'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <p style={{ fontSize: 11, color: 'var(--admin-text-ter)', margin: '16px 0 0', lineHeight: 1.5 }}>
              ※ 표본이 적으면(수십 건 미만) 우연일 수 있어요. 투자 판단 시 보조 지표로만 활용하세요.
            </p>
          </div>
        </div>
      )}

      {detail && (
        <div onClick={() => setDetail(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: 'var(--admin-card)', border: '1px solid var(--admin-border)', borderRadius: 14, padding: 24, maxWidth: 560, width: '100%', maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>{fmtDate(detail.date)} · {slotLabel(detail.slot)}</h2>
              <button onClick={() => setDetail(null)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 18, color: 'var(--admin-text-sec)' }}>✕</button>
            </div>
            {detail.analysis && (
              <div style={{ marginBottom: 16 }}>
                {Object.entries({ status: '시장 상태', summary: '한줄 요약', why: '왜', korea_impact: '한국 영향', strong_area: '강한 분야', caution: '조심할 점', conclusion: '결론' }).map(([key, label]) => {
                  const v = (detail.analysis as Record<string, unknown>)[key];
                  if (!v) return null;
                  return (
                    <div key={key} style={{ marginBottom: 10 }}>
                      <p style={{ fontSize: 11, color: 'var(--admin-text-ter)', margin: '0 0 2px' }}>{label}</p>
                      <p style={{ fontSize: 13, color: 'var(--admin-text-sec)', margin: 0, lineHeight: 1.5 }}>{String(v)}</p>
                    </div>
                  );
                })}
              </div>
            )}
            <div style={{ borderTop: '1px solid var(--admin-border)', paddingTop: 12 }}>
              <p style={{ fontSize: 12, color: 'var(--admin-text-ter)', margin: 0 }}>
                원본 데이터: {detail.raw_data?.fetchedCount ?? 0}/{detail.raw_data?.totalCount ?? 0}개 · 토큰: {detail.ai_tokens ?? '-'} · 모델: {detail.ai_model ?? '-'}
              </p>
              {detail.error_message && <p style={{ fontSize: 12, color: '#ef4444', margin: '8px 0 0' }}>오류: {detail.error_message}</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = { padding: '12px 14px', fontSize: 12, fontWeight: 600, color: 'var(--admin-text-sec)' };
const tdStyle: React.CSSProperties = { padding: '11px 14px', color: 'var(--admin-text-sec)' };
const pageBtn: React.CSSProperties = { padding: '7px 16px', borderRadius: 8, border: '1px solid var(--admin-border)', background: 'var(--admin-card)', color: 'var(--admin-text-sec)', cursor: 'pointer', fontSize: 13 };
