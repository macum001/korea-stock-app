// jp: 관심종목 스토어 - 그룹 삭제(모드 선택)/수정/순서변경 + 메모(updatedAt/500자)
// jp: 백엔드 DB 동기화 추가 (best-effort, 실패 시 localStorage fallback)
// jp: ★ 회원 전용 - 비로그인이면 등록/알림토글 차단 (반환값 false)

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { watchlistSync, fetchWatchlist } from '@/services/watchlist/watchlistSync';
import { useAuthStore } from '@/store/authStore';

export interface WatchlistItem {
  code: string;
  name: string;
  order: number;
  groupId: string;
  memo: string;
  memoUpdatedAt?: number;
  priceAlert: boolean;
  disclosureAlert: boolean;
  addedAt: number;
  // jp: 자산 종류 - 'index'(지수)는 시세를 market/indices에서, 'stock'(종목)은 WebSocket에서
  assetType?: 'stock' | 'index';
}

export interface WatchlistGroup {
  id: string;
  name: string;
  order: number;
  isDefault: boolean;
}

export type DeleteGroupMode = 'move_to_default' | 'delete_all';

const MEMO_MAX_LENGTH = 500;
const MAX_STOCKS_PER_GROUP = 10; // jp: 그룹당 종목 최대 (지수 제외)
const DEFAULT_GROUP_ID = 'default';

// jp: ★ 비회원/신규에게 보여줄 기본 7종목 (지수 5 + 종목 2)
// jp: 코드는 시세 시스템과 일치 (국내지수 0001/1001, 미국지수 DJI/SPX/NDQ)
// jp: 서버(회원가입 seedDefaultWatchlist)와 동일하게 유지할 것
const DEFAULT_ITEMS: { code: string; name: string; assetType: 'stock' | 'index' }[] = [
  { code: '0001',   name: '코스피',      assetType: 'index' },
  { code: '2001',   name: '코스피200',   assetType: 'index' },
  { code: '1001',   name: '코스닥',      assetType: 'index' },
  { code: '005930', name: '삼성전자',    assetType: 'stock' },
  { code: '000660', name: 'SK하이닉스',  assetType: 'stock' },
];

// jp: 기본 7종목을 WatchlistItem 형태로 (비회원 표시용 - 저장 안 함)
export function buildDefaultItems(): WatchlistItem[] {
  return DEFAULT_ITEMS.map((it, idx) => ({
    code: it.code,
    name: it.name,
    order: idx,
    groupId: DEFAULT_GROUP_ID,
    memo: '',
    priceAlert: false,
    disclosureAlert: false,
    addedAt: Date.now(),
    assetType: it.assetType,
  }));
}

// jp: 로그인 여부 (런타임 참조 - 순환참조 회피)
function isLoggedIn(): boolean {
  return useAuthStore.getState().isAuthenticated;
}

interface WatchlistStore {
  items: WatchlistItem[];
  groups: WatchlistGroup[];

  // jp: 종목 관리 (addItem은 성공 여부 반환 - 비로그인이면 false)
  addItem: (code: string, name: string, groupId?: string) => boolean;
  removeItem: (code: string) => void;
  hasItem: (code: string) => boolean;
  moveItem: (code: string, direction: 'up' | 'down') => void;
  // jp: 드래그로 임의 위치 이동 (같은 그룹 안에서 fromIndex → toIndex)
  reorderItems: (groupId: string, fromIndex: number, toIndex: number) => void;
  moveToGroup: (code: string, groupId: string) => void;

  setMemo: (code: string, memo: string) => void;
  updateItemName: (code: string, name: string) => void;
  deleteMemo: (code: string) => void;

  togglePriceAlert: (code: string) => void;
  toggleDisclosureAlert: (code: string) => void;

  addGroup: (name: string) => string;
  renameGroup: (id: string, name: string) => void;
  deleteGroup: (id: string, mode: DeleteGroupMode) => void;
  reorderGroups: (orderedIds: string[]) => void;
  moveGroup: (id: string, direction: 'up' | 'down') => void;

  getItemsByGroup: (groupId: string) => WatchlistItem[];
  getGroupItemCount: (groupId: string) => number;

