import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import {
  ANONYMOUS_PLAYER_NAME,
  assignedUserId,
  clampLineCount,
  DEFAULT_LINE_COUNT,
  displaySlotPlayerName,
  formatTempGuestLabel,
  formatTempTagLabel,
  isRegisteredUserId,
  isTempSlotId,
  lineSlotLabels,
  type CourtRow,
} from '../lib/roster';
import { getSafeDisplayName } from '../lib/utils';
import { IOS_SHADOW_GLOW, IOS_SHADOW_NONE, IOS_SHADOW_SOFT } from '../lib/nativeSafe';
import { POSITION_GROUP_COLORS, positionGroupOf } from '../lib/positionGroups';

export interface CourtSlotPlayer {
  user_id: string | null;
  full_name: string;
}

interface CourtGridProps {
  court: CourtSlotPlayer[];
  frontCount?: number;
  middleCount?: number;
  backCount?: number;
  accent?: string;
  compact?: boolean;
  interactive?: boolean;
  selectedId?: string | null;
  selectedIndex?: number | null;
  highlightIndex?: number | null;
  holding?: boolean;
  teamLabel?: string;
  /** columns: 세로 슬롯 열. A팀(left) 외곽→네트 = 후위|중위|전위. B팀(right) 점대칭 = 전위|중위|후위 + 열 상하반전 */
  layout?: 'rows' | 'columns';
  courtSide?: 'left' | 'right';
  hideNet?: boolean;
  disabled?: boolean;
  emptySlotLabel?: string;
  /** slate: 모달용 매트 다크. court: 포메이션 기본 그린 코트 */
  tone?: 'court' | 'slate';
  /** 득점/범실 버튼: 포지션 16px Bold / 선수명 12px */
  positionEmphasis?: boolean;
  hideRowLabels?: boolean;
  enlarge?: boolean;
  onSlotPress?: (player: CourtSlotPlayer, slotIndex: number) => void;
  onTagPress?: (player: CourtSlotPlayer, slotIndex: number) => void;
}

function rowSlots(
  court: CourtSlotPlayer[],
  offset: number,
  count: number,
  row: CourtRow,
  reverse: boolean,
): { player: CourtSlotPlayer; idx: number; label: string }[] {
  const labels = lineSlotLabels(row, count);
  const items = labels.map((label, i) => {
    const idx = offset + i;
    const player = court[idx] || { user_id: null, full_name: ANONYMOUS_PLAYER_NAME };
    return { player, idx, label };
  });
  return reverse ? items.slice().reverse() : items;
}

function isEmptySlot(player: CourtSlotPlayer): boolean {
  return assignedUserId(player.user_id) === null;
}

function positionLabelStyle(label: string) {
  const group = positionGroupOf(label);
  if (group === 'attack') return styles.posAttack;
  if (group === 'control') return styles.posControl;
  if (group === 'defense') return styles.posDefense;
  return styles.posFallback;
}

