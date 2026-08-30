import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import {
  ANONYMOUS_PLAYER_NAME,
  clampLineCount,
  DEFAULT_LINE_COUNT,
  isAnonymousPlayer,
  isAnonymousSlotId,
  lineSlotLabels,
  type CourtRow,
} from '../lib/roster';

export interface CourtSlotPlayer {
  user_id: string;
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
  holding?: boolean;
  teamLabel?: string;
  onSlotPress?: (player: CourtSlotPlayer, slotIndex: number) => void;
}

function rowSlots(
  court: CourtSlotPlayer[],
  offset: number,
  count: number,
  row: CourtRow,
): { player: CourtSlotPlayer; idx: number; label: string }[] {
  const labels = lineSlotLabels(row, count);
  return labels.map((label, i) => {
    const idx = offset + i;
    const player = court[idx] || { user_id: `anon:${idx}`, full_name: ANONYMOUS_PLAYER_NAME };
    return { player, idx, label };
  });
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
  holding = false,
  teamLabel,
  onSlotPress,
}: CourtGridProps) {
  const front = clampLineCount(frontCount, DEFAULT_LINE_COUNT);
  const middle = clampLineCount(middleCount, DEFAULT_LINE_COUNT);
  const back = clampLineCount(backCount, DEFAULT_LINE_COUNT);

  const renderRow = (row: CourtRow, offset: number, count: number, depth: number) => (
    <View style={[styles.slotRow, compact && styles.slotRowCompact, { zIndex: 3 - depth }]}>
      {rowSlots(court, offset, count, row).map(({ player, idx, label }) => {
        const anon = isAnonymousSlotId(player.user_id) || isAnonymousPlayer(player);
        const selected = selectedId === player.user_id;
        const name = anon ? ANONYMOUS_PLAYER_NAME : (player.full_name || ANONYMOUS_PLAYER_NAME);
        return (
          <TouchableOpacity
            key={`${row}-${idx}`}
            style={[
              styles.slot,
              compact && styles.slotCompact,
              anon ? styles.slotEmpty : styles.slotFilled,
              holding && styles.slotDrop,
              selected && styles.slotSelected,
            ]}
            onPress={() => onSlotPress?.(player, idx)}
            disabled={!interactive}
            activeOpacity={interactive ? 0.75 : 1}
          >
            <Text style={[styles.slotPos, compact && styles.slotPosCompact]} numberOfLines={1}>{label}</Text>
            <Text style={[styles.slotName, compact && styles.slotNameCompact]} numberOfLines={1}>
              {anon ? '👤' : name}
            </Text>
            {!compact && anon ? <Text style={styles.slotAnonHint} numberOfLines={1}>{ANONYMOUS_PLAYER_NAME}</Text> : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );

  return (
    <View style={[styles.court, { borderColor: accent }, compact && styles.courtCompact]}>
      {teamLabel ? <Text style={styles.teamLabel} numberOfLines={1}>{teamLabel}</Text> : null}
      <View style={styles.netBar}>
        <Text style={styles.netLabel}>━━━━ 네트 ━━━━</Text>
      </View>
      <Text style={styles.rowCaption}>전위</Text>
      {renderRow('front', 0, front, 0)}
      <Text style={styles.rowCaption}>중위</Text>
      {renderRow('middle', front, middle, 1)}
      <Text style={styles.rowCaption}>후위</Text>
      {renderRow('back', front + middle, back, 2)}
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
  courtCompact: { padding: 6, borderRadius: 10, marginVertical: 2 },
  teamLabel: { color: '#F8FAFC', fontSize: 10, fontWeight: '900', textAlign: 'center', marginBottom: 2 },
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
  slotRow: { flexDirection: 'row', gap: 4, marginBottom: 4 },
  slotRowCompact: { gap: 4, marginBottom: 2 },
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
  slotCompact: { minHeight: 36, paddingVertical: 3 },
  slotEmpty: { backgroundColor: 'rgba(15,23,42,0.38)', borderColor: 'rgba(253,230,138,0.55)', borderStyle: 'dashed' },
  slotFilled: { backgroundColor: '#0F172A', borderColor: '#F8FAFC' },
  slotDrop: { borderColor: '#FDE68A' },
  slotSelected: { borderColor: '#38BDF8', borderWidth: 2, backgroundColor: '#1E3A8A' },
  slotPos: { fontSize: 9, fontWeight: '800', color: '#BBF7D0', marginBottom: 2 },
  slotPosCompact: { fontSize: 8, marginBottom: 1 },
  slotName: { fontSize: 11, fontWeight: '900', color: '#F8FAFC' },
  slotNameCompact: { fontSize: 10 },
  slotAnonHint: { fontSize: 8, fontWeight: '700', color: '#FDE68A', marginTop: 1 },
});
