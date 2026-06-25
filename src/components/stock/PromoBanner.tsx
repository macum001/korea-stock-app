// jp: 안내 배너 컴포넌트 (pill 형태)

interface PromoBannerProps {
  message?: string;
}

export function PromoBanner({ message = '본 정보는 투자 참고용이며 투자 권유가 아닙니다.' }: PromoBannerProps) {
  return (
    <div className="px-5 mb-3">
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-full text-xs"
        style={{
          backgroundColor: 'var(--bg-elevated)',
          color: 'var(--text-tertiary)',
          border: '1px solid var(--border)',
        }}
      >
        <span
          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: 'var(--accent)' }}
        />
        <span className="truncate">{message}</span>
      </div>
    </div>
  );
}
