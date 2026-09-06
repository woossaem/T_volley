import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { listMatchSetRows } from '../lib/matchSets';

interface SetScoreStripProps {
  match?: any;
  setScores?: string | null;
  sets?: any[];
}

export default function SetScoreStrip({ match, setScores, sets }: SetScoreStripProps) {
  const rows = listMatchSetRows(match || { set_scores: setScores, sets, match_sets: sets });
  const hasMeaningfulScore = rows.some((s) => (Number(s.host_score) || 0) > 0 || (Number(s.away_score) || 0) > 0);
  if (!hasMeaningfulScore) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.pillsRow}>
        {rows.map((s) => (
          <View key={`set-${s.setNumber}`} style={styles.pill}>
            <Text style={styles.pillLabel}>{s.setNumber}세트</Text>
            <Text style={styles.pillScore}>{s.host_score}:{s.away_score}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#93C5FD',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 8,
    marginTop: 8,
  },
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  pill: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 5,
    minWidth: 72,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#93C5FD',
  },
  pillLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    lineHeight: 13,
  },
  pillScore: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1D4ED8',
    marginTop: 1,
    lineHeight: 20,
  },
});
