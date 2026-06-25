// jp: 가격 변동 감지 → 점멸 효과 클래스 반환 (토스/증권플러스 스타일)
// jp: 가격이 바뀌는 순간 'price-flash-up'(상승) / 'price-flash-down'(하락) 클래스를 잠깐 부여

import { useEffect, useRef, useState } from 'react';

export function usePriceFlash(price: number | null | undefined): string {
  const prevRef = useRef<number | null | undefined>(price);
  const [flashClass, setFlashClass] = useState('');

  useEffect(() => {
    const prev = prevRef.current;
    // jp: 이전 값이 있고, 가격이 실제로 바뀐 경우만 점멸
    if (prev != null && price != null && price !== prev) {
      const cls = price > prev ? 'price-flash-up' : 'price-flash-down';
      setFlashClass(cls);
      // jp: 애니메이션(0.6s) 끝나면 클래스 제거 (다음 변동 때 재발동 위해)
      const t = setTimeout(() => setFlashClass(''), 600);
      prevRef.current = price;
      return () => clearTimeout(t);
    }
    prevRef.current = price;
  }, [price]);

  return flashClass;
}
