// jp: Phase 2 - 실시간 구독 훅: 재구독 복구 + offConnectionChange 정리

import { useEffect, useCallback } from 'react';
import { websocketService } from '@/services/websocketService';
import { useStockStore } from '@/store/stockStore';
import { StockPrice, ConnectionStatus } from '@/types/stock';

// jp: 여러 종목을 한 번에 구독 (홈 화면용)
export function useStockSocket(codes: string[]) {
  const { updatePrice, setConnectionStatus } = useStockStore();

  const handlePrice = useCallback(
    (price: StockPrice) => updatePrice(price.code, price),
    [updatePrice]
  );

  const handleConnection = useCallback(
    (status: ConnectionStatus) => setConnectionStatus(status),
    [setConnectionStatus]
  );

  // jp: 연결 상태 감지 등록 (cleanup 포함)
  useEffect(() => {
    websocketService.onConnectionChange(handleConnection);
    websocketService.connect();
    return () => websocketService.offConnectionChange(handleConnection);
  }, [handleConnection]);

  // jp: codes 변경 시 구독 재설정
  useEffect(() => {
    codes.forEach(code => websocketService.subscribeStock(code, handlePrice));
    return () => codes.forEach(code => websocketService.unsubscribeStock(code));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codes.join(','), handlePrice]);
}

// jp: 단일 종목 구독 (상세 화면용)
export function useSingleStockSocket(code: string) {
  const { updatePrice, setConnectionStatus } = useStockStore();

  const handlePrice = useCallback(
    (price: StockPrice) => updatePrice(price.code, price),
    [updatePrice]
  );

  const handleConnection = useCallback(
    (status: ConnectionStatus) => setConnectionStatus(status),
    [setConnectionStatus]
  );

  useEffect(() => {
    websocketService.onConnectionChange(handleConnection);
    if (websocketService.getStatus() === 'disconnected') {
      websocketService.connect();
    }
    websocketService.subscribeStock(code, handlePrice);

    return () => {
      websocketService.unsubscribeStock(code);
      websocketService.offConnectionChange(handleConnection);
    };
  }, [code, handlePrice, handleConnection]);
}