  hydrateFromServer: () => Promise<void>;
  // jp: 비회원에게 기본 7종목 표시 (확인용)
  loadGuestDefaults: () => void;
  // jp: 로그아웃 시 로컬 비우기 (→ 기본 7종목 복원)
  clearLocal: () => void;
}

export const useWatchlistStore = create<WatchlistStore>()(
  persist(
    (set, get) => ({
      groups: [{ id: DEFAULT_GROUP_ID, name: '기본', order: 0, isDefault: true }],
      // jp: ★ 기본 7종목으로 시작 (비회원 확인용). 로그인하면 hydrateFromServer가 덮어씀
      items: buildDefaultItems(),

      hasItem: (code) => get().items.some(i => i.code === code),

      // jp: ★ 종목 추가 - 비로그인이면 차단 (false 반환)
      addItem: (code, name, groupId) => {
        if (!isLoggedIn()) return false; // jp: 회원 전용
        if (get().hasItem(code)) return true; // jp: 이미 있으면 성공 취급
        // jp: 그룹당 종목 10개 제한 (지수는 카운트에서 제외)
        {
          const st = get();
          const groups0 = st.groups.length > 0 ? st.groups : [{ id: DEFAULT_GROUP_ID }];
          const tgtId = groupId ?? (groups0.find(g => g.id === DEFAULT_GROUP_ID)?.id ?? groups0[0].id);
          const stockCount = st.items.filter(i => i.groupId === tgtId && i.assetType !== 'index').length;
          if (stockCount >= MAX_STOCKS_PER_GROUP) return false;
        }
        const maxOrder = Math.max(-1, ...get().items.map(i => i.order));

        set(state => {
          let groups = state.groups;
          if (groups.length === 0) {
            groups = [{ id: DEFAULT_GROUP_ID, name: '기본', order: 0, isDefault: true }];
          }
          const targetGroupId = groupId
            ?? (groups.find(g => g.id === DEFAULT_GROUP_ID)?.id
                ?? [...groups].sort((a, b) => a.order - b.order)[0].id);

          return {
            groups,
            items: [
              ...state.items,
              { code, name, order: maxOrder + 1, groupId: targetGroupId, memo: '', priceAlert: false, disclosureAlert: false, addedAt: Date.now() },
            ],
          };
        });
        const item = get().items.find(i => i.code === code);
        if (item) watchlistSync.addItem(code, name, item.groupId);
        return true;
      },

      removeItem: (code) => {
        set(state => ({ items: state.items.filter(i => i.code !== code) }));
        watchlistSync.removeItem(code);
      },

      moveItem: (code, direction) => {
        set(state => {
          const target = state.items.find(i => i.code === code);
          if (!target) return state;
          const groupItems = [...state.items]
            .filter(i => i.groupId === target.groupId)
            .sort((a, b) => a.order - b.order);
          const idx = groupItems.findIndex(i => i.code === code);
          const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
          if (swapIdx < 0 || swapIdx >= groupItems.length) return state;

          const items = state.items.map(item => {
            if (item.code === groupItems[idx].code)     return { ...item, order: groupItems[swapIdx].order };
            if (item.code === groupItems[swapIdx].code) return { ...item, order: groupItems[idx].order };
            return item;
          });
          return { items };
        });
      },

      // jp: 드래그 순서 변경 - 같은 그룹 내에서 fromIndex 항목을 toIndex로 이동
      reorderItems: (groupId, fromIndex, toIndex) => {
        set(state => {
          // jp: 해당 그룹 항목만 순서대로 추출
          const groupItems = state.items
            .filter(i => i.groupId === groupId)
            .sort((a, b) => a.order - b.order);
          if (
            fromIndex < 0 || fromIndex >= groupItems.length ||
            toIndex < 0 || toIndex >= groupItems.length ||
            fromIndex === toIndex
          ) return state;

          // jp: 배열에서 빼서 새 위치에 삽입
          const reordered = [...groupItems];
          const [moved] = reordered.splice(fromIndex, 1);
          reordered.splice(toIndex, 0, moved);

          // jp: 새 order 부여 (0,1,2...)
          const orderMap = new Map<string, number>();
          reordered.forEach((it, idx) => orderMap.set(it.code, idx));

          const items = state.items.map(item =>
            item.groupId === groupId && orderMap.has(item.code)
              ? { ...item, order: orderMap.get(item.code)! }
              : item
          );
          return { items };
        });
        // jp: 백엔드 동기화 (순서 저장) - 그룹 전체 순서 재전송
        const groupItems = get().items
          .filter(i => i.groupId === groupId)
          .sort((a, b) => a.order - b.order);
        groupItems.forEach((it) => {
          watchlistSync.moveItem(it.code, groupId);
        });
      },

      moveToGroup: (code, groupId) => {
        set(state => ({
          items: state.items.map(i => i.code === code ? { ...i, groupId } : i),
        }));
        watchlistSync.moveItem(code, groupId);
      },

      setMemo: (code, memo) => {
        const trimmed = memo.trim().slice(0, MEMO_MAX_LENGTH);
        set(state => ({
          items: state.items.map(i =>
            i.code === code
              ? { ...i, memo: trimmed, memoUpdatedAt: trimmed ? Date.now() : undefined }
              : i
          ),
        }));
        if (trimmed) watchlistSync.setMemo(code, trimmed);
        else watchlistSync.deleteMemo(code);
      },

      updateItemName: (code, name) => {
        if (!name || name === code) return;
        set(state => ({
          items: state.items.map(i =>
            i.code === code && (i.name === code || !i.name) ? { ...i, name } : i
          ),
        }));
      },

      deleteMemo: (code) => {
        set(state => ({
          items: state.items.map(i =>
            i.code === code ? { ...i, memo: '', memoUpdatedAt: undefined } : i
          ),
        }));
        watchlistSync.deleteMemo(code);
      },

      togglePriceAlert: (code) => {
        if (!isLoggedIn()) return; // jp: 회원 전용
        set(state => ({
          items: state.items.map(i => i.code === code ? { ...i, priceAlert: !i.priceAlert } : i),
        }));
        const item = get().items.find(i => i.code === code);
        if (item) watchlistSync.setPriceAlert(code, item.priceAlert);
      },

      toggleDisclosureAlert: (code) => {
        if (!isLoggedIn()) return; // jp: 회원 전용
        set(state => ({
          items: state.items.map(i => i.code === code ? { ...i, disclosureAlert: !i.disclosureAlert } : i),
        }));
        const item = get().items.find(i => i.code === code);
        if (item) watchlistSync.setDisclosureAlert(code, item.disclosureAlert);
      },

      addGroup: (name) => {
        const id = `group-${Date.now()}`;
        const maxOrder = Math.max(-1, ...get().groups.map(g => g.order));
        const trimmedName = name.trim() || '새 그룹';
        set(state => ({
          groups: [...state.groups, { id, name: trimmedName, order: maxOrder + 1, isDefault: false }],
        }));
        watchlistSync.addGroup(id, trimmedName, maxOrder + 1);
        return id;
      },

      renameGroup: (id, name) => {
        const group = get().groups.find(g => g.id === id);
        if (!group) return;
        const trimmed = name.trim();
        if (!trimmed) return;
        set(state => ({
          groups: state.groups.map(g => g.id === id ? { ...g, name: trimmed } : g),
        }));
        watchlistSync.renameGroup(id, trimmed);
      },

      deleteGroup: (id, mode) => {
        const group = get().groups.find(g => g.id === id);
        if (!group) return;

        set(state => {
          const remaining = state.groups.filter(g => g.id !== id);

          if (mode === 'delete_all') {
            return {
              groups: remaining,
              items: state.items.filter(i => i.groupId !== id),
            };
          }

          if (remaining.length === 0) {
            const orphans = state.items.filter(i => i.groupId === id);
            if (orphans.length > 0) {
              const newDefault = { id: DEFAULT_GROUP_ID, name: '기본', order: 0, isDefault: true };
              return {
                groups: [newDefault],
                items: state.items.map(i => i.groupId === id ? { ...i, groupId: DEFAULT_GROUP_ID } : i),
              };
            }
            return { groups: [], items: [] };
          }

          const target = [...remaining].sort((a, b) => a.order - b.order)[0];
          return {
            groups: remaining,
            items: state.items.map(i => i.groupId === id ? { ...i, groupId: target.id } : i),
          };
        });
        watchlistSync.deleteGroup(id, mode);
      },

      reorderGroups: (orderedIds) => {
        set(state => ({
          groups: state.groups.map(g => {
            const newOrder = orderedIds.indexOf(g.id);
            return newOrder === -1 ? g : { ...g, order: newOrder };
          }),
        }));
      },

      moveGroup: (id, direction) => {
        set(state => {
          const sorted = [...state.groups].sort((a, b) => a.order - b.order);
          const idx = sorted.findIndex(g => g.id === id);
          if (idx === -1) return state;
          const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
          if (swapIdx < 0 || swapIdx >= sorted.length) return state;

          const groups = state.groups.map(g => {
            if (g.id === sorted[idx].id)     return { ...g, order: sorted[swapIdx].order };
            if (g.id === sorted[swapIdx].id) return { ...g, order: sorted[idx].order };
            return g;
          });
          return { groups };
        });
      },

      getItemsByGroup: (groupId) =>
        get().items.filter(i => i.groupId === groupId).sort((a, b) => a.order - b.order),

      getGroupItemCount: (groupId) =>
        get().items.filter(i => i.groupId === groupId).length,

      hydrateFromServer: async () => {
        const data = await fetchWatchlist();
        if (!data) return;
        const groups: WatchlistGroup[] = (data.groups || []).map(g => ({
          id: g.id,
          name: g.name,
          order: g.sort_order ?? 0,
          isDefault: g.is_default ?? (g.id === DEFAULT_GROUP_ID),
        }));
        const items: WatchlistItem[] = (data.items || []).map(it => ({
          code: it.stock_code,
          name: it.stock_name,
          order: it.sort_order ?? 0,
          groupId: it.group_id || DEFAULT_GROUP_ID,
          memo: it.memo || '',
          priceAlert: it.price_alert ?? false,
          disclosureAlert: it.disclosure_alert ?? false,
          addedAt: Date.now(),
          // jp: 서버의 asset_type (없으면 stock 기본). 타입에 없을 수 있어 느슨히 접근
          assetType: ((it as { asset_type?: string }).asset_type as 'stock' | 'index') ?? 'stock',
        }));
        set({
          groups: groups.length > 0 ? groups : get().groups,
          items,
        });
      },

      // jp: ★ 비회원(로그인 전)에게 기본 7종목을 화면에 채움 (확인용)
      // jp: 저장은 되지만(persist), 로그인하면 hydrateFromServer가 덮어쓰고,
      // jp: 로그아웃하면 clearLocal 후 다시 이걸 호출해 기본종목 복원
      loadGuestDefaults: () => {
        // jp: 이미 회원이면 아무것도 안 함 (서버 데이터 우선)
        if (isLoggedIn()) return;
        set({
          groups: [{ id: DEFAULT_GROUP_ID, name: '기본', order: 0, isDefault: true }],
          items: buildDefaultItems(),
        });
      },

      // jp: 로그아웃 시 로컬 관심종목 비우기 → 비회원 기본 7종목으로 복원
      clearLocal: () => {
        set({
          groups: [{ id: DEFAULT_GROUP_ID, name: '기본', order: 0, isDefault: true }],
          items: buildDefaultItems(),
        });
      },
    }),
    {
      name: 'watchlist-store-v2',
      migrate: (persisted: unknown, version: number) => {
        const state = persisted as { groups?: WatchlistGroup[]; items?: WatchlistItem[] };
        if (state?.groups) {
          state.groups = state.groups.map(g => ({
            ...g,
            isDefault: g.isDefault ?? (g.id === DEFAULT_GROUP_ID),
          }));
        }
        // jp: v2 이하(기본종목 도입 전)에서 올라오면, 비어있을 때 기본 7종목 채움
        // jp: (로그인 유저는 어차피 hydrateFromServer가 덮어쓰므로 안전)
        if (version < 2 && (!state?.items || state.items.length === 0)) {
          state.items = buildDefaultItems();
        }
        return state as never;
      },
      version: 2,
    }
  )
);

export const WATCHLIST_DEFAULT_GROUP_ID = DEFAULT_GROUP_ID;
export const WATCHLIST_MEMO_MAX_LENGTH = MEMO_MAX_LENGTH;
