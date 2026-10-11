import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Platform } from 'react-native';
import { formatPlayerDisplayName } from '../lib/tempPlayer';
import {
  exactActionLabel,
  formatEventClock,
  positionLabelOf,
  timelineBadgeStyle,
  timelineChipText,
  timelineToneOf,
} from '../lib/timelineBadge';

export interface MatchEvent {
  id: string;
  match_id?: string;
  set_index: number;
  event_type: 'score' | 'sub' | 'manual' | 'fault' | 'dig' | 'block' | 'ace' | 'receive' | 'assist' | 'effective_block' | 'attack' | 'feint' | 'quick_attack' | 'back_attack' | 'cover' | 'process' | 'serve_fault' | string;
  action_code?: string | null;
  team_type: 'host' | 'away';
  player_id?: string | null;
  player_name?: string | null;
  sub_out_id?: string | null;
  sub_out_name?: string | null;
  position_slot?: number | null;
  host_score: number;
  away_score: number;
  is_canceled: boolean;
  created_at?: string | null;
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

type TipState = {
  event: MatchEvent;
  x: number;
  y: number;
  pinned: boolean;
};

function isHostTeam(event: MatchEvent): boolean {
  const team = String(event.team_type || '').trim().toLowerCase();
  return team === 'host' || team === 'a' || team === 'home';
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
  const rootRef = useRef<View>(null);
  const chipRefs = useRef<Record<string, View | null>>({});
  const hoverCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [rootWidth, setRootWidth] = useState(0);
  const [tip, setTip] = useState<TipState | null>(null);
  const setKey = Number(currentSetIndex);

  const currentSetEvents = useMemo(() => {
    return (events || []).filter((event) => {
      if (Number(event?.set_index) === setKey) return true;
      const setNumber = Number((event as { set_number?: number })?.set_number);
      return Number.isFinite(setNumber) && setNumber === setKey + 1;
    });
  }, [events, setKey]);

  const eventKey = currentSetEvents.map((event) => `${event.id}:${event.action_code || ''}:${event.event_type}:${event.team_type}:${event.is_canceled ? 1 : 0}`).join('|');

  useEffect(() => {
    const timer = setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 80);
    return () => clearTimeout(timer);
  }, [eventKey, setKey]);

  useEffect(() => {
    if (!tip) return;
    if (!currentSetEvents.some((event) => event.id === tip.event.id)) setTip(null);
  }, [currentSetEvents, tip]);

  useEffect(() => () => {
    if (hoverCloseTimer.current) clearTimeout(hoverCloseTimer.current);
  }, []);

  const cancelHoverClose = () => {
    if (hoverCloseTimer.current) clearTimeout(hoverCloseTimer.current);
  };

  const scheduleHoverClose = (eventId: string) => {
    cancelHoverClose();
    hoverCloseTimer.current = setTimeout(() => {
      setTip((current) => (current && !current.pinned && current.event.id === eventId ? null : current));
    }, 220);
  };

  const placeTip = (event: MatchEvent, pinned: boolean) => {
    const node = chipRefs.current[event.id];
    const root = rootRef.current;
    if (!node || !root) {
      setTip({ event, x: 8, y: 8, pinned });
      return;
    }
    node.measureLayout(
      root,
      (x, y) => setTip({ event, x, y, pinned }),
      () => setTip({ event, x: 8, y: 8, pinned }),
    );
  };

  const renderChip = (event: MatchEvent) => {
    const canceled = !!event.is_canceled;
    const playerName = formatPlayerDisplayName(event.player_id, event.player_name, positionLabelOf(event.position_slot));
    const label = timelineChipText(event, playerName);
    const palette = timelineBadgeStyle(event);
    return (
      <Pressable
        ref={(node) => { chipRefs.current[event.id] = node; }}
        style={[
          styles.chip,
          compact && styles.chipCompact,
          {
            backgroundColor: palette.backgroundColor,
            borderColor: palette.borderColor,
          },
          canceled && styles.chipCanceled,
        ]}
        onPress={() => {
          if (tip?.pinned && tip.event.id === event.id) {
            setTip(null);
            return;
          }
          placeTip(event, true);
        }}
        onLongPress={() => {
          if (!canControl) return;
          if (onPressEvent) onPressEvent(event);
          else if (onEditEvent && !canceled && event.event_type === 'score') onEditEvent(event);
        }}
        onHoverIn={() => {
          cancelHoverClose();
          if (tip?.pinned) return;
          placeTip(event, false);
        }}
        onHoverOut={() => scheduleHoverClose(event.id)}
        delayLongPress={420}
      >
        <Text
          style={[
            styles.chipText,
            compact && styles.chipTextCompact,
            { color: palette.color },
            canceled && styles.chipTextCanceled,
          ]}
          numberOfLines={1}
        >
          {label}
        </Text>
      </Pressable>
    );
  };

  const tipEvent = tip ? currentSetEvents.find((event) => event.id === tip.event.id) || tip.event : null;
  const tipPlayer = tipEvent
    ? formatPlayerDisplayName(tipEvent.player_id, tipEvent.player_name, positionLabelOf(tipEvent.position_slot))
    : '';
  const tipSide = !tipEvent
    ? 'host'
    : ((timelineToneOf(tipEvent) === 'fault' || timelineToneOf(tipEvent) === 'serve_fault')
      ? (tipEvent.team_type === 'host' ? 'away' : 'host')
      : (tipEvent.team_type === 'away' ? 'away' : 'host'));
  const tipLeft = tip ? Math.min(Math.max(0, tip.x), Math.max(0, rootWidth - 236)) : 0;
  const tipTop = tip ? tip.y - 112 : 0;

