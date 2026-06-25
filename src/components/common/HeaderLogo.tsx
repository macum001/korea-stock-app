// jp: 헤더 왼쪽 영역 - 기존 로고 대신 "프로필(로그인/내 계정)"을 크게 표시
// jp: HeaderLogo를 쓰던 4개 페이지(관심/이슈/공시/발견)가 이 변경을 자동으로 받음
// jp: props(height)는 호환 위해 남겨둠 (안 써도 에러 안 나게)
import { AuthButton } from '@/components/auth/AuthButton';

interface HeaderLogoProps {
  height?: number; // jp: (구버전 호환용, 미사용)
}

export function HeaderLogo(_props: HeaderLogoProps) {
  // jp: 로고 자리에 프로필을 40% 크게 (size='lg')
  return <AuthButton size="lg" />;
}
