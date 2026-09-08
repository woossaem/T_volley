import React, { useRef, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { formatPlayerDisplayName } from '../lib/tempPlayer';

export interface MatchEvent {
  id: string;
  match_id?: string;
  set_index: number;
  event_type: 'score' | 'sub' | 'manual' | 'fault';
  team_type: 'host' | 'away';
  player_id?: string | null;
  player_name?: string | null;
  sub_out_id?: string | null;
  sub_out_name?: string | null;
  host_score: number;
  away_score: number;
  is_canceled: boolean;
}

interface Props {
  events: MatchEvent[];
  canControl: boolean;
  displayHostName: string;
  displayAwayName: string;
  currentSetIndex: number;
  compact?: boolean;
  onPressEvent?: (event: MatchEvent) => void;
  onEditEvent?: (event: MatchEvent) => void;
}

export default function ScoreTimeline({
  events = [],
  canControl,
  displayHostName,
  displayAwayName,
  currentSetIndex,
  compact = false,
  onPressEvent,
  onEditEvent,
}: Props) {
  const scrollViewRef = useRef<ScrollView>(null);
  const setKey = Number(currentSetIndex);

  const currentSetEvents = useMemo(() => {
    return (events || []).filter((e) => {
      if (Number(e?.set_index) === setKey) return true;
      const setNumber = Number((e as any)?.set_number);
      return Number.isFinite(setNumber) && setNumber === setKey + 1;
    });
  }, [events, setKey]);

  useEffect(() => {
    const timer = setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 80);
    return () => clearTimeout(timer);
  }, [currentSetEvents.length, setKey, currentSetEvents.map((e) => e.id).join('|')]);

  const renderChip = (ev: MatchEvent, content: string, isHost: boolean, isCanceled: boolean) => (
    <TouchableOpacity
      style={[
        styles.chip,
        compact && styles.chipCompact,
        isHost ? styles.hostBg : styles.awayBg,
        isCanceled && styles.canceledBg,
      ]}
      onPress={() => {
        if (!canControl) return;
        if (onPressEvent) onPressEvent(ev);
        else if (onEditEvent && !isCanceled && ev.event_type === 'score') onEditEvent(ev);
      }}
      disabled={!canControl}
      activeOpacity={0.7}
      hitSlop={8}
    >
      <Text
        style={[styles.text, compact && styles.textCompact, isHost ? styles.hostText : styles.awayText, isCanceled && styles.canceledText]}
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        {content}
      </Text>
    </TouchableOpacity>
  );

  return (
    <ScrollView
      ref={scrollViewRef}
      horizontal={true}
      showsHorizontalScrollIndicator={false}
      style={[styles.scroller, compact && styles.scrollerCompact]}
      contentContainerStyle={[styles.scroll, compact && styles.scrollCompact]}
    >
      {currentSetEvents.length === 0 && (
        <Text style={styles.emptyText}>{displayHostName} vs {displayAwayName} · {setKey + 1}세트 기록 없음</Text>
      )}

      {compact && currentSetEvents.length > 0 && (
        <View style={styles.compactRow}>
          {currentSetEvents.map((ev, index) => {
            const isHost = ev.team_type === 'host';
            const isCanceled = ev.is_canceled;
            const name = formatPlayerDisplayName(ev.player_id, ev.player_name);
            let content = '';
            if (ev.event_type === 'score') content = `${isHost ? ev.host_score : ev.away_score} (${name})`;
            else if (ev.event_type === 'fault') content = `${isHost ? ev.host_score : ev.away_score} ⚠${name}`;
            else if (ev.event_type === 'sub') content = `🔄 교체`;
            else content = `✏️ 보정`;
            return (
              <View key={`${ev.id}-${setKey}-${index}`} style={styles.compactChipWrap}>
                {renderChip(ev, content, isHost, isCanceled)}
              </View>
            );
          })}
        </View>
      )}

      {!compact && currentSetEvents.length > 0 && (
        <View style={styles.trackContainer}>
          <View style={styles.horizontalLine} />

          {currentSetEvents.map((ev, index) => {
            const isHost = ev.team_type === 'host';
            const isCanceled = ev.is_canceled;
            const name = formatPlayerDisplayName(ev.player_id, ev.player_name);

            let content = '';
            if (ev.event_type === 'score') {
              content = `${isHost ? ev.host_score : ev.away_score} (${name})`;
            } else if (ev.event_type === 'fault') {
              content = `${isHost ? ev.host_score : ev.away_score} ⚠${name}`;
            } else if (ev.event_type === 'sub') {
              content = `🔄 교체`;
            } else {
              content = `✏️ 보정`;
            }

            const chip = (
              <TouchableOpacity
                style={[styles.chip, isHost ? styles.hostBg : styles.awayBg, isCanceled && styles.canceledBg]}
                onPress={() => {
                  if (!canControl) return;
                  if (onPressEvent) onPressEvent(ev);
                  else if (onEditEvent && !isCanceled && ev.event_type === 'score') onEditEvent(ev);
                }}
                disabled={!canControl}
                activeOpacity={0.7}
                hitSlop={8}
              >
                <Text
                  style={[styles.text, isHost ? styles.hostText : styles.awayText, isCanceled && styles.canceledText]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {content}
                </Text>
              </TouchableOpacity>
            );

            return (
              <View key={`${ev.id}-${setKey}-${index}`} style={styles.eventColumn}>
                <View style={styles.topCell}>
                  {isHost && chip}
                </View>
                <View style={[styles.node, isHost ? styles.nodeHost : styles.nodeAway, isCanceled && styles.nodeCanceled]} />
                <View style={styles.bottomCell}>
                  {!isHost && chip}
                </View>
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroller: { flex: 1, overflow: 'hidden' },
  scroll: { paddingLeft: 4, paddingRight: 28, paddingVertical: 4, alignItems: 'center', minHeight: 88 },
  emptyText: { color: '#475569', fontSize: 12, fontWeight: '700', lineHeight: 16, includeFontPadding: false },
  trackContainer: { flexDirection: 'row', alignItems: 'center', position: 'relative', height: 84 },
  horizontalLine: { position: 'absolute', top: '50%', marginTop: -1, left: 0, right: 0, height: 2, backgroundColor: '#334155' },
  eventColumn: { width: 82, alignItems: 'center', height: '100%', justifyContent: 'center' },
  topCell: { flex: 1, justifyContent: 'flex-end', paddingBottom: 6, width: '100%', alignItems: 'center' },
  bottomCell: { flex: 1, justifyContent: 'flex-start', paddingTop: 6, width: '100%', alignItems: 'center' },
  node: { width: 10, height: 10, borderRadius: 5, zIndex: 2 },
  nodeHost: { backgroundColor: '#38BDF8', borderWidth: 2, borderColor: '#0C4A6E' },
  nodeAway: { backgroundColor: '#FB7185', borderWidth: 2, borderColor: '#4C0519' },
  nodeCanceled: { backgroundColor: '#64748B', borderColor: '#1E293B' },
  chip: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    minWidth: 68,
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  hostBg: { backgroundColor: '#0C4A6E', borderColor: '#0284C7' },
  awayBg: { backgroundColor: '#4C0519', borderColor: '#BE123C' },
  canceledBg: { backgroundColor: '#1E293B', borderColor: '#334155' },
  text: { fontSize: 11, fontWeight: '800', lineHeight: 16, includeFontPadding: false },
  hostText: { color: '#BAE6FD' },
  awayText: { color: '#FECDD3' },
  canceledText: { color: '#64748B', textDecorationLine: 'line-through' },
  scrollerCompact: { flexGrow: 1, flexShrink: 1, height: 44, maxHeight: 44 },
  scrollCompact: { minHeight: 40, paddingVertical: 2, paddingRight: 12, alignItems: 'center' },
  compactRow: { flexDirection: 'row', alignItems: 'center' },
  compactChipWrap: { marginRight: 4 },
  chipCompact: { minWidth: 56, paddingHorizontal: 6, paddingVertical: 3 },
  textCompact: { fontSize: 10, lineHeight: 16, includeFontPadding: false },
});
