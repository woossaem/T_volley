import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type {
  EfficiencyRow,
  IntramuralTeamInsights,
  OfficialTeamInsights,
} from '../lib/teamReportAnalytics';

function overlayNames(ids: string[], stored: string[], nameMap?: Record<string, string>): string {
  const names = ids.map((id, idx) => nameMap?.[id] || stored[idx] || '선생님');
  return names.join(' · ');
}

function BarRow({
  label,
  pct,
  meta,
  color,
}: {
  label: string;
  pct: number;
  meta: string;
  color: string;
}) {
  const width = Math.max(0, Math.min(100, pct));
  return (
    <View style={styles.barRow}>
      <Text style={styles.barLabel} numberOfLines={2} ellipsizeMode="tail">{label}</Text>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${width}%`, backgroundColor: color }]} />
      </View>
      <Text style={styles.barMeta} numberOfLines={1}>{meta}</Text>
    </View>
  );
}

function EfficiencyBlock({
  title,
  hint,
  rows,
  emptyText,
  nameMap,
  color,
}: {
  title: string;
  hint: string;
  rows: EfficiencyRow[];
  emptyText: string;
  nameMap?: Record<string, string>;
  color: string;
}) {
  return (
    <View style={styles.box}>
      <Text style={styles.boxLabel}>{title}</Text>
      <Text style={styles.hint}>{hint}</Text>
      {rows.length === 0 ? (
        <Text style={styles.empty}>{emptyText}</Text>
      ) : (
        rows.map((row) => (
          <BarRow
            key={row.key}
            label={row.userIds.length > 0 ? overlayNames(row.userIds, row.names, nameMap) : row.label}
            pct={row.efficiencyPct}
            meta={`${row.efficiencyPct}% · ${row.sets}세트`}
            color={color}
          />
        ))
      )}
    </View>
  );
}

export function OfficialTeamInsightsPanel({
  insights,
  nameMap,
}: {
  insights: OfficialTeamInsights | null | undefined;
  nameMap?: Record<string, string>;
}) {
  if (!insights) return null;
  const scoring = insights.scoring;
  const scored = scoring.kills + scoring.faults;
  const killShare = scored > 0 ? Math.round((scoring.kills / scored) * 100) : 0;
  const faultShare = scored > 0 ? 100 - killShare : 0;
  const gapAbs = Math.abs(insights.volatilityGap);
  const gapText = insights.volatilityGap === 0
    ? '0%p'
    : `${insights.volatilityGap > 0 ? '+' : '−'}${gapAbs}%p`;

  return (
    <View>
      <EfficiencyBlock
        title="📐 포메이션별 득점 효율"
        hint="전열-중열-후열 배치에서 우리 팀 점수가 차지한 비율입니다."
        rows={insights.formations}
        emptyText="포메이션 기록이 아직 없습니다."
        color="#2563EB"
      />
      <EfficiencyBlock
        title="👥 코트 인원별 득점 효율"
        hint="몇 명이 코트에 섰을 때 점수가 잘 났는지 봅니다."
        rows={insights.occupancies}
        emptyText="코트 인원 기록이 아직 없습니다."
        color="#0EA5E9"
      />
      <EfficiencyBlock
        title="🔄 전위 로테이션별 득점 효율"
        hint="함께 전열에 선 조합 기준으로, 어느 로테이션에서 점수가 잘 났는지 봅니다."
        rows={insights.rotations}
        emptyText="전위 로테이션 기록이 아직 부족합니다."
        nameMap={nameMap}
        color="#1D4ED8"
      />

      <View style={styles.box}>
        <Text style={styles.boxLabel}>📊 세트별 승률 · 기복</Text>
        <Text style={styles.hint}>1세트 승률과 2~3세트 승률을 비교해 기복을 봅니다.</Text>
        {insights.setWinRates.length === 0 ? (
          <Text style={styles.empty}>세트 승패 기록이 없습니다.</Text>
        ) : (
          insights.setWinRates.map((row) => (
            <BarRow
              key={row.setNumber}
              label={row.label}
              pct={row.winRate}
              meta={`${row.winRate}% · ${row.played}세트`}
              color={row.setNumber === 1 ? '#2563EB' : '#7C3AED'}
            />
          ))
        )}
        <View style={styles.compareRow}>
          <View style={styles.compareCell}>
            <Text style={styles.compareLabel}>1세트 승률</Text>
            <Text style={styles.compareValue}>{insights.set1WinRate}%</Text>
          </View>
          <View style={styles.compareCell}>
            <Text style={styles.compareLabel}>2~3세트 승률</Text>
            <Text style={styles.compareValue}>{insights.laterWinRate}%</Text>
          </View>
          <View style={styles.compareCell}>
            <Text style={styles.compareLabel}>기복</Text>
            <Text style={styles.compareValue}>{gapText}</Text>
          </View>
        </View>
        <Text style={styles.volatility}>{insights.volatilityLabel}</Text>
      </View>

      <View style={styles.box}>
        <Text style={styles.boxLabel}>🎯 팀 득점 성공 / 범실</Text>
        <Text style={styles.hint}>우리 팀 득점 성공(킬)과 범실만 모았습니다. 개인 승부처 기록은 출전 성적에서 봅니다.</Text>
        {scored <= 0 ? (
          <Text style={styles.empty}>득점·범실 상세 기록이 아직 없습니다.</Text>
        ) : (
          <>
            <View style={styles.stackTrack}>
              <View style={[styles.stackKill, { flex: Math.max(scoring.kills, 0.01) }]} />
              <View style={[styles.stackFault, { flex: Math.max(scoring.faults, 0.01) }]} />
            </View>
            <View style={styles.ratioRow}>
              <Text style={styles.ratioKill}>성공 {scoring.kills} · {killShare}%</Text>
              <Text style={styles.ratioFault}>범실 {scoring.faults} · {faultShare}%</Text>
            </View>
          </>
        )}
        <Text style={styles.pointLine}>
          세트 점수 합계 {scoring.pointsFor}득 / {scoring.pointsAgainst}실
        </Text>
      </View>
    </View>
  );
}

export function IntramuralTeamInsightsPanel({
  insights,
  nameMap,
}: {
  insights: IntramuralTeamInsights | null | undefined;
  nameMap?: Record<string, string>;
}) {
  if (!insights) return null;
  const topAttendance = insights.attendance.slice(0, 8);

  return (
    <View>
      <View style={styles.box}>
        <Text style={styles.intraLabel}>⚔️ 청백전 소화량</Text>
        <Text style={styles.hint}>승패 대신, 팀이 실제로 몇 세트를 돌렸는지 누적합니다.</Text>
        <View style={styles.volumeGrid}>
          <View style={styles.volumeCell}>
            <Text style={styles.volumeValue}>{insights.sessions}</Text>
            <Text style={styles.volumeMeta}>연습 경기</Text>
          </View>
          <View style={styles.volumeCell}>
            <Text style={styles.volumeValue}>{insights.totalSets}</Text>
            <Text style={styles.volumeMeta}>소화 세트</Text>
          </View>
          <View style={styles.volumeCell}>
            <Text style={styles.volumeValue}>{insights.recordedPoints}</Text>
            <Text style={styles.volumeMeta}>누적 기록 점수</Text>
          </View>
        </View>
        <Text style={styles.pointLine}>회당 평균 {insights.avgSetsPerSession}세트</Text>
      </View>

      <View style={styles.box}>
        <Text style={styles.intraLabel}>🙋 팀원 청백전 출석 (참여 세트)</Text>
        <Text style={styles.hint}>전체 소화 세트 대비, 각 선생님이 코트에 선 세트 수입니다.</Text>
        {topAttendance.length === 0 ? (
          <Text style={styles.empty}>라인업이 남은 청백전 출석 기록이 아직 없습니다.</Text>
        ) : (
          topAttendance.map((row) => (
            <BarRow
              key={row.userId}
              label={nameMap?.[row.userId] || row.name}
              pct={row.attendancePct}
              meta={`${row.setsPlayed}세트 · ${row.attendancePct}%`}
              color="#7C3AED"
            />
          ))
        )}
      </View>

      <View style={styles.chemRow}>
        <View style={[styles.box, styles.chemBox]}>
          <Text style={styles.chemTitle}>🤝 베스트 듀오</Text>
          <Text style={styles.chemNames} numberOfLines={2}>
            {insights.bestDuo
              ? overlayNames(insights.bestDuo.userIds, insights.bestDuo.names, nameMap)
              : '데이터 없음'}
          </Text>
          <Text style={styles.chemMeta}>
            {insights.bestDuo
              ? `같은 편으로 ${insights.bestDuo.setsTogether}세트`
              : '함께 뛴 기록이 부족합니다'}
          </Text>
        </View>
        <View style={[styles.box, styles.chemBox]}>
          <Text style={styles.chemTitle}>🔺 베스트 트리오</Text>
          <Text style={styles.chemNames} numberOfLines={2}>
            {insights.bestTrio
              ? overlayNames(insights.bestTrio.userIds, insights.bestTrio.names, nameMap)
              : '데이터 없음'}
          </Text>
          <Text style={styles.chemMeta}>
            {insights.bestTrio
              ? `같은 편으로 ${insights.bestTrio.setsTogether}세트`
              : '3인 조합 기록이 부족합니다'}
          </Text>
        </View>
      </View>

      <View style={styles.box}>
        <Text style={styles.intraLabel}>📌 연습에서 보이는 습관</Text>
        <View style={styles.habitRow}>
          <View style={styles.habitCell}>
            <Text style={styles.habitValue}>{insights.avgCourtPlayers || '-'}</Text>
            <Text style={styles.habitMeta}>평균 코트 인원</Text>
          </View>
          <View style={styles.habitCell}>
            <Text style={styles.habitValue}>{insights.guestSetPct}%</Text>
            <Text style={styles.habitMeta}>임시 선수 편성</Text>
          </View>
          <View style={styles.habitCell}>
            <Text style={styles.habitValue}>{insights.bothSidesCount}명</Text>
            <Text style={styles.habitMeta}>양쪽 다 뛰어봄</Text>
          </View>
        </View>
        <Text style={styles.pointLine}>가장 자주 모인 요일 · {insights.favoriteWeekday}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 6,
    flexShrink: 0,
  },
  boxLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
    color: '#475569',
    marginBottom: 2,
    includeFontPadding: false,
    flexShrink: 0,
  },
  intraLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
    color: '#6B21A8',
    marginBottom: 2,
    includeFontPadding: false,
    flexShrink: 0,
  },
  hint: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 8,
    includeFontPadding: false,
    flexShrink: 0,
  },
  empty: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '600',
    color: '#94A3B8',
    includeFontPadding: false,
    flexShrink: 0,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    flexShrink: 0,
  },
  barLabel: {
    width: 100,
    flexShrink: 0,
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: '800',
    color: '#334155',
    includeFontPadding: false,
  },
  barTrack: {
    flex: 1,
    height: 8,
    backgroundColor: '#E2E8F0',
    borderRadius: 4,
    overflow: 'hidden',
    marginHorizontal: 6,
  },
  barFill: { height: '100%', borderRadius: 4 },
  barMeta: {
    width: 78,
    flexShrink: 0,
    textAlign: 'right',
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '700',
    color: '#475569',
    includeFontPadding: false,
  },
  compareRow: { flexDirection: 'row', marginTop: 6, flexShrink: 0 },
  compareCell: { flex: 1, alignItems: 'center', flexShrink: 0 },
  compareLabel: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '700',
    color: '#64748B',
    includeFontPadding: false,
    flexShrink: 0,
  },
  compareValue: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 2,
    includeFontPadding: false,
    flexShrink: 0,
  },
  volatility: {
    marginTop: 6,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '800',
    color: '#1D4ED8',
    includeFontPadding: false,
    flexShrink: 0,
  },
  stackTrack: {
    flexDirection: 'row',
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
    backgroundColor: '#E2E8F0',
    flexShrink: 0,
  },
  stackKill: { backgroundColor: '#10B981', minWidth: 0 },
  stackFault: { backgroundColor: '#F43F5E', minWidth: 0 },
  ratioRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
    flexShrink: 0,
  },
  ratioKill: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '800',
    color: '#047857',
    includeFontPadding: false,
    flexShrink: 0,
  },
  ratioFault: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '800',
    color: '#BE123C',
    includeFontPadding: false,
    flexShrink: 0,
  },
  pointLine: {
    marginTop: 6,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
    color: '#475569',
    includeFontPadding: false,
    flexShrink: 0,
  },
  volumeGrid: { flexDirection: 'row', marginTop: 4, flexShrink: 0 },
  volumeCell: { flex: 1, alignItems: 'center', flexShrink: 0 },
  volumeValue: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '900',
    color: '#6B21A8',
    includeFontPadding: false,
    flexShrink: 0,
  },
  volumeMeta: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '700',
    color: '#7E22CE',
    marginTop: 2,
    includeFontPadding: false,
    flexShrink: 0,
  },
  chemRow: { flexDirection: 'row', gap: 6, marginBottom: 6, flexShrink: 0 },
  chemBox: { flex: 1, marginBottom: 0, backgroundColor: '#FAF5FF', borderColor: '#E9D5FF' },
  chemTitle: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '800',
    color: '#6B21A8',
    includeFontPadding: false,
    flexShrink: 0,
  },
  chemNames: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
    color: '#4C1D95',
    marginTop: 4,
    includeFontPadding: false,
    flexShrink: 0,
  },
  chemMeta: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '600',
    color: '#7E22CE',
    marginTop: 4,
    includeFontPadding: false,
    flexShrink: 0,
  },
  habitRow: { flexDirection: 'row', marginTop: 4, flexShrink: 0 },
  habitCell: { flex: 1, alignItems: 'center', flexShrink: 0 },
  habitValue: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '900',
    color: '#6B21A8',
    includeFontPadding: false,
    flexShrink: 0,
  },
  habitMeta: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '700',
    color: '#7E22CE',
    marginTop: 2,
    textAlign: 'center',
    includeFontPadding: false,
    flexShrink: 0,
  },
});