  return (
    <View
      ref={rootRef}
      style={[styles.root, compact && styles.rootCompact]}
      onLayout={(layoutEvent) => setRootWidth(layoutEvent.nativeEvent.layout.width)}
    >
      {tipEvent ? (
        <Pressable
          style={[styles.popup, { left: tipLeft, top: tipTop }]}
          onHoverIn={cancelHoverClose}
          onHoverOut={() => { if (tip) scheduleHoverClose(tip.event.id); }}
        >
          <View style={styles.popupCard}>
            <Text style={styles.popupTitle}>{exactActionLabel(tipEvent)}</Text>
            <Text style={styles.popupLine}>세트  {Number(tipEvent.set_index) + 1}세트</Text>
            <Text style={styles.popupLine}>발생 시각  {formatEventClock(tipEvent.created_at)}</Text>
            <Text style={styles.popupLine}>포지션  {positionLabelOf(tipEvent.position_slot) || '기록 없음'}</Text>
            <Text style={styles.popupLine} numberOfLines={1}>선수 이름  {tipPlayer || '선수 미상'}</Text>
            <Text style={styles.popupLine}>정확한 액션  {exactActionLabel(tipEvent)}</Text>
            <Text style={styles.popupMeta} numberOfLines={1}>
              {tipSide === 'away' ? displayAwayName : displayHostName}
              {'  '}
              {Number(tipEvent.host_score) || 0}:{Number(tipEvent.away_score) || 0}
              {canControl ? '  ·  길게 누르면 삭제' : ''}
            </Text>
          </View>
        </Pressable>
      ) : null}

      <ScrollView
        ref={scrollViewRef}
        horizontal
        showsHorizontalScrollIndicator={Platform.OS === 'web'}
        style={styles.scroller}
        contentContainerStyle={[styles.scroll, compact && styles.scrollCompact]}
      >
        {currentSetEvents.length === 0 ? (
          <Text style={styles.emptyText}>{displayHostName} vs {displayAwayName} · {setKey + 1}세트 기록 없음</Text>
        ) : null}

        {compact && currentSetEvents.length > 0 ? (
          <View style={styles.compactRow}>
            {currentSetEvents.map((event, index) => (
              <View key={`${event.id}-${setKey}-${index}`} style={styles.compactChipWrap}>
                {renderChip(event)}
              </View>
            ))}
          </View>
        ) : null}

        {!compact && currentSetEvents.length > 0 ? (
          <View style={styles.trackContainer}>
            <View style={styles.horizontalLine} />
            {currentSetEvents.map((event, index) => {
              const host = isHostTeam(event);
              const canceled = !!event.is_canceled;
              return (
                <View key={`${event.id}-${setKey}-${index}`} style={styles.eventColumn}>
                  <View style={styles.topCell}>{host ? renderChip(event) : null}</View>
                  <View style={[styles.node, host ? styles.nodeHost : styles.nodeAway, canceled && styles.nodeCanceled]} />
                  <View style={styles.bottomCell}>{host ? null : renderChip(event)}</View>
                </View>
              );
            })}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 84, overflow: 'visible', position: 'relative' },
  rootCompact: { minHeight: 44 },
  scroller: { flex: 1, overflow: 'hidden' },
  scroll: { paddingLeft: 4, paddingRight: 28, paddingVertical: 2, alignItems: 'center', minHeight: 84 },
  scrollCompact: { minHeight: 40, paddingVertical: 2, paddingRight: 12 },
  emptyText: { color: '#475569', fontSize: 12, fontWeight: '700', lineHeight: 16 },
  trackContainer: { flexDirection: 'row', alignItems: 'center', position: 'relative', height: 84 },
  horizontalLine: { position: 'absolute', top: '50%', marginTop: -1, left: 0, right: 0, height: 2, backgroundColor: '#334155' },
  eventColumn: { minWidth: 78, maxWidth: 220, alignItems: 'center', height: '100%', justifyContent: 'center', paddingHorizontal: 3 },
  topCell: { flex: 1, justifyContent: 'flex-end', paddingBottom: 6, alignItems: 'center' },
  bottomCell: { flex: 1, justifyContent: 'flex-start', paddingTop: 6, alignItems: 'center' },
  node: { width: 10, height: 10, borderRadius: 5, zIndex: 2 },
  nodeHost: { backgroundColor: '#38BDF8', borderWidth: 2, borderColor: '#0C4A6E' },
  nodeAway: { backgroundColor: '#FB7185', borderWidth: 2, borderColor: '#4C0519' },
  nodeCanceled: { backgroundColor: '#64748B', borderColor: '#1E293B' },
  compactRow: { flexDirection: 'row', alignItems: 'center' },
  compactChipWrap: { marginRight: 4 },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    maxWidth: 210,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipCompact: { paddingHorizontal: 6, paddingVertical: 3, maxWidth: 160 },
  chipCanceled: { opacity: 0.45 },
  chipText: { fontSize: 11, fontWeight: '800', lineHeight: 15 },
  chipTextCompact: { fontSize: 10, lineHeight: 14 },
  chipTextCanceled: { textDecorationLine: 'line-through' },
  popup: { position: 'absolute', zIndex: 40, width: 228 },
  popupCard: {
    backgroundColor: '#020617',
    borderWidth: 1,
    borderColor: '#38BDF8',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
  },
  popupTitle: { color: '#F8FAFC', fontSize: 13, fontWeight: '900', marginBottom: 4 },
  popupLine: { color: '#E2E8F0', fontSize: 11, fontWeight: '700', lineHeight: 16 },
  popupMeta: { color: '#94A3B8', fontSize: 10, fontWeight: '700', marginTop: 4 },
});
