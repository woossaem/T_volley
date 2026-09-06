import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import {
  ANONYMOUS_PLAYER_NAME,
  assignedUserId,
  clampLineCount,
  DEFAULT_LINE_COUNT,
  displaySlotPlayerName,
  isTempSlotId,
  lineSlotLabels,
  type CourtRow,
} from '../lib/roster';

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
  onSlotPress?: (player: CourtSlotPlayer, slotIndex: number) => void;
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
  const t = String(label);
  if (t.includes('세터')) return styles.posSetter;
  if (
    t.includes('레프트백') ||
    t.includes('센터백') ||
    t.includes('라이트백') ||
    t.includes('세컨백') ||
    t.includes('후위')
  ) return styles.posBack;
  if (t.includes('백차') || t.includes('센터') || t.includes('중앙')) return styles.posCenter;
  if (t.includes('라이트') || t.includes('우측') || t.includes('중우') || t.includes('서브')) return styles.posRight;
  if (t.includes('레프트') || t.includes('앞차') || t.includes('좌측') || t.includes('중좌')) return styles.posLeft;
  return styles.posFallback;
}

export default function CourtGrid({
  court,
  frontCount = DEFAULT_LINE_COUNT,
  middleCount = DEFAULT_LINE_COUNT,
  backCount = DEFAULT_LINE_COUNT,
  accent = '#86EFAC',
  compact = false,
  interactive = true,
  selectedId,
  highlightIndex = null,
  holding = false,
  teamLabel,
  layout = 'rows',
  courtSide = 'left',
  hideNet = false,
  disabled = false,
  emptySlotLabel,
  tone = 'court',
  onSlotPress,
}: CourtGridProps) {
  const front = clampLineCount(frontCount, DEFAULT_LINE_COUNT);
  const middle = clampLineCount(middleCount, DEFAULT_LINE_COUNT);
  const back = clampLineCount(backCount, DEFAULT_LINE_COUNT);
  const canPress = interactive && !disabled;
  const reverseCols = layout === 'columns' && courtSide === 'right';
  const slate = tone === 'slate';

  const renderSlot = (player: CourtSlotPlayer, idx: number, label: string, row: CourtRow) => {
    const empty = isEmptySlot(player);
    const selected = !!selectedId && selectedId === player.user_id;
    const highlighted = highlightIndex === idx;
    const name = isTempSlotId(player.user_id)
      ? displaySlotPlayerName(player.user_id, player.full_name, label)
      : (empty ? ANONYMOUS_PLAYER_NAME : (player.full_name || ANONYMOUS_PLAYER_NAME));
    const emptyText = emptySlotLabel ?? (compact ? '👤' : ANONYMOUS_PLAYER_NAME);
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
          holding && styles.slotDrop,
          selected && styles.slotSelected,
          highlighted && styles.slotHighlight,
          disabled && styles.slotDisabled,
        ]}
        onPress={() => { if (canPress) onSlotPress?.(player, idx); }}
        disabled={!canPress}
        activeOpacity={canPress ? 0.75 : 1}
      >
        <Text
          style={[
            styles.slotPos,
            compact && styles.slotPosCompact,
            positionLabelStyle(label),
          ]}
          numberOfLines={1}
        >
          {label}
        </Text>
        {empty ? (
          <Text style={[styles.slotEmptyText, compact && styles.slotEmptyTextCompact, slate && styles.slotTextSlate]} numberOfLines={1}>
            {emptyText}
          </Text>
        ) : (
          <Text style={[styles.slotName, compact && styles.slotNameCompact, slate && styles.slotTextSlate]} numberOfLines={1}>
            {name}
          </Text>
        )}
        {!compact && empty && !emptySlotLabel ? (
          <Text style={styles.slotAnonHint} numberOfLines={1}>{ANONYMOUS_PLAYER_NAME}</Text>
        ) : null}
      </TouchableOpacity>
    );
  };

  const renderRow = (row: CourtRow, offset: number, count: number, depth: number) => (
    <View style={[styles.slotRow, compact && styles.slotRowCompact, { zIndex: 3 - depth }]}>
      {rowSlots(court, offset, count, row, false).map(({ player, idx, label }) =>
        renderSlot(player, idx, label, row)
      )}
    </View>
  );

  const renderColumn = (row: CourtRow, offset: number, count: number, depth: number, caption: string) => (
    <View style={[styles.slotCol, compact && styles.slotColCompact, { zIndex: 3 - depth }]}>
      {!compact ? <Text style={styles.colCaption} numberOfLines={1}>{caption}</Text> : null}
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
        layout === 'columns' && styles.courtColumns,
        disabled && styles.courtDisabled,
      ]}
      pointerEvents={canPress ? 'auto' : 'box-none'}
    >
      {teamLabel ? <Text style={styles.teamLabel} numberOfLines={1}>{teamLabel}</Text> : null}
      {layout === 'columns' ? (
        <View style={styles.columnsRow}>
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
          {!compact ? <Text style={styles.rowCaption}>전위</Text> : null}
          {renderRow('front', 0, front, 0)}
          {!compact ? <Text style={styles.rowCaption}>중위</Text> : null}
          {renderRow('middle', front, middle, 1)}
          {!compact ? <Text style={styles.rowCaption}>후위</Text> : null}
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
    paddingBottom: 12,
  },
  slotSlate: {
    backgroundColor: '#334155',
    borderRadius: 8,
    borderWidth: 0,
    borderColor: 'transparent',
    borderStyle: 'solid',
    shadowOpacity: 0,
    elevation: 0,
  },
  slotPosSlate: { color: '#94A3B8' },
  slotTextSlate: { color: '#F8FAFC' },
  posSetter: { color: '#F59E0B', fontWeight: '800' },
  posLeft: { color: '#10B981', fontWeight: '700' },
  posCenter: { color: '#A855F7', fontWeight: '700' },
  posRight: { color: '#F43F5E', fontWeight: '700' },
  posBack: { color: '#38BDF8', fontWeight: '600' },
  posFallback: { color: '#94A3B8', fontWeight: '700' },
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
  slotRowCompact: { gap: 0, marginBottom: 0 },
  columnsRow: { flexGrow: 1, flexShrink: 1, flexDirection: 'row', gap: 2, minHeight: 0, width: '100%', alignItems: 'stretch' },
  slotCol: { flex: 1, minWidth: 0, gap: 4 },
  slotColCompact: { flex: 1, minWidth: 0, width: undefined, gap: 2, flexGrow: 1, flexShrink: 1 },
  slot: {
    flex: 1,
    minHeight: 44,
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  slotCompact: {
    minHeight: 24,
    paddingVertical: 2,
    paddingHorizontal: 3,
    margin: 1,
    borderRadius: 4,
    shadowOpacity: 0,
    elevation: 0,
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
  slotSelected: { borderColor: '#38BDF8', borderWidth: 2, backgroundColor: '#1E3A8A', borderStyle: 'solid' },
  slotHighlight: { borderColor: '#38BDF8', borderWidth: 2, borderStyle: 'solid' },
  slotDisabled: { opacity: 0.85 },
  slotPos: { fontSize: 9, lineHeight: 11, fontWeight: '800', color: '#BBF7D0', marginBottom: 2, includeFontPadding: false },
  slotPosCompact: { fontSize: 9, lineHeight: 11, color: '#64748B', marginBottom: 0, fontWeight: '700', includeFontPadding: false },
  slotName: { fontSize: 11, lineHeight: 14, fontWeight: '900', color: '#F8FAFC', includeFontPadding: false },
  slotNameCompact: { fontSize: 11, lineHeight: 14, fontWeight: '800', color: '#F8FAFC', includeFontPadding: false },
  slotEmptyText: { fontSize: 10, lineHeight: 13, fontWeight: '700', color: '#64748B', includeFontPadding: false },
  slotEmptyTextCompact: { fontSize: 10, lineHeight: 13, fontWeight: '700', color: '#64748B', includeFontPadding: false },
  slotAnonHint: { fontSize: 8, fontWeight: '700', color: '#FDE68A', marginTop: 1 },
});
