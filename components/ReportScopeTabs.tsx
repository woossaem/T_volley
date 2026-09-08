import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

export type ReportScopeTab = 'official' | 'intramural';

interface ReportScopeTabsProps {
  value: ReportScopeTab;
  onChange: (next: ReportScopeTab) => void;
  showIntramural: boolean;
}

export default function ReportScopeTabs({ value, onChange, showIntramural }: ReportScopeTabsProps) {
  if (!showIntramural) return null;

  return (
    <View style={styles.row}>
      <TouchableOpacity
        style={[styles.tab, value === 'official' && styles.tabActive]}
        onPress={() => onChange('official')}
        hitSlop={8}
        activeOpacity={0.8}
      >
        <Text style={[styles.tabText, value === 'official' && styles.tabTextActive]}>🏟️ 교류전</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.tab, value === 'intramural' && styles.tabActiveIntra]}
        onPress={() => onChange('intramural')}
        hitSlop={8}
        activeOpacity={0.8}
      >
        <Text style={[styles.tabText, value === 'intramural' && styles.tabTextActiveIntra]}>⚔️ 청백전</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6, marginTop: 8 },
  tab: {
    flex: 1,
    flexShrink: 0,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  tabActive: { backgroundColor: '#EFF6FF', borderColor: '#3B82F6' },
  tabActiveIntra: { backgroundColor: '#FAF5FF', borderColor: '#C084FC' },
  tabText: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: '#64748B', includeFontPadding: false },
  tabTextActive: { color: '#1D4ED8', fontWeight: '800' },
  tabTextActiveIntra: { color: '#6B21A8', fontWeight: '800' },
});
