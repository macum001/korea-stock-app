// jp: 투자자별 수급 컴포넌트

import { useState, useEffect } from 'react';
import { InvestorFlow } from '@/types/stock';
import { stockService } from '@/services/stockService';
import { formatVolume } from '@/utils/format';
import { Skeleton } from '@/components/common/SkeletonCard';

interface InvestorVolumeSectionProps {
  stockCode: string;
}

type InvestorTab = 'investor' | 'institution';

export function InvestorVolumeSection({ stockCode }: InvestorVolumeSectionProps) {
  const [flows, setFlows] = useState<InvestorFlow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<InvestorTab>('investor');
  const [rangeDays, setRangeDays] = useState<20 | 60 | 250>(20);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    stockService.getInvestorFlow(stockCode, rangeDays).then((data) => {
      setFlows(data);
      setLoading(false);
    });
  }, [stockCode, rangeDays]);

  if (loading) return <Skeleton className="mx-4 h-64 rounded-2xl mt-4" />;

  // jp: 최근 5일 데이터 + 5/20일 누적 순매수
  const recent = flows.slice(-5).reverse();
  const last5 = flows.slice(-5);
  const last20 = flows.slice(-20);
  const latestFlow = flows[flows.length - 1];

  // jp: 선택 구간 누적 순매수
  const totalIndividual = flows.reduce((s, f) => s + f.individual, 0);
  const totalForeign = flows.reduce((s, f) => s + f.foreign, 0);
  const totalInstitution = flows.reduce((s, f) => s + f.institution, 0);
  const sumFlow = (rows: InvestorFlow[], key: 'individual' | 'foreign' | 'institution') => rows.reduce((s, f) => s + f[key], 0);
  const latestStatus = latestFlow?.dataStatus ?? 'DELAYED';

  const maxAbsVal = Math.max(
    Math.abs(totalIndividual),
    Math.abs(totalForeign),
    Math.abs(totalInstitution)
  );

  const getBarWidth = (val: number) => Math.min(Math.abs(val) / maxAbsVal * 100, 100);

  const INVESTOR_TAB_ITEMS = [
    { label: '개인', value: totalIndividual, color: '#f59e0b' },
    { label: '외국인', value: totalForeign, color: '#8b5cf6' },
    { label: '기관', value: totalInstitution, color: '#10b981' },
  ];

  const INSTITUTION_ITEMS = latestFlow ? [
    { label: '금융투자', value: latestFlow.financial },
    { label: '보험', value: latestFlow.insurance },
    { label: '투신', value: latestFlow.trust },
    { label: '은행', value: latestFlow.bank },
    { label: '연기금', value: latestFlow.pension },
    { label: '기타기관', value: latestFlow.etc },
  ] : [];

  return (
    <div className="px-4 pt-4">
      {/* jp: 조회 기간 */}
      <div className="flex gap-2 mb-3">
        {([20, 60, 250] as const).map((days) => (
          <button
            key={days}
            onClick={() => setRangeDays(days)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold"
            style={{
              backgroundColor: rangeDays === days ? 'var(--text-primary)' : 'var(--bg-elevated)',
              color: rangeDays === days ? 'var(--bg-card)' : 'var(--text-tertiary)',
            }}
          >
            {days === 250 ? '1년' : `${days}일`}
          </button>
        ))}
        <span className="ml-auto self-center text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
          {latestStatus === 'CONFIRMED' ? '확정' : latestStatus === 'ESTIMATED' ? '잠정' : '지연'} 데이터
        </span>
      </div>

      {/* jp: 탭 */}
      <div
        className="flex rounded-xl p-0.5 mb-4"
        style={{ backgroundColor: 'var(--bg-elevated)' }}
      >
        {(['investor', 'institution'] as InvestorTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="flex-1 py-2 rounded-[10px] text-sm font-semibold transition-all"
            style={{
              backgroundColor: activeTab === tab ? 'var(--bg-card)' : 'transparent',
              color: activeTab === tab ? 'var(--text-primary)' : 'var(--text-tertiary)',
              boxShadow: activeTab === tab ? '0 1px 4px rgba(0,0,0,0.15)' : 'none',
            }}
          >
            {tab === 'investor' ? '투자자별' : '기관별'}
          </button>
        ))}
      </div>

      {activeTab === 'investor' ? (
        <>
          {/* jp: 누적 순매수 막대 차트 */}
          <div
            className="rounded-2xl p-4 mb-4"
            style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
          >
            <p className="text-xs font-medium mb-3" style={{ color: 'var(--text-tertiary)' }}>
              최근 {rangeDays === 250 ? '1년' : `${rangeDays}일`} 누적 순매수
            </p>
            {INVESTOR_TAB_ITEMS.map(({ label, value, color }) => (
              <div key={label} className="mb-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                    {label}
                  </span>
                  <span
                    className="text-xs font-bold tabular-nums"
                    style={{ color: value > 0 ? 'var(--rise)' : value < 0 ? 'var(--fall)' : 'var(--text-tertiary)' }}
                  >
                    {value > 0 ? '+' : value < 0 ? '−' : ''}{formatVolume(Math.abs(value))}
                  </span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-elevated)' }}>
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${getBarWidth(value)}%`,
                      backgroundColor: color,
                      marginLeft: value < 0 ? 'auto' : 0,
                      opacity: value === 0 ? 0 : 1,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>



          {/* jp: 5일/20일 누적 요약 */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            {[{ label: '5일', rows: last5 }, { label: '20일', rows: last20 }].map(({ label, rows }) => (
              <div key={label} className="rounded-2xl p-3" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                <p className="text-[10px] mb-2" style={{ color: 'var(--text-tertiary)' }}>{label} 누적</p>
                <div className="space-y-1 text-xs">
                  {(['individual', 'foreign', 'institution'] as const).map((key) => {
                    const value = sumFlow(rows, key);
                    const labelMap = { individual: '개인', foreign: '외국인', institution: '기관' } as const;
                    return (
                      <div key={key} className="flex justify-between">
                        <span style={{ color: 'var(--text-secondary)' }}>{labelMap[key]}</span>
                        <span className="font-semibold tabular-nums" style={{ color: value > 0 ? 'var(--rise)' : value < 0 ? 'var(--fall)' : 'var(--text-tertiary)' }}>
                          {value > 0 ? '+' : value < 0 ? '−' : ''}{formatVolume(Math.abs(value))}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* jp: 일별 순매수 테이블 */}
          <div
            className="rounded-2xl overflow-hidden"
            style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
          >
            <div
              className="grid text-[10px] font-semibold px-4 py-2.5"
              style={{
                gridTemplateColumns: '80px 1fr 1fr 1fr',
                backgroundColor: 'var(--bg-elevated)',
                color: 'var(--text-tertiary)',
              }}
            >
              <span>날짜</span>
              <span className="text-right">개인</span>
              <span className="text-right">외국인</span>
              <span className="text-right">기관</span>
            </div>
            {recent.map((flow) => (
              <div
                key={flow.date}
                className="grid px-4 py-2.5"
                style={{
                  gridTemplateColumns: '80px 1fr 1fr 1fr',
                  borderTop: '1px solid var(--border-subtle)',
                }}
              >
                <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{flow.date}</span>
                {[flow.individual, flow.foreign, flow.institution].map((val, i) => (
                  <span
                    key={i}
                    className="text-xs font-medium text-right tabular-nums"
                    style={{ color: val > 0 ? 'var(--rise)' : val < 0 ? 'var(--fall)' : 'var(--text-tertiary)' }}
                  >
                    {val > 0 ? '+' : val < 0 ? '−' : ''}{formatVolume(Math.abs(val))}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </>
      ) : (
        /* jp: 기관별 탭 */
        <div className="rounded-2xl p-6 text-center" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>기관 세부 데이터는 준비 중이에요</p>
          <p className="text-xs mt-2" style={{ color: 'var(--text-tertiary)', lineHeight: 1.6 }}>금융투자·보험·투신·은행·연기금 등 세부 분류는<br/>추후 제공될 예정입니다. 투자자별 탭에서 개인·외국인·기관 수급을 확인하세요.</p>
        </div>
      )}
    </div>
  );
}
