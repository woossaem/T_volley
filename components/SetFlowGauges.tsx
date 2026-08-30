import React, { useRef, useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { MatchEvent } from './ScoreTimeline';

export interface SetGaugeItem {
  setIndex: number;
  hostScore: number;
  awayScore: number;
  isLive: boolean;
}

interface Props {
  sets: SetGaugeItem[];
  currentSetIndex: number;
  hostName: string;
  awayName: string;
  onSelectSet: (idx: number) => void;
}

function marksFor(maxScore: number): number[] {
  const ceiling = Math.max(20, Math.ceil(Math.max(maxScore, 1) / 5) * 5);
  const marks: number[] = [];
  for (let n = 0; n <= ceiling; n += 5) marks.push(n);
  return marks;
}

export default function SetFlowGauges({ sets, currentSetIndex, hostName, awayName, onSelectSet }: Props) {
  const scrollRef = useRef<ScrollView>(null);
  const [pageW, setPageW] = useState(0);

  useEffect(() => {
    if (!pageW || !scrollRef.current) return;
    scrollRef.current.scrollTo({ x: currentSetIndex * pageW, animated: true });
  }, [currentSetIndex, pageW]);

  const onMomentum = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const w = pageW || e.nativeEvent.layoutMeasurement.width;
    if (!w) return;
    const idx = Math.round(e.nativeEvent.contentOffset.x / w);
    if (idx >= 0 && idx < sets.length && idx !== currentSetIndex) onSelectSet(idx);
  };

  return (
    <View
      style={styles.wrap}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        if (w > 0 && w !== pageW) setPageW(w);
      }}
    >
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentum}
        decelerationRate="fast"
      >
        {sets.map((s) => {
          const maxScore = Math.max(s.hostScore, s.awayScore, 20);
          const marks = marksFor(maxScore);
          const hostPct = Math.min(100, (s.hostScore / maxScore) * 100);
          const awayPct = Math.min(100, (s.awayScore / maxScore) * 100);
          return (
            <TouchableOpacity
              key={s.setIndex}
              style={[styles.page, pageW > 0 ? { width: pageW } : { minWidth: 220 }]}
              activeOpacity={0.9}
              onPress={() => onSelectSet(s.setIndex)}
            >
              <View style={styles.head}>
                <Text style={[styles.setTitle, s.isLive && styles.setTitleLive]}>
                  {s.setIndex + 1}세트{s.isLive ? ' · LIVE' : ''}
                </Text>
                <Text style={styles.scoreText}>{s.hostScore} : {s.awayScore}</Text>
              </View>
              <View style={styles.barBlock}>
                <Text style={styles.barLabel} numberOfLines={1}>{hostName}</Text>
                <View style={styles.track}>
                  <View style={[styles.fillHost, { width: `${hostPct}%` }]} />
                </View>
              </View>
              <View style={styles.barBlock}>
                <Text style={[styles.barLabel, styles.barLabelAway]} numberOfLines={1}>{awayName}</Text>
                <View style={styles.track}>
                  <View style={[styles.fillAway, { width: `${awayPct}%` }]} />
                </View>
              </View>
              <View style={styles.scale}>
                {marks.map((n) => (
                  <View key={n} style={styles.scaleItem}>
                    <View style={styles.scaleTick} />
                    <Text style={styles.scaleText}>{n}</Text>
                  </View>
                ))}
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      <View style={styles.dots}>
        {sets.map((s) => (
          <View key={s.setIndex} style={[styles.dot, s.setIndex === currentSetIndex && styles.dotActive]} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, minWidth: 0 },
  page: { paddingRight: 10, justifyContent: 'center', minWidth: 220 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  setTitle: { fontSize: 11, fontWeight: '800', color: '#94A3B8' },
  setTitleLive: { color: '#38BDF8' },
  scoreText: { fontSize: 13, fontWeight: '900', color: '#F8FAFC' },
  barBlock: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  barLabel: { width: 52, fontSize: 9, fontWeight: '800', color: '#7DD3FC' },
  barLabelAway: { color: '#FDA4AF' },
  track: { flex: 1, height: 8, borderRadius: 4, backgroundColor: '#1E293B', overflow: 'hidden' },
  fillHost: { height: '100%', backgroundColor: '#38BDF8', borderRadius: 4 },
  fillAway: { height: '100%', backgroundColor: '#FB7185', borderRadius: 4 },
  scale: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  scaleItem: { alignItems: 'center', minWidth: 14 },
  scaleTick: { width: 1, height: 4, backgroundColor: '#64748B' },
  scaleText: { fontSize: 8, fontWeight: '800', color: '#64748B' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 4, marginTop: 2 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#334155' },
  dotActive: { backgroundColor: '#38BDF8' },
  momentumTrack: {
    height: 18,
    flexDirection: 'row',
    borderRadius: 9,
    overflow: 'hidden',
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
  },
  momentumTick: { flex: 1, minWidth: 3, height: '100%' },
  momentumEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  momentumEmptyText: { fontSize: 9, fontWeight: '700', color: '#64748B' },
});

/** 현재 세트 득점 흐름을 16~20px 수평 레벨바로 표시 */
export function MomentumLevelBar({ events }: { events: MatchEvent[] }) {
  const flow = events.filter(
    (e) => !e.is_canceled && (e.event_type === 'score' || e.event_type === 'fault')
  );
  if (flow.length === 0) {
    return (
      <View style={styles.momentumTrack}>
        <View style={styles.momentumEmpty}>
          <Text style={styles.momentumEmptyText}>세트 점수 흐름</Text>
        </View>
      </View>
    );
  }
  return (
    <View style={styles.momentumTrack}>
      {flow.map((e, i) => (
        <View
          key={`${e.id}-${i}`}
          style={[
            styles.momentumTick,
            { backgroundColor: e.team_type === 'host' ? '#38BDF8' : '#FB7185' },
          ]}
        />
      ))}
    </View>
  );
}
