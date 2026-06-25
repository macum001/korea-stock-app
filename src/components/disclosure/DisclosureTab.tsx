// jp: 종목 상세 공시 탭

import { useState } from 'react';
import { Disclosure, DisclosureFilter } from '@/types/disclosure';
import { useDisclosures } from '@/hooks/useDisclosures';
import { DisclosureCard } from './DisclosureCard';
import { DisclosureFilterBar } from './DisclosureFilter';
import { DisclosureSummarySheet } from './DisclosureSummarySheet';
import { SkeletonCard } from '@/components/common/SkeletonCard';
import { Search, X } from 'lucide-react';

interface DisclosureTabProps {
  stockCode: string;
}

export function DisclosureTab({ stockCode }: DisclosureTabProps) {
  const [selected, setSelected] = useState<Disclosure | null>(null);
  const [filter, setFilter] = useState<DisclosureFilter>({});
  const [search, setSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  const filterWithSearch: DisclosureFilter = { ...filter, keyword: search || undefined };
  const { disclosures, loading } = useDisclosures(stockCode, filterWithSearch);

  return (
    <>
      <div className="pt-4">
        {/* jp: 검색 바 */}
        <div className="px-4 mb-3">
          {showSearch ? (
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-xl"
              style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
            >
              <Search size={15} style={{ color: 'var(--text-tertiary)' }} />
              <input
                autoFocus
                type="text"
                placeholder="공시 검색"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 text-sm bg-transparent outline-none"
                style={{ color: 'var(--text-primary)' }}
              />
              <button onClick={() => { setSearch(''); setShowSearch(false); }}>
                <X size={15} style={{ color: 'var(--text-tertiary)' }} />
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                공시 {disclosures.length > 0 && `(${disclosures.length})`}
              </p>
              <button
                onClick={() => setShowSearch(true)}
                className="w-8 h-8 flex items-center justify-center rounded-full"
                style={{ backgroundColor: 'var(--bg-elevated)' }}
              >
                <Search size={15} style={{ color: 'var(--text-secondary)' }} />
              </button>
            </div>
          )}
        </div>

        {/* jp: 필터 */}
        <DisclosureFilterBar filter={filter} onChange={setFilter} />

        {/* jp: 공시 리스트 */}
        <div className="px-4 mt-3 space-y-3 pb-6">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)
          ) : disclosures.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                공시 정보가 없어요
              </p>
            </div>
          ) : (
            disclosures.map((d) => (
              <DisclosureCard
                key={d.id}
                disclosure={d}
                onClick={setSelected}
              />
            ))
          )}
        </div>
      </div>

      {/* jp: 상세 바텀 시트 */}
      <DisclosureSummarySheet
        disclosure={selected}
        isOpen={!!selected}
        onClose={() => setSelected(null)}
      />
    </>
  );
}
