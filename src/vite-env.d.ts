/// <reference types="vite/client" />

// jp: CSS 모듈 타입 선언
declare module '*.css' {
  const content: Record<string, string>;
  export default content;
}
