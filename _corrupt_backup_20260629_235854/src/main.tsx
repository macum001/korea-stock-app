// jp: 앱 진입점

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './services/queryClient'
import { useAuthStore } from './store/authStore'
import { setUnauthorizedHandler } from './services/apiClient'
import './styles/globals.css'
import App from './App'

// jp: 저장된 토큰을 apiClient에 주입 + 401 시 자동 로그아웃 연결
useAuthStore.getState().hydrate()
setUnauthorizedHandler(() => useAuthStore.getState().logout())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
