// jp: 관리자 - 공시 → 주가 반응 통계 페이지
// jp: 공시 종류별로 공시 후 1~30거래일 주가 흐름. 클릭하면 일자별 상세.

import { useState, useEffect } from 'react';
import { disclosureStatsApi, DisclosureStatItem, DisclosureStatDetailRow, DAY_LABELS, impactMonitorApi, ImpactJobLog } from '@/lib/disclosureStatsApi';

// jp: 등락률 색 (한국식: 양수 빨강, 음수 파랑)
function rateColor(v: number): string {
  if (v > 0.05) return '#ef4444';
  if (v < -0.05) return '#3b82f6';
  return 'var(--admin-text-sec)';
}
function fmtRate(v: number | null | undefined): string {
  if (v === null || v === undefined) return '–';
  const sign = v > 0 ? '+' : '';
  return `${sign}${v.toFixed(1)}%`;
}

// jp: 시간축 흐름 미니 그래프 (d1~d30 막대)
function TrendBars({ avg }: { avg: Record<string, number> }) {
  const vals = DAY_LABELS.map(d => avg[d.key] ?? 0);
  const maxAbs = Math.max(...vals.map(Math.abs), 1);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3, height: 44, marginTop: 8 }}>
      {DAY_LABELS.map((d, i) => {
        const v = vals[i];
        const h = Math.max(2, (Math.abs(v) / maxAbs) * 20);
        return (
          <div key={d.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ height: 22, display: 'flex', alignItems: 'flex-end' }}>
              {v >= 0 && <div style={{ width: 10, height: h, background: rateColor(v), borderRadius: '2px 2px 0 0' }} />}
            </div>
            <div style={{ height: 22, display: 'flex', alignItems: 'flex-start' }}>
              {v < 0 && <div style={{ width: 10, height: h, background: rateColor(v), borderRadius: '0 0 2px 2px' }} />}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StatCard({ stat, onClick, onToggle }: { stat: DisclosureStatItem; onClick: () => void; onToggle: (next: boolean) => void }) {
  const d5 = stat.avg.d5 ?? 0;
  const d30 = stat.avg.d30 ?? 0;
  const up30 = stat.upRate.d30 ?? 0;

  return (
    <div onClick={onClick}
      style={{ background: 'var(--admin-card)', border: '1px solid var(--admin-border)', borderRadius: 12, padding: 16, cursor: 'pointer' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>{stat.label}</p>
        <span style={{ fontSize: 11, color: stat.hasEnoughData ? 'var(--admin-text-ter)' : '#f59e0b' }}>
          표본 {stat.sampleSize}건{!stat.hasEnoughData && ' ⚠️'}
        </span>
      </div>

      {/* 사용자 노출 토글 */}
      <div onClick={(e) => { e.stopPropagation(); onToggle(!stat.isVisible); }}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, marginBottom: 8, cursor: 'pointer' }}>
        <span style={{ fontSize: 10, color: stat.isVisible ? '#10b981' : 'var(--admin-text-ter)' }}>
          {stat.isVisible ? '사용자 노출 중' : '숨김'}
        </span>
        <div style={{ width: 32, height: 18, borderRadius: 99, background: stat.isVisible ? '#10b981' : 'var(--admin-border)', position: 'relative', transition: 'background 0.15s' }}>
          <div style={{ width: 14, height: 14, borderRadius: '50%', background: '#fff', position: 'absolute', top: 2, left: stat.isVisible ? 16 : 2, transition: 'left 0.15s' }} />
        </div>
      </div>

      {/* 주요 수치 */}
      <div style={{ display: 'flex', gap: 14, marginTop: 8 }}>
        <div><p style={{ fontSize: 10, color: 'var(--admin-text-ter)', margin: 0 }}>5일</p>
          <p style={{ fontSize: 17, fontWeight: 700, margin: '1px 0 0', color: rateColor(d5) }}>{fmtRate(d5)}</p></div>
        <div><p style={{ fontSize: 10, color: 'var(--admin-text-ter)', margin: 0 }}>30일</p>
          <p style={{ fontSize: 17, fontWeight: 700, margin: '1px 0 0', color: rateColor(d30) }}>{fmtRate(d30)}</p></div>
        <div><p style={{ fontSize: 10, color: 'var(--admin-text-ter)', margin: 0 }}>30일 상승</p>
          <p style={{ fontSize: 17, fontWeight: 700, margin: '1px 0 0', color: up30 >= 50 ? '#10b981' : '#ef4444' }}>{Math.round(up30)}%</p></div>
      </div>

      {/* 시간축 흐름 */}
      <TrendBars avg={stat.avg} />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
        <span style={{ fontSize: 9, color: 'var(--admin-text-ter)' }}>1일</span>
        <span style={{ fontSize: 9, color: 'var(--admin-text-ter)' }}>30일</span>
      </div>

      <p style={{ fontSize: 10, color: 'var(--admin-accent)', margin: '8px 0 0' }}>클릭하면 일자별 상세 →</p>
    </div>
  );
}


// jp: 자동 재계산 상태 패널
function ImpactStatusPanel() {
  const [logs, setLogs] = useState<ImpactJobLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = () => {
    impactMonitorApi.getStatus().then(r => {
      setLogs(r.logs);
      setLoading(false);
    }).catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const runNow = async () => {
    if (running) return;
    setRunning(true);
    try {
      await impactMonitorApi.runNow();
      load();
    } catch {
      // 무시 - 다음 load에서 상태 반영
    } finally {
      setRunning(false);
    }
  };

  if (loading) return null;

  const last = logs[0];

  // jp: 상태 판정 - 마지막 실행이 언제였나
  let statusColor = '#10b981';
  let statusBg = '#14241a';
  let statusBorder = '#1f4030';
  let statusText = '자동 재계산 정상 작동 중';
  let problem: string | null = null;

  if (!last) {
    statusColor = '#f59e0b'; statusBg = '#2a2414'; statusBorder = '#50451f';
    statusText = '아직 자동 실행 기록이 없어요';
    problem = '다음 평일 16:30에 첫 자동 실행이 예정돼 있어요. 지금 바로 확인하려면 "지금 실행"을 눌러보세요.';
  } else {
    const ranAt = new Date(last.ran_at);
    const hoursAgo = (Date.now() - ranAt.getTime()) / (1000 * 60 * 60);
    if (!last.success) {
      statusColor = '#ef4444'; statusBg = '#2a1a14'; statusBorder = '#50301f';
      statusText = '⚠️ 마지막 자동 재계산이 실패했어요';
      problem = `오류: ${last.error_message || '알 수 없음'}. 백엔드가 켜져 있는지, KIS 연결이 정상인지 확인하고 "지금 실행"으로 다시 시도해보세요.`;
    } else if (hoursAgo > 48) {
      statusColor = '#ef4444'; statusBg = '#2a1a14'; statusBorder = '#50301f';
      statusText = `⚠️ 자동 재계산이 ${Math.floor(hoursAgo / 24)}일째 안 돌았어요`;
      problem = '백엔드가 꺼져있거나 cron이 멈췄을 수 있어요. 백엔드를 재시작하거나 "지금 실행"을 눌러보세요.';
    }
  }

  const fmtTime = (s: string) => {
    const d = new Date(s);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const prevSamples = logs[1]?.total_samples;

  return (
    <div style={{ background: statusBg, border: `1px solid ${statusBorder}`, borderRadius: 12, padding: 16, marginBottom: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ width: 8, height: 8, background: statusColor, borderRadius: '50%', display: 'inline-block' }} />
            <span style={{ fontSize: 14, fontWeight: 600, color: statusColor }}>{statusText}</span>
          </div>

          {last && (
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              <div><p style={{ fontSize: 11, color: 'var(--admin-text-ter)', margin: 0 }}>마지막 실행</p>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--admin-text-pri, #e8eaed)', margin: '2px 0 0' }}>
                  {fmtTime(last.ran_at)} {last.trigger_type === 'manual' ? '(수동)' : ''}
                </p></div>
              <div><p style={{ fontSize: 11, color: 'var(--admin-text-ter)', margin: 0 }}>처리</p>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--admin-text-pri, #e8eaed)', margin: '2px 0 0' }}>{last.processed}건</p></div>
              <div><p style={{ fontSize: 11, color: 'var(--admin-text-ter)', margin: 0 }}>신규 완료</p>
                <p style={{ fontSize: 13, fontWeight: 600, color: '#10b981', margin: '2px 0 0' }}>+{last.completed}건</p></div>
              <div><p style={{ fontSize: 11, color: 'var(--admin-text-ter)', margin: 0 }}>총 표본</p>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--admin-text-pri, #e8eaed)', margin: '2px 0 0' }}>
                  {last.total_samples.toLocaleString()}건
                  {prevSamples !== undefined && last.total_samples > prevSamples && (
                    <span style={{ color: '#10b981', fontSize: 11 }}> (+{(last.total_samples - prevSamples).toLocaleString()})</span>
                  )}
                </p></div>
              <div><p style={{ fontSize: 11, color: 'var(--admin-text-ter)', margin: 0 }}>미처리 잔량</p>
                <p style={{ fontSize: 13, fontWeight: 600, color: last.pending_left > 1000 ? '#f59e0b' : 'var(--admin-text-pri, #e8eaed)', margin: '2px 0 0' }}>
                  {last.pending_left.toLocaleString()}건</p></div>
            </div>
          )}

          {problem && (
            <p style={{ fontSize: 12, color: '#c9a896', margin: '10px 0 0', lineHeight: 1.5 }}>{problem}</p>
          )}
        </div>

        <button onClick={runNow} disabled={running}
          style={{ padding: '9px 16px', borderRadius: 8, border: 'none', cursor: running ? 'wait' : 'pointer',
            background: running ? 'var(--admin-border)' : 'var(--admin-accent)', color: '#fff', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>
          {running ? '실행 중...' : '지금 실행'}
        </button>
      </div>

      {/* 최근 이력 */}
      {logs.length > 1 && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${statusBorder}` }}>
          <p style={{ fontSize: 11, color: 'var(--admin-text-ter)', margin: '0 0 8px' }}>최근 실행 이력</p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {logs.map((log, i) => (
              <div key={i} title={`${fmtTime(log.ran_at)} · 처리 ${log.processed} · 완료 ${log.completed}`}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 9px', borderRadius: 6, background: 'rgba(255,255,255,0.04)', fontSize: 11 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: log.success ? '#10b981' : '#ef4444', display: 'inline-block' }} />
                <span style={{ color: 'var(--admin-text-sec)' }}>{fmtTime(log.ran_at)}</span>
                <span style={{ color: 'var(--admin-text-ter)' }}>+{log.completed}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function DisclosureStatsPage() {
  const [basic, setBasic] = useState<DisclosureStatItem[]>([]);
  const [subtype, setSubtype] = useState<DisclosureStatItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<{ stat: DisclosureStatItem; rows: DisclosureStatDetailRow[] } | null>(null);

  useEffect(() => {
    disclosureStatsApi.getStats().then(r => {
      setBasic(r.basic);
      setSubtype(r.subtype);
      setTotal(r.totalSamples);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const openDetail = (stat: DisclosureStatItem) => {
    const [group, type] = stat.key.split(':');
    disclosureStatsApi.getDetail(group, type).then(rows => setDetail({ stat, rows })).catch(() => setDetail(null));
  };

  // jp: 노출 토글 - 낙관적 업데이트
  const toggleVisibility = async (stat: DisclosureStatItem, next: boolean) => {
    const apply = (list: DisclosureStatItem[]) => list.map(s => s.key === stat.key ? { ...s, isVisible: next } : s);
    setBasic(prev => apply(prev));
    setSubtype(prev => apply(prev));
    try {
      await disclosureStatsApi.setVisibility(stat.label, next);
    } catch {
      // 실패 시 되돌림
      const revert = (list: DisclosureStatItem[]) => list.map(s => s.key === stat.key ? { ...s, isVisible: !next } : s);
      setBasic(prev => revert(prev));
      setSubtype(prev => revert(prev));
    }
  };

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>공시 → 주가 반응 통계</h1>
      <p style={{ fontSize: 14, color: 'var(--admin-text-sec)', margin: '8px 0 4px' }}>
        공시 종류별로 공시 후 1~30거래일 주가가 어떻게 움직였는지 분석합니다.
      </p>
      <p style={{ fontSize: 12, color: 'var(--admin-text-ter)', margin: '0 0 20px' }}>
        의미 있는 공시(호재/악재/자본/중요)만 집계 · 분석 표본 {total.toLocaleString()}건
      </p>

      {/* 자동 재계산 상태 패널 */}
      <ImpactStatusPanel />

      {loading ? (
        <p style={{ color: 'var(--admin-text-ter)' }}>불러오는 중...</p>
      ) : (
        <>
          {/* 기본 분류 */}
          <h2 style={{ fontSize: 17, fontWeight: 600, margin: '0 0 14px' }}>공시 유형별</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14, marginBottom: 32 }}>
            {basic.length === 0 ? (
              <p style={{ color: 'var(--admin-text-ter)', fontSize: 13 }}>아직 데이터가 부족해요</p>
            ) : basic.map(stat => (
              <StatCard key={stat.key} stat={stat} onClick={() => openDetail(stat)} onToggle={(next) => toggleVisibility(stat, next)} />
            ))}
          </div>

          {/* 세부 분류 (subtype) */}
          {subtype.length > 0 && (
            <>
              <h2 style={{ fontSize: 17, fontWeight: 600, margin: '0 0 4px' }}>AI 세부 분류</h2>
              <p style={{ fontSize: 12, color: 'var(--admin-text-ter)', margin: '0 0 14px' }}>
                AI가 분류한 증자방식·사채유형 등 (데이터 쌓이는 중)
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
                {subtype.map(stat => (
                  <StatCard key={stat.key} stat={stat} onClick={() => openDetail(stat)} onToggle={(next) => toggleVisibility(stat, next)} />
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* 일자별 상세 모달 */}
      {detail && (
        <div onClick={() => setDetail(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: 'var(--admin-card)', border: '1px solid var(--admin-border)', borderRadius: 14, padding: 24, maxWidth: 820, width: '100%', maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>{detail.stat.label} · 일자별 상세</h2>
              <button onClick={() => setDetail(null)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 18, color: 'var(--admin-text-sec)' }}>✕</button>
            </div>

            {/* 시점별 평균 요약 */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '12px 0 16px', padding: 14, background: 'var(--admin-elevated)', borderRadius: 10 }}>
              {DAY_LABELS.map(d => (
                <div key={d.key} style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: 10, color: 'var(--admin-text-ter)', margin: 0 }}>{d.label}</p>
                  <p style={{ fontSize: 15, fontWeight: 700, margin: '2px 0 0', color: rateColor(detail.stat.avg[d.key] ?? 0) }}>
                    {fmtRate(detail.stat.avg[d.key])}
                  </p>
                  <p style={{ fontSize: 9, color: 'var(--admin-text-ter)', margin: 0 }}>{Math.round(detail.stat.upRate[d.key] ?? 0)}%↑</p>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 11, color: 'var(--admin-text-ter)', margin: '0 0 14px' }}>
              표본 {detail.stat.sampleSize}건 · 30일 변동성(표준편차) ±{detail.stat.stdevD30.toFixed(1)}%
              {detail.stat.stdevD30 > Math.abs(detail.stat.avg.d30 ?? 0) * 1.5 && detail.stat.stdevD30 > 3 && (
                <span style={{ color: '#f59e0b' }}> · ⚠️ 변동성이 커서 신뢰도 주의</span>
              )}
            </p>

            {/* 일자별 표 */}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--admin-border)', textAlign: 'left' }}>
                  <th style={{ padding: '7px 8px', color: 'var(--admin-text-ter)' }}>종목</th>
                  <th style={{ padding: '7px 8px', color: 'var(--admin-text-ter)' }}>공시일</th>
                  {DAY_LABELS.map(d => (
                    <th key={d.key} style={{ padding: '7px 8px', color: 'var(--admin-text-ter)', textAlign: 'right' }}>{d.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {detail.rows.map((row, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--admin-border)' }}>
                    <td style={{ padding: '7px 8px', color: 'var(--admin-text-sec)' }}>{row.stockName || row.stockCode}</td>
                    <td style={{ padding: '7px 8px', color: 'var(--admin-text-ter)' }}>{row.disclosedDate}</td>
                    {DAY_LABELS.map(d => (
                      <td key={d.key} style={{ padding: '7px 8px', textAlign: 'right', fontWeight: 600, color: rateColor(row.returns[d.key] ?? 0) }}>
                        {fmtRate(row.returns[d.key])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>

            <p style={{ fontSize: 11, color: 'var(--admin-text-ter)', margin: '16px 0 0', lineHeight: 1.5 }}>
              ※ 표본이 적으면(수십 건 미만) 우연일 수 있어요. 투자 판단 시 보조 지표로만 활용하세요.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