export default function CourtGrid({
  court = [],
  frontCount = DEFAULT_LINE_COUNT,
  middleCount = DEFAULT_LINE_COUNT,
  backCount = DEFAULT_LINE_COUNT,
  accent = '#86EFAC',
  compact = false,
  interactive = true,
  selectedId,
  selectedIndex = null,
  highlightIndex = null,
  holding = false,
  teamLabel,
  layout = 'rows',
  courtSide = 'left',
  hideNet = false,
  disabled = false,
  emptySlotLabel,
  tone = 'court',
  positionEmphasis = false,
  hideRowLabels = false,
  enlarge = false,
  onSlotPress,
  onTagPress,
}: CourtGridProps) {
  const front = clampLineCount(frontCount, DEFAULT_LINE_COUNT);
  const middle = clampLineCount(middleCount, DEFAULT_LINE_COUNT);
  const back = clampLineCount(backCount, DEFAULT_LINE_COUNT);
  const canPress = interactive && !disabled;
  const reverseCols = layout === 'columns' && courtSide === 'right';
  const slate = tone === 'slate';

  const renderSlot = (player: CourtSlotPlayer, idx: number, label: string, row: CourtRow) => {
    const empty = isEmptySlot(player);
    const selected = selectedIndex === idx || (!!selectedId && !!player.user_id && selectedId === player.user_id);
    const highlighted = highlightIndex === idx;
    const tagLabel = formatTempTagLabel(player.user_id);
    const guestLabel = formatTempGuestLabel(player.user_id);
    const name = guestLabel
      || (isRegisteredUserId(player.user_id)
        ? getSafeDisplayName(player)
        : (isTempSlotId(player.user_id)
          ? (tagLabel ? label : displaySlotPlayerName(player.user_id, getSafeDisplayName(player), label))
          : (empty ? ANONYMOUS_PLAYER_NAME : getSafeDisplayName(player))));
    const emptyText = emptySlotLabel ?? (compact ? '👤' : ANONYMOUS_PLAYER_NAME);
    const group = positionGroupOf(label);
    const groupPalette = (positionEmphasis || enlarge) && group ? POSITION_GROUP_COLORS[group] : null;
    return (
      <TouchableOpacity
        key={`${row}-${idx}`}
        style={[
          styles.slot,
          compact && styles.slotCompact,
          layout === 'columns' && styles.slotColumn,
          compact && layout === 'columns' && styles.slotColumnCompact,
          empty ? styles.slotEmpty : styles.slotFilled,
          slate && styles.slotSlate,
          positionEmphasis && styles.slotEmphasis,
          enlarge && styles.slotEnlarge,
          groupPalette ? { backgroundColor: groupPalette.bg, borderColor: groupPalette.border } : null,
          holding && styles.slotDrop,
          selected && styles.slotSelected,
          highlighted && styles.slotHighlight,
          disabled && styles.slotDisabled,
        ]}
        onPress={() => { if (canPress) onSlotPress?.(player, idx); }}
        disabled={!canPress}
        activeOpacity={canPress ? 0.75 : 1}
        hitSlop={8}
      >
        {tagLabel ? (
          <TouchableOpacity
            style={styles.tagBadge}
            onPress={() => { if (canPress) onTagPress?.(player, idx); }}
            hitSlop={8}
            activeOpacity={0.8}
          >
            <Text style={styles.tagBadgeText} numberOfLines={1} ellipsizeMode="tail">{tagLabel}</Text>
          </TouchableOpacity>
        ) : null}
        <Text
          style={[
            styles.slotPos,
            compact && styles.slotPosCompact,
            positionEmphasis && styles.slotPosEmphasis,
            enlarge && styles.slotPosEnlarge,
            positionLabelStyle(label),
            groupPalette ? { color: groupPalette.pos } : null,
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={enlarge ? 0.8 : 0.55}
        >
          {label}
        </Text>
        {empty ? (
          <Text
            style={[
              styles.slotEmptyText,
              compact && styles.slotEmptyTextCompact,
              enlarge && styles.slotEmptyTextEnlarge,
              slate && styles.slotTextSlate,
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={enlarge ? 0.8 : 0.55}
          >
            {emptyText}
          </Text>
        ) : (
          <Text
            style={[
              styles.slotName,
              compact && styles.slotNameCompact,
              slate && styles.slotTextSlate,
              positionEmphasis && styles.slotNameEmphasis,
              enlarge && styles.slotNameEnlarge,
              groupPalette ? { color: groupPalette.name } : null,
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={enlarge ? 0.8 : 0.55}
          >
            {name}
          </Text>
        )}
        {!compact && !enlarge && !hideRowLabels && empty && !emptySlotLabel ? (
          <Text style={styles.slotAnonHint} numberOfLines={1}>{ANONYMOUS_PLAYER_NAME}</Text>
        ) : null}
      </TouchableOpacity>
    );
  };

  const renderRow = (row: CourtRow, offset: number, count: number, depth: number) => (
    <View style={[styles.slotRow, compact && styles.slotRowCompact, enlarge && styles.slotRowEnlarge, { zIndex: 3 - depth }]}>
      {rowSlots(court, offset, count, row, false).map(({ player, idx, label }) =>
        renderSlot(player, idx, label, row)
      )}
    </View>
  );

  const renderColumn = (row: CourtRow, offset: number, count: number, depth: number, caption: string) => (
    <View style={[styles.slotCol, compact && styles.slotColCompact, enlarge && styles.slotColEnlarge, { zIndex: 3 - depth }]}>
      {!compact && !hideRowLabels ? <Text style={styles.colCaption} numberOfLines={1}>{caption}</Text> : null}
      {rowSlots(court, offset, count, row, reverseCols).map(({ player, idx, label }) =>
        renderSlot(player, idx, label, row)
      )}
    </View>
  );

  const columns = courtSide === 'right'
    ? [
        { row: 'front' as const, offset: 0, count: front, depth: 0, caption: '전위' },
        { row: 'middle' as const, offset: front, count: middle, depth: 1, caption: '중위' },
        { row: 'back' as const, offset: front + middle, count: back, depth: 2, caption: '후위' },
      ]
    : [
        { row: 'back' as const, offset: front + middle, count: back, depth: 2, caption: '후위' },
        { row: 'middle' as const, offset: front, count: middle, depth: 1, caption: '중위' },
        { row: 'front' as const, offset: 0, count: front, depth: 0, caption: '전위' },
      ];

  return (
    <View
      style={[
        styles.court,
        slate ? styles.courtSlate : { borderColor: accent },
        compact && styles.courtCompact,
        enlarge && styles.courtEnlarge,
        layout === 'columns' && styles.courtColumns,
        disabled && styles.courtDisabled,
      ]}
      pointerEvents={canPress ? 'auto' : 'box-none'}
    >
      {teamLabel ? <Text style={styles.teamLabel} numberOfLines={1}>{teamLabel}</Text> : null}
      {layout === 'columns' ? (
        <View style={[styles.columnsRow, enlarge && styles.columnsRowEnlarge]}>
          {columns.map((col) => (
            <React.Fragment key={col.row}>
              {renderColumn(col.row, col.offset, col.count, col.depth, col.caption)}
            </React.Fragment>
          ))}
        </View>
      ) : (
        <>
          {!hideNet ? (
            <View style={[styles.netBar, slate && styles.netBarSlate]}>
              <Text style={[styles.netLabel, slate && styles.netLabelSlate]}>네트</Text>
            </View>
          ) : null}
          {!hideRowLabels && !compact ? <Text style={styles.rowCaption}>전위</Text> : null}
          {renderRow('front', 0, front, 0)}
          {!hideRowLabels && !compact ? <Text style={styles.rowCaption}>중위</Text> : null}
          {renderRow('middle', front, middle, 1)}
          {!hideRowLabels && !compact ? <Text style={styles.rowCaption}>후위</Text> : null}
          {renderRow('back', front + middle, back, 2)}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  court: {
    backgroundColor: '#166534',
    borderRadius: 12,
    padding: 6,
    borderWidth: 2,
    overflow: 'hidden',
    marginVertical: 2,
  },
  courtCompact: { padding: 2, borderRadius: 6, marginVertical: 0 },
  courtColumns: { flexGrow: 1, flexShrink: 1, minWidth: 0, minHeight: 0, width: '100%', alignSelf: 'stretch' },
  courtDisabled: { opacity: 0.72 },
  courtSlate: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    paddingBottom: 4,
  },
  slotSlate: {
    backgroundColor: '#334155',
    borderRadius: 8,
    borderWidth: 0,
    borderColor: 'transparent',
    borderStyle: 'solid',
    ...IOS_SHADOW_NONE,
  },
  slotPosSlate: { color: '#94A3B8' },
  slotTextSlate: { color: '#F8FAFC' },
  posAttack: { color: '#FCA5A5', fontWeight: '700' },
  posControl: { color: '#C7D2FE', fontWeight: '700' },
  posDefense: { color: '#99F6E4', fontWeight: '700' },
  posFallback: { color: '#94A3B8', fontWeight: '700' },
  slotEmphasis: { minHeight: 32, paddingVertical: 0, paddingHorizontal: 1, margin: 0 },
  slotPosEmphasis: { fontSize: 16, lineHeight: 17, fontWeight: '700', marginBottom: 0 },
  slotNameEmphasis: { fontSize: 14, lineHeight: 13, fontWeight: '500', color: '#FFFFFF' },
  netBarSlate: { backgroundColor: '#334155', borderColor: '#475569' },
  netLabelSlate: { color: '#94A3B8', letterSpacing: 2 },
  teamLabel: { color: '#F8FAFC', fontSize: 9, fontWeight: '900', textAlign: 'center', marginBottom: 1, includeFontPadding: false },
  netBar: {
    backgroundColor: '#14532D',
    borderRadius: 6,
    paddingVertical: 2,
    marginBottom: 2,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  netLabel: { textAlign: 'center', color: '#FDE68A', fontWeight: '900', fontSize: 9, letterSpacing: 1 },
  rowCaption: { fontSize: 8, fontWeight: '800', color: '#BBF7D0', marginBottom: 1, marginTop: 1 },
  colCaption: { fontSize: 8, fontWeight: '800', color: '#BBF7D0', textAlign: 'center', marginBottom: 1 },
  slotRow: { flexDirection: 'row', gap: 4, marginBottom: 4 },
  slotRowCompact: { gap: 1, marginBottom: 0 },
  slotRowEnlarge: { flex: 1, minHeight: 0, gap: 3, marginBottom: 3 },
  slotColEnlarge: { flex: 1, gap: 3, minHeight: 0 },
  columnsRowEnlarge: { flex: 1, gap: 3, minHeight: 0 },
  courtEnlarge: { flexGrow: 1, flexShrink: 1, minHeight: 0, padding: 2 },
  slotEnlarge: { minHeight: 0, paddingVertical: 3, paddingHorizontal: 4, margin: 0 },
  slotPosEnlarge: { fontSize: 16, lineHeight: 18, fontWeight: '700', marginBottom: 0 },
  slotNameEnlarge: { fontSize: 14, lineHeight: 16, fontWeight: '500', color: '#FFFFFF' },
  slotEmptyTextEnlarge: { fontSize: 14, lineHeight: 16, fontWeight: '800' },
  columnsRow: { flexGrow: 1, flexShrink: 1, flexDirection: 'row', gap: 2, minHeight: 0, width: '100%', alignItems: 'stretch' },
  slotCol: { flex: 1, minWidth: 0, gap: 4 },
  slotColCompact: { flex: 1, minWidth: 0, gap: 2, flexGrow: 1, flexShrink: 1 },
  slot: {
    flex: 1,
    minHeight: 44,
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    position: 'relative',
    overflow: 'visible',
    ...IOS_SHADOW_SOFT,
  },
  tagBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    zIndex: 4,
    backgroundColor: '#0F172A',
    borderRadius: 6,
    paddingHorizontal: 3,
    paddingVertical: 0,
    borderWidth: 1,
    borderColor: '#FBBF24',
  },
  tagBadgeText: {
    fontSize: 10,
    lineHeight: 12,
    includeFontPadding: false,
    fontWeight: '900',
    color: '#FDE68A',
  },
  slotCompact: {
    minHeight: 22,
    paddingVertical: 0,
    paddingHorizontal: 2,
    margin: 0,
    borderRadius: 4,
    ...IOS_SHADOW_NONE,
  },
  slotColumn: { minHeight: 0, flex: 1 },
  slotColumnCompact: {
    width: '100%',
    minWidth: 0,
    minHeight: 0,
    maxWidth: '100%',
    flex: 1,
    flexGrow: 1,
    flexShrink: 1,
    paddingVertical: 1,
    paddingHorizontal: 2,
    margin: 0,
    overflow: 'hidden',
  },
  slotEmpty: { backgroundColor: '#F8FAFC', borderColor: '#94A3B8', borderStyle: 'dashed' },
  slotFilled: { backgroundColor: '#0F172A', borderColor: '#F8FAFC', borderStyle: 'solid' },
  slotDrop: { borderColor: '#FDE68A' },
  slotSelected: {
    borderColor: '#38BDF8',
    borderWidth: 2,
    backgroundColor: '#1E3A8A',
    borderStyle: 'solid',
    ...IOS_SHADOW_GLOW,
  },
  slotHighlight: {
    borderColor: '#38BDF8',
    borderWidth: 2,
    borderStyle: 'solid',
    ...IOS_SHADOW_GLOW,
  },
  slotDisabled: { opacity: 0.85 },
  slotPos: { fontSize: 9, lineHeight: 11, fontWeight: '800', color: '#BBF7D0', marginBottom: 2, includeFontPadding: false },
  slotPosCompact: { fontSize: 9, lineHeight: 11, color: '#64748B', marginBottom: 0, fontWeight: '700', includeFontPadding: false },
  slotName: { fontSize: 11, lineHeight: 14, fontWeight: '900', color: '#F8FAFC', includeFontPadding: false },
  slotNameCompact: { fontSize: 11, lineHeight: 14, fontWeight: '800', color: '#F8FAFC', includeFontPadding: false },
  slotEmptyText: { fontSize: 10, lineHeight: 13, fontWeight: '700', color: '#64748B', includeFontPadding: false },
  slotEmptyTextCompact: { fontSize: 10, lineHeight: 13, fontWeight: '700', color: '#64748B', includeFontPadding: false },
  slotAnonHint: { fontSize: 8, fontWeight: '700', color: '#FDE68A', marginTop: 1 },
});
