import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { TEAM_COLORS } from '../constants/Colors';

export type LineupPlayerView = {
  id: string;
  name: string;
  badge: string;
  position?: string;
  isCaptain?: boolean;
};

export type TeamLineupView = {
  teamName: string;
  court: LineupPlayerView[];
  bench: LineupPlayerView[];
};

type TeamLineupPanelProps = {
  team?: { name?: string | null } | null;
  lineup?: TeamLineupView | null;
  side: 'left' | 'right';
  variant?: 'sidebar' | 'sheet' | 'compare';
  servingPlayerId?: string | null;
  teamTone?: 'host' | 'away';
};

const HOST_ACCENT = TEAM_COLORS.host;
const AWAY_ACCENT = TEAM_COLORS.away;

export default function TeamLineupPanel({
  team,
  lineup,
  side,
  variant = 'sidebar',
  servingPlayerId,
  teamTone,
}: TeamLineupPanelProps) {
  const teamName = lineup?.teamName || team?.name || (side === 'left' ? '홈 팀' : '어웨이 팀');
  const court = lineup?.court || [];
  const bench = lineup?.bench || [];
  const tone = teamTone || (side === 'left' ? 'host' : 'away');
  const accent = tone === 'host' ? HOST_ACCENT : AWAY_ACCENT;
  const sheet = variant === 'sheet';
  const compare = variant === 'compare';
  const compact = sheet || compare;
  const playerList = (
    <>
      {court.length === 0 ? (
        <Text style={[styles.empty, compact && styles.emptyCompact]}>라인업 없음</Text>
      ) : (
        court.map((player, idx) => {
          const serving = !!servingPlayerId && player.id === servingPlayerId;
          return (
          <View
            key={`${player.id}-${idx}`}
            style={[
              styles.row,
              compact && styles.rowCompact,
              serving && styles.rowServing,
            ]}
          >
            <View style={[styles.badge, { backgroundColor: accent }, compact && styles.badgeCompact, serving && styles.badgeServing]}>
              <Text style={[styles.badgeText, compact && styles.badgeTextCompact]}>{serving ? 'BALL' : (player.badge || '·')}</Text>
            </View>
            <View style={styles.playerMeta}>
              <Text style={[styles.playerName, compact && styles.playerNameCompact]} numberOfLines={1}>{player.name}</Text>
              {(player.position || player.isCaptain || serving) ? (
                <Text style={[styles.playerPos, compact && styles.playerPosCompact]} numberOfLines={1}>
                  {serving ? '서브(BALL)' : ''}
                  {serving && player.position ? ' · ' : ''}
                  {player.position || ''}
                  {player.isCaptain ? <Text style={styles.captainMark}> (C)</Text> : null}
                </Text>
              ) : null}
            </View>
          </View>
          );
        })
      )}
      {bench.length > 0 ? (
        <>
          <View style={[styles.benchDivider, compact && styles.benchDividerCompact]} />
          <Text style={[styles.benchLabel, compact && styles.benchLabelCompact]}>대기 명단</Text>
          {bench.map((player, idx) => (
            <View key={`bench-${player.id}-${idx}`} style={[styles.benchRow, compact && styles.rowCompact]}>
              <View style={[styles.badge, styles.benchBadge, compact && styles.badgeCompact]}>
                <Text style={[styles.benchBadgeText, compact && styles.badgeTextCompact]}>{player.badge}</Text>
              </View>
              <Text style={[styles.benchName, compact && styles.benchNameCompact]} numberOfLines={1}>{player.name}</Text>
            </View>
          ))}
        </>
      ) : null}
    </>
  );

  return (
    <View style={[
      styles.panel,
      side === 'left' ? { borderLeftColor: accent } : { borderRightColor: accent },
      sheet && styles.panelSheet,
      compare && styles.panelCompare,
    ]}>
      <View style={[styles.headerBar, { backgroundColor: accent }, compact && styles.headerBarCompact]}>
        <Text style={[styles.header, compact && styles.headerCompact]} numberOfLines={2}>
          {teamName} 선발 라인업
        </Text>
      </View>
      {compare ? <View>{playerList}</View> : (
        <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
          {playerList}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    width: 236,
    maxWidth: 250,
    minWidth: 220,
    height: '92%',
    maxHeight: 720,
    backgroundColor: 'rgba(20, 24, 33, 0.8)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 8,
    borderLeftWidth: 3,
    borderRightWidth: 3,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    marginHorizontal: 8,
  },
  panelSheet: {
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
    height: undefined,
    maxHeight: undefined,
    flex: 1,
    marginHorizontal: 0,
  },
  panelCompare: {
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
    height: undefined,
    maxHeight: undefined,
    flex: 1,
    marginHorizontal: 0,
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 6,
  },
  headerBar: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginBottom: 10,
  },
  headerBarCompact: {
    marginBottom: 6,
    paddingVertical: 4,
  },
  header: {
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
    color: '#FFFFFF',
  },
  headerCompact: {
    fontSize: 11,
    marginBottom: 0,
    lineHeight: 15,
  },
  list: { flex: 1 },
  empty: { color: '#64748B', fontSize: 12, fontWeight: '600' },
  emptyCompact: { fontSize: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingVertical: 2,
    paddingHorizontal: 2,
  },
  rowServing: {
    borderColor: '#FDE68A',
    backgroundColor: 'rgba(253, 230, 138, 0.12)',
  },
  badgeServing: { backgroundColor: '#F59E0B' },
  rowCompact: {
    gap: 5,
    marginBottom: 4,
  },
  badge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeCompact: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  badgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  badgeTextCompact: { fontSize: 9 },
  playerMeta: { flex: 1, minWidth: 0 },
  playerName: { color: '#F8FAFC', fontSize: 13, fontWeight: '800' },
  playerNameCompact: { fontSize: 11 },
  playerPos: { color: '#94A3B8', fontSize: 10, fontWeight: '700', marginTop: 1 },
  playerPosCompact: { fontSize: 9, marginTop: 0 },
  captainMark: { color: '#94A3B8', fontSize: 9, fontWeight: '600' },
  benchDivider: {
    height: 1,
    backgroundColor: 'rgba(148, 163, 184, 0.25)',
    marginVertical: 8,
  },
  benchDividerCompact: { marginVertical: 5 },
  benchLabel: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '800',
    marginBottom: 6,
  },
  benchLabelCompact: { fontSize: 9, marginBottom: 4 },
  benchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  benchBadge: { backgroundColor: '#334155' },
  benchBadgeText: { color: '#E2E8F0', fontSize: 10, fontWeight: '800' },
  benchName: { color: '#CBD5E1', fontSize: 12, fontWeight: '700', flex: 1 },
  benchNameCompact: { fontSize: 10 },
});
