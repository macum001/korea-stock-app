// jp: 면책 문구 - 모든 시황 화면 하단 (법적 방어)

export function DisclaimerNote() {
  return (
    <p className="px-6 py-4 text-[10px] leading-relaxed text-center"
      style={{ color: 'var(--text-tertiary)' }}>
      본 정보는 투자 참고용이며 투자 권유가 아닙니다.
      모든 수치는 외부 데이터 제공처(Yahoo Finance, 한국투자증권)에서 수집되며,
      지연되거나 부정확할 수 있습니다. 투자 판단과 책임은 투자자 본인에게 있습니다.
    </p>
  );
}
