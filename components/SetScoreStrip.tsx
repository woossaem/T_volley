import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { formatSetScoreDisplay, formatSetScoresString, listMatchSetRows } from '../lib/matchSets';

interface SetScoreStripProps {
  match?: any;
  setScores?: string | null;
  sets?: any[];
}

export default function SetScoreStrip({ match, setScores, sets }: SetScoreStripProps) {
  const rows = listMatchSetRows(match || { set_scores: setScores, sets, match_sets: sets });
  if (rows.length === 0) return null;
  const summary = formatSetScoreDisplay(
    formatSetScoresString(rows.map((s) => ({ hostScore: s.host_score, awayScore: s.away_score }))),
  );

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
      {summary ? <Text style={styles.summary}>{summary}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: '#EFF6FF',
    borderWidth: 2,
    borderColor: '#1D4ED8',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
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
    paddingVertical: 6,
    minWidth: 78,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#93C5FD',
  },
  pillLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
  },
  pillScore: {
    fontSize: 18,
    fontWeight: '900',
    color: '#1D4ED8',
    marginTop: 1,
  },
  summary: {
    marginTop: 6,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '900',
    color: '#1E3A8A',
  },
});
