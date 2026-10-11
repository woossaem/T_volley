import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { ProStatReport } from '../lib/proStats';

type Accent = 'blue' | 'amber' | 'purple';

const ACCENT: Record<Accent, { title: string; value: string; bar: string; box: string; border: string }> = {
  blue: { title: '#1E40AF', value: '#1D4ED8', bar: '#3B82F6', box: '#EFF6FF', border: '#BFDBFE' },
  amber: { title: '#92400E', value: '#B45309', bar: '#F59E0B', box: '#FFFBEB', border: '#FDE68A' },
  purple: { title: '#6B21A8', value: '#7E22CE', bar: '#A855F7', box: '#FAF5FF', border: '#E9D5FF' },
};

function winRateColor(winRate: number, setsPlayed: number): string {
  if (setsPlayed <= 0) return '#94A3B8';
  if (winRate >= 50) return '#10B981';
  return '#F59E0B';
}

function PositionShareList({
  positions,
  barColor,
  titleColor,
}: {
  positions: ProStatReport['positions'];
  barColor: string;
  titleColor: string;
}) {
  return (
    <View style={styles.posBlock}>
      <Text style={[styles.posTitle, { color: titleColor }]}>포지션별 출전 비중 & 세트 승률</Text>
      {positions.map((row) => {
        const share = Math.max(0, Math.min(100, row.sharePct));
        const rate = row.setsPlayed > 0 ? Math.max(0, Math.min(100, row.winRate)) : 0;
        const rateColor = winRateColor(row.winRate, row.setsPlayed);
        return (
          <View key={row.position} style={styles.posCard}>
            <View style={styles.posHead}>
              <Text style={styles.posName}>{row.position}</Text>
              <View style={styles.posBadge}>
                <Text style={styles.posBadgeText}>출전 {row.setsPlayed > 0 ? `${share}%` : '0%'}</Text>
              </View>
              <View style={[styles.posBadge, { backgroundColor: `${rateColor}22`, borderColor: rateColor }]}>
                <Text style={[styles.posBadgeText, { color: rateColor }]}>
                  승률 {row.setsPlayed > 0 ? `${rate}%` : '0%'}
                </Text>
              </View>
            </View>
            <View style={styles.barLine}>
              <Text style={styles.barLabel}>출전</Text>
              <View style={styles.posBarTrack}>
                <View style={[styles.posBarFill, { width: `${share}%`, backgroundColor: barColor }]} />
              </View>
            </View>
            <View style={styles.barLine}>
              <Text style={styles.barLabel}>승률</Text>
              <View style={styles.posBarTrack}>
                <View style={[styles.posBarFill, { width: `${rate}%`, backgroundColor: rateColor }]} />
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

interface ProStatPanelProps {
  player?: ProStatReport | null;
  accent?: Accent;
  parts?: 'all' | 'positions';
}

export default function ProStatPanel({ player, accent = 'blue', parts = 'all' }: ProStatPanelProps) {
  const theme = ACCENT[accent];
  const title = player?.scoutingTitle || '[코트 루키]';
  const net = player?.netRating ?? 0;
  const pps = player?.pps ?? 0;
  const share = player?.teamSharePct;
  const clutch = player?.clutchPoints ?? 0;
  const breaker = player?.runBreakerPoints ?? 0;
  const positions = player?.positions || [];

  if (parts === 'positions') {
    return <PositionShareList positions={positions} barColor={theme.bar} titleColor={theme.title} />;
  }

  return (
    <View style={[styles.wrap, { backgroundColor: theme.box, borderColor: theme.border }]}>
      <Text style={[styles.scoutTitle, { color: theme.title }]}>{title}</Text>
      <Text style={styles.scoutSub}>개인 출전 성적만 모았어요. 승부처·흐름차단·포지션 기록입니다.</Text>

      <View style={styles.metricRow}>
        <View style={styles.metricCell}>
          <Text style={styles.metricLabel}>득실 마진</Text>
          <Text style={[styles.metricValue, { color: theme.value }]}>
            {net >= 0 ? `+${net}` : String(net)}
          </Text>
          <Text style={styles.metricHint}>득점 − 범실</Text>
        </View>
        <View style={styles.metricDivider} />
        <View style={styles.metricCell}>
          <Text style={styles.metricLabel}>세트당 득점</Text>
          <Text style={[styles.metricValue, { color: theme.value }]}>{pps.toFixed(1)}</Text>
          <Text style={styles.metricHint}>한 세트 평균</Text>
        </View>
        {share != null && (
          <>
            <View style={styles.metricDivider} />
            <View style={styles.metricCell}>
              <Text style={styles.metricLabel}>팀 점유율</Text>
              <Text style={[styles.metricValue, { color: theme.value }]}>{share}%</Text>
              <Text style={styles.metricHint}>우리 팀 득점 중</Text>
            </View>
          </>
        )}
      </View>

      <View style={styles.clutchRow}>
        <View style={styles.clutchCell}>
          <Text style={styles.clutchLabel}>승부처 득점</Text>
          <Text style={[styles.clutchValue, { color: theme.value }]}>{clutch}점</Text>
          <Text style={styles.clutchHint}>20점 이후, 2점 차 안</Text>
        </View>
        <View style={styles.clutchCell}>
          <Text style={styles.clutchLabel}>흐름 차단</Text>
          <Text style={[styles.clutchValue, { color: theme.value }]}>{breaker}점</Text>
          <Text style={styles.clutchHint}>상대 3연속 득점을 끊은 점수</Text>
        </View>
      </View>

      {positions.length > 0 ? (
        <PositionShareList positions={positions} barColor={theme.bar} titleColor={theme.title} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 12, padding: 10, borderWidth: 1, marginBottom: 6, flexShrink: 0 },
  scoutTitle: { fontSize: 15, lineHeight: 20, fontWeight: '900', includeFontPadding: false },
  scoutSub: { fontSize: 10, lineHeight: 14, fontWeight: '600', color: '#64748B', marginTop: 2, includeFontPadding: false },
  metricRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  metricCell: { flex: 1, alignItems: 'center', flexShrink: 0 },
  metricDivider: { width: 1, height: 28, backgroundColor: '#CBD5E1', flexShrink: 0 },
  metricLabel: { fontSize: 10, lineHeight: 13, fontWeight: '700', color: '#64748B', includeFontPadding: false },
  metricValue: { fontSize: 16, lineHeight: 22, fontWeight: '900', marginTop: 2, includeFontPadding: false },
  metricHint: { fontSize: 9, lineHeight: 12, fontWeight: '600', color: '#94A3B8', marginTop: 1, includeFontPadding: false },
  clutchRow: { flexDirection: 'row', gap: 6, marginTop: 8 },
  clutchCell: { flex: 1, flexShrink: 0, backgroundColor: '#FFFFFF', borderRadius: 8, padding: 8, borderWidth: 1, borderColor: '#E2E8F0' },
  clutchLabel: { fontSize: 11, lineHeight: 14, fontWeight: '800', color: '#334155', includeFontPadding: false },
  clutchValue: { fontSize: 15, lineHeight: 20, fontWeight: '900', marginTop: 2, includeFontPadding: false },
  clutchHint: { fontSize: 9, lineHeight: 12, fontWeight: '600', color: '#64748B', marginTop: 2, includeFontPadding: false },
  posBlock: { marginTop: 10, gap: 8 },
  posTitle: { fontSize: 12, lineHeight: 16, fontWeight: '800', includeFontPadding: false },
  posCard: { backgroundColor: '#FFFFFF', borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0', padding: 8 },
  posHead: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
  posName: { fontSize: 13, lineHeight: 18, fontWeight: '900', color: '#0F172A', marginRight: 2, includeFontPadding: false },
  posBadge: { backgroundColor: '#F8FAFC', borderRadius: 6, borderWidth: 1, borderColor: '#CBD5E1', paddingHorizontal: 6, paddingVertical: 2 },
  posBadgeText: { fontSize: 10, lineHeight: 14, fontWeight: '800', color: '#334155', includeFontPadding: false },
  barLine: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  barLabel: { width: 28, flexShrink: 0, fontSize: 10, lineHeight: 13, fontWeight: '700', color: '#64748B', includeFontPadding: false },
  posBarTrack: { flex: 1, height: 8, backgroundColor: '#E2E8F0', borderRadius: 4, overflow: 'hidden' },
  posBarFill: { height: '100%', borderRadius: 4 },
});
