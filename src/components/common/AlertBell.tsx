// jp: 알림 종 아이콘 컴포넌트
// jp:   on=true  → 애니메이션 + 그라데이션
// jp:   on=false → 회색 정적
// jp: 애니메이션 B: 위로 점프하며 흔들다가 착지하는 자연스러운 종소리
interface AlertBellProps {
  on: boolean;
  size?: number;
  shake?: boolean;
  tone?: 'auto' | 'gradient' | 'muted';
}

let _bellSeq = 0;

export function AlertBell({ on, size = 22, shake, tone = 'auto' }: AlertBellProps) {
  const useGradient = tone === 'gradient' || (tone === 'auto' && on);
  const doShake = shake ?? on;
  const gid = `bellGrad_${_bellSeq++}`;
  const stroke = useGradient ? `url(#${gid})` : 'var(--text-tertiary)';

  return (
    <>
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        style={{
          transformOrigin: '50% 20%',
          animation: doShake ? 'bellBounce 2s ease-in-out infinite' : 'none',
        }}
      >
        {useGradient && (
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#A78BFA" />
              <stop offset="1" stopColor="#F9A8D4" />
            </linearGradient>
          </defs>
        )}
        <path
          d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9"
          stroke={stroke}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M13.7 21a2 2 0 01-3.4 0"
          stroke={stroke}
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
      <style>{`
        @keyframes bellBounce {
          0%,100% { transform: translateY(0) rotate(0deg); }
          15%     { transform: translateY(-6px) rotate(0deg); }
          25%     { transform: translateY(-4px) rotate(15deg); }
          35%     { transform: translateY(-4px) rotate(-13deg); }
          45%     { transform: translateY(-2px) rotate(10deg); }
          55%     { transform: translateY(-2px) rotate(-7deg); }
          65%     { transform: translateY(0) rotate(3deg); }
          75%     { transform: translateY(0) rotate(0deg); }
        }
      `}</style>
    </>
  );
}
