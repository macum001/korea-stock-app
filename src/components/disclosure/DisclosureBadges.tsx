/**
 * DisclosureBadges.tsx
 * 공시 카드 & 상세 시트 공용 배지 컴포넌트
 *
 * 사용 방법:
 *   // useMemo로 classify 계산 (Hook 규칙 준수, early return 이전에 선언)
 *   const classify = useMemo(
 *     () => getDisclosureClassification(disclosure),
 *     [disclosure?.receiptNo, disclosure?.corpCls, disclosure?.issuerType],
 *   );
 *
 *   // 렌더
 *   {classify && <DisclosureBadges classification={classify} />}
 */

import React from 'react';
import {
  ISSUER_LABEL,
  ISSUER_STYLE,
  DISCLOSURE_LABEL,
  DISCLOSURE_STYLE,
  type DisclosureClassification,
  type IssuerType,
  type DisclosureType,
} from '@/utils/disclosureClassify';

// ── 단일 배지 알약 ─────────────────────────────────────────
interface BadgePillProps {
  label: string;
  bg: string;
  color: string;
  size?: 'sm' | 'xs';
}

export function BadgePill({ label, bg, color, size = 'sm' }: BadgePillProps) {
  return (
    <span
      className="inline-flex items-center rounded-full font-semibold whitespace-nowrap"
      style={{
        background: bg,
        color,
        fontSize:  size === 'xs' ? 9 : 10,
        padding:   size === 'xs' ? '2px 6px' : '2.5px 8px',
        border:    `1px solid ${color}30`,
        letterSpacing: '0.01em',
      }}
    >
      {label}
    </span>
  );
}

// ── 발행사 유형 배지 ──────────────────────────────────────
export function IssuerBadge({
  issuerType,
  size = 'sm',
}: {
  issuerType: IssuerType;
  size?: 'sm' | 'xs';
}) {
  const { bg, color } = ISSUER_STYLE[issuerType];
  return (
    <BadgePill label={ISSUER_LABEL[issuerType]} bg={bg} color={color} size={size} />
  );
}

// ── 공시 유형 배지 ────────────────────────────────────────
export function DisclosureTypeBadge({
  disclosureType,
  size = 'sm',
}: {
  disclosureType: DisclosureType;
  size?: 'sm' | 'xs';
}) {
  const { bg, color } = DISCLOSURE_STYLE[disclosureType];
  return (
    <BadgePill label={DISCLOSURE_LABEL[disclosureType]} bg={bg} color={color} size={size} />
  );
}

// ── 배지 묶음 ─────────────────────────────────────────────
interface DisclosureBadgesProps {
  classification: DisclosureClassification;
  size?: 'sm' | 'xs';
  className?: string;
}

export function DisclosureBadges({
  classification,
  size = 'sm',
  className = '',
}: DisclosureBadgesProps) {
  const { issuerType, disclosureType } = classification;

  // 공시 유형 배지: 'other'면 생략. SPC + bond_abs 중복은 classifyDisclosure에서 이미 처리됨
  const showDiscType =
    disclosureType !== 'other' &&
    DISCLOSURE_LABEL[disclosureType] !== ISSUER_LABEL[issuerType];

  return (
    <div className={`flex flex-wrap items-center gap-1 ${className}`}>
      <IssuerBadge issuerType={issuerType} size={size} />
      {showDiscType && (
        <DisclosureTypeBadge disclosureType={disclosureType} size={size} />
      )}
    </div>
  );
}

// ── 상세 정보 없음 안내 박스 ──────────────────────────────
// DisclosureSummarySheet의 "상세 정보 없음" 영역을 대체합니다.
interface DetailUnavailableBoxProps {
  classification: DisclosureClassification;
  onOpenDart?: () => void;
}

export function DetailUnavailableBox({
  classification,
  onOpenDart,
}: DetailUnavailableBoxProps) {
  const { issuerType, detailAvailability } = classification;
  const isSpc      = issuerType === 'spc';
  const isUnlisted = issuerType === 'unlisted';
  const isWarning  = isSpc || isUnlisted;

  // SPC/비상장은 amber, 나머지는 기본 accent
  const colors = isWarning
    ? { bg: 'rgba(251,191,36,0.06)', border: 'rgba(251,191,36,0.28)', icon: '#FBBF24' }
    : { bg: 'var(--bg-card)',         border: 'var(--accent-border)',   icon: '#A78BFA' };

  const title = isSpc
    ? 'SPC/유동화전문회사 공시예요'
    : isUnlisted
    ? '비상장 기업 공시예요'
    : '상세 탭 데이터를 찾지 못했어요';

  return (
    <div
      className="mt-3 p-3.5 rounded-2xl"
      style={{ background: colors.bg, border: `1px solid ${colors.border}` }}
    >
      {/* 헤더 행: 제목 + 배지 */}
      <div className="flex items-center gap-2 mb-1.5">
        <span style={{ fontSize: 14, color: colors.icon, flexShrink: 0 }}>
          {isWarning ? '⚠️' : 'ℹ️'}
        </span>
        <span
          className="text-[12px] font-bold flex-1"
          style={{ color: 'var(--text-primary)' }}
        >
          {title}
        </span>
        {/* 우측 배지 (xs 크기) */}
        <DisclosureBadges classification={classification} size="xs" />
      </div>

      {/* 안내 문구 */}
      <p
        className="text-[11px] leading-relaxed"
        style={{ color: 'var(--text-secondary)' }}
      >
        {detailAvailability.reason}
      </p>

      {/* DART 바로가기 버튼 */}
      {onOpenDart && (
        <button
          onClick={onOpenDart}
          className="mt-2.5 inline-flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-lg active:scale-95 transition-all"
          style={{
            background: 'rgba(92,138,255,0.12)',
            color:      '#5C8AFF',
            border:     '1px solid rgba(92,138,255,0.28)',
          }}
        >
          <span style={{ fontSize: 12 }}>↗</span>
          DART 원문 바로가기
        </button>
      )}
    </div>
  );
}
