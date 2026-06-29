// jp: 怨듭떆 移대뱶 而댄룷?뚰듃
// jp: ??移댄뀒怨좊━ ?쒓? 移?異붽? (?먮낯議곕떖/?몄옱/?낆옱/以묒슂)

import { Disclosure } from '@/types/disclosure';
import { formatRelativeTime, formatDisclosureDateTime, getDisclosureFreshness } from '@/utils/format';
import { ImportantDisclosureBadge } from './ImportantDisclosureBadge';
import { ExternalLink, Sparkles } from 'lucide-react';

interface DisclosureCardProps {
  disclosure: Disclosure;
  onClick: (disclosure: Disclosure) => void;
  showStock?: boolean;
}

// jp: 移댄뀒怨좊━ ?곷Ц ???쒓?
const CATEGORY_LABEL: Record<string, string> = {
  capital: '?먮낯議곕떖', good: '?몄옱', bad: '?낆옱', important: '以묒슂',
};

export function DisclosureCard({ disclosure, onClick, showStock = false }: DisclosureCardProps) {
  const isImportant = disclosure.importance !== 'normal';
  const freshness = getDisclosureFreshness(disclosure.disclosedAt);
  // jp: ?쇱そ 而щ윭諛???(?몄옱 珥덈줉 / ?낆옱쨌二쇱쓽 鍮④컯 / 以묐┰ ?뚯깋)
  const barColor =
    disclosure.sentiment === 'positive' ? 'var(--rise)' :
    disclosure.sentiment === 'negative' ? 'var(--fall)' :
    disclosure.sentiment === 'caution' ? '#FBBF24' :
    '#7F77DD';

  // jp: 移댄뀒怨좊━ ?쒓? (general ?대㈃ ?쒖떆 ????
  const catLabel = disclosure.category && disclosure.category !== 'general'
    ? (CATEGORY_LABEL[disclosure.category] ?? disclosure.category)
    : '';

  // jp: 二쇱꽍寃??媛??怨듭떆?몄? ???ъ뾽/遺꾧린/諛섍린蹂닿퀬?쒕줈 ?쒖옉?섎뒗 ?뺢린蹂닿퀬?쒕쭔 二쇱꽍 ?꾨쿋?⑸맖
  const hasNotes = /^(\uC0AC\uC5C5\uBCF4\uACE0\uC11C|\uBD84\uAE30\uBCF4\uACE0\uC11C|\uBC18\uAE30\uBCF4\uACE0\uC11C)/.test((disclosure.reportName || '').trim());

  return (
    <button
      onClick={() => onClick(disclosure)}
      className="w-full text-left p-4 rounded-2xl transition-all active:scale-[0.99]"
      style={{
        backgroundColor: isImportant ? (
          disclosure.sentiment === 'positive' ? 'var(--rise-bg)' :
          disclosure.sentiment === 'negative' ? 'var(--fall-bg)' :
          'var(--bg-card)'
        ) : 'var(--bg-card)',
        border: `1px solid ${isImportant ? (
          disclosure.sentiment === 'positive' ? 'var(--rise-subtle)' :
          disclosure.sentiment === 'negative' ? 'var(--fall-subtle)' :
          'var(--border)'
        ) : 'var(--border)'}`,
        borderLeft: `3px solid ${barColor}`,
      }}
    >
      {/* jp: 諛곗? & ?쒓컙 */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          {/* jp: ?띾낫(5遺?/NEW(30遺? 諛곗? */}
          {freshness === 'breaking' && (
            <span className="text-[9px] font-black px-1.5 py-0.5 rounded"
              style={{ background: 'var(--fall)', color: '#fff' }}>?띾낫</span>
          )}
          {freshness === 'new' && (
            <span className="text-[9px] font-black px-1.5 py-0.5 rounded"
              style={{ background: 'var(--accent)', color: '#fff' }}>NEW</span>
          )}
          <ImportantDisclosureBadge
            importance={disclosure.importance}
            sentiment={disclosure.sentiment}
          />
        </div>
        {/* jp: ?곷? ?쒓컙 */}
        <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
          {formatRelativeTime(disclosure.disclosedAt)}
        </span>
      </div>

      {/* jp: 醫낅ぉ紐?(?꾩껜 怨듭떆 ?붾㈃?먯꽌 ?쒖떆) */}
      {showStock && (
        <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
          {disclosure.stockName}
        </p>
      )}

      {/* jp: 二쇱꽍寃??媛??諛곗? ???ъ뾽/遺꾧린/諛섍린蹂닿퀬?쒖씪 ?뚮쭔 */}
      {hasNotes && (
        <div className="mb-1.5">
          <span
            className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-md"
            style={{ background: 'rgba(176,94,124,0.14)', color: '#B05E7C', border: '0.5px solid rgba(176,94,124,0.4)' }}
          >
            ?뱞 二쇱꽍寃??媛??          </span>
        </div>
      )}

      {/* jp: 怨듭떆 ?쒕ぉ */}
      <p className="text-sm font-semibold leading-snug mb-1.5" style={{ color: 'var(--text-primary)' }}>
        {disclosure.reportName}
      </p>

      {/* jp: 怨듭떆 ?쇱떆 - ????????遺?*/}
      <p className="text-[10px] mb-1.5" style={{ color: 'var(--text-tertiary)' }}>
        {formatDisclosureDateTime(disclosure.disclosedAt)}
      </p>

      {/* jp: ?붿빟 誘몃━蹂닿린 */}
      <p
        className="text-xs leading-relaxed line-clamp-2"
        style={{ color: 'var(--text-secondary)' }}
      >
        {disclosure.summary}
      </p>

      {/* jp: 移댄뀒怨좊━(?쒓?) + 怨듭떆 ?좏삎 */}
      <div className="flex items-center gap-2 mt-2">
        {catLabel && (
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{ background: 'rgba(127,119,221,0.18)', color: '#A78BFA' }}
          >
            {catLabel}
          </span>
        )}
        <span
          className="text-[10px] px-2 py-0.5 rounded-full"
          style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-tertiary)' }}
        >
          {disclosure.disclosureType}
        </span>
        <ExternalLink size={10} style={{ color: 'var(--text-tertiary)' }} />
        <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>?먮Ц 蹂닿린</span>
      </div>
      {/* jp: AI 遺꾩꽍 蹂닿린 (以묒슂 怨듭떆留? */}
      {isImportant && (
        <div className="flex items-center gap-1.5 mt-2.5 pt-2.5" style={{ borderTop: '1px solid var(--border)' }}>
          <Sparkles size={12} style={{ color: '#A78BFA' }} />
          <span className="text-[11px] font-semibold" style={{ color: '#A78BFA' }}>AI 遺꾩꽍 蹂닿린</span>
        </div>
      )}
    </button>
  );
}
