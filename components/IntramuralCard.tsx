import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { listMatchSetRows } from '../lib/matchSets';
import { getSafeTeamName } from '../lib/utils';
import { copyLiveScoreboardLink } from '../lib/liveLink';

interface IntramuralMatch {
  id: string;
  host_team_name: string;
  match_date: string;
  winner_team?: string | null;
  set_scores?: string | null;
  match_sets?: unknown;
  sets?: unknown;
  match_events?: unknown;
  short_code?: string | null;
}

interface IntramuralCardProps {
  match: IntramuralMatch;
  teamA: string;
  teamB: string;
  note?: string;
  teamIcon?: string;
  onOpenScoreboard: () => void;
  onOpenReport: () => void;
  onOpenComment: () => void;
  onOpenQuickResult: () => void;
}

export default function IntramuralCard({
  match,
  teamA,
  teamB,
  note,
  teamIcon,
  onOpenScoreboard,
  onOpenReport,
  onOpenComment,
  onOpenQuickResult,
}: IntramuralCardProps) {
  const insets = useSafeAreaInsets();
  const isFinished = !!match.winner_team;
  const isDraw = match.winner_team === 'draw' || match.winner_team === '무승부';
  const setRows = listMatchSetRows(match);
  const hasSetRecord = setRows.length > 0 || !!(match.set_scores && String(match.set_scores).trim());

  return (
    <View style={[styles.matchCard, { paddingBottom: 14 + Math.min(insets.bottom, 0) }]}>
      <View style={styles.cardMetaRow}>
        <View style={styles.headerLeft}>
          <View style={styles.regionTagPill}>
            <Text style={styles.regionTagPillText} numberOfLines={1}>⚔️ {teamIcon} {getSafeTeamName(match.host_team_name)}</Text>
          </View>
          <View style={[styles.statusBadge, isFinished ? styles.statusFinished : styles.statusLive]}>
            <Text style={[styles.statusText, isFinished ? styles.statusTextFinished : styles.statusTextLive]} numberOfLines={1}>
              {isFinished ? '종료' : '진행중'}
            </Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.chatIconBtn}
            onPress={onOpenComment}
            activeOpacity={0.7}
            hitSlop={8}
          >
            <Text style={styles.chatIconBtnText}>💬 소통방</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.scoreboardRow}>
        <View style={styles.teamColLeft}>
          <Text style={styles.teamName} numberOfLines={1}>{getSafeTeamName(teamA)}</Text>
        </View>
        <View style={styles.vsPill}>
          <Text style={styles.vsPillText}>VS</Text>
        </View>
        <View style={styles.teamColRight}>
          <Text style={styles.teamName} numberOfLines={1}>{getSafeTeamName(teamB)}</Text>
        </View>
      </View>

      <View style={styles.matchDetailsRow}>
        <Text style={styles.detailText}>📅 {match.match_date}</Text>
        {note ? <Text style={styles.noteTagText}>💡 {note}</Text> : null}
      </View>

      <TouchableOpacity
        style={styles.setScoreBox}
        onPress={onOpenScoreboard}
        activeOpacity={0.7}
        hitSlop={8}
      >
        <View style={styles.setScoreBoxBody}>
          <Text style={styles.setScoreNudge}>📊 실시간 전광판 진입</Text>
          <Text style={styles.scoreBannerWinner}>
            {isFinished
              ? (isDraw ? '🤝 무승부 (연습경기 마감)' : `🏆 ${match.winner_team} 승리!`)
              : '⚡ 경기 진행 중 (승패 미정)'}
          </Text>
          {hasSetRecord ? (
            <View style={styles.setScorePillsRow}>
              {(setRows.length > 0 ? setRows : [{ setNumber: 1, host_score: 0, away_score: 0 }]).map((s) => (
                <View key={`set-${s.setNumber}`} style={styles.setScorePill}>
                  <Text style={styles.setScorePillLabel}>{s.setNumber}세트</Text>
                  <Text style={styles.setScorePillValue}>{s.host_score}:{s.away_score}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.setScoreEmpty}>기록 없음</Text>
          )}
        </View>
        <Text style={styles.setScoreChevron}>›</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.liveLinkCopyBtn}
        onPress={() => { void copyLiveScoreboardLink(match); }}
        activeOpacity={0.85}
        hitSlop={8}
      >
        <Text style={styles.liveLinkCopyBtnText}>🔗 라이브 전광판 링크 복사</Text>
      </TouchableOpacity>

      {isFinished ? (
        <View style={styles.inlineActionRow}>
          <TouchableOpacity
            style={[styles.mainActionBtn, styles.flex7]}
            onPress={onOpenReport}
            activeOpacity={0.85}
            hitSlop={8}
          >
            <Text style={styles.mainActionBtnText} numberOfLines={1}>📊 경기 분석 리포트 보기</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.subActionBtn, styles.flex3]}
            onPress={onOpenQuickResult}
            activeOpacity={0.85}
            hitSlop={8}
          >
            <Text style={styles.subActionBtnText} numberOfLines={1}>✏️ 결과 수정</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.liveMainBtn}
          onPress={onOpenScoreboard}
          activeOpacity={0.85}
          hitSlop={8}
        >
          <Text style={styles.liveMainBtnText} numberOfLines={1}>⚡ 실시간 전광판 / 기록 진입</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  matchCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#D8B4FE',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
  },
  cardMetaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 6 },
  headerLeft: { flexDirection: 'row', gap: 6, alignItems: 'center', flexShrink: 1, flexWrap: 'wrap' },
  headerRight: { flexDirection: 'row', gap: 6, alignItems: 'center', flexShrink: 0 },
  regionTagPill: { height: 28, borderRadius: 14, paddingHorizontal: 10, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  regionTagPillText: { fontSize: 12, fontWeight: '600', color: '#6B21A8', lineHeight: 16, includeFontPadding: false },
  statusBadge: { height: 28, borderRadius: 14, paddingHorizontal: 10, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  statusFinished: { backgroundColor: '#F1F5F9' },
  statusLive: { backgroundColor: '#EFF6FF' },
  statusText: { fontSize: 12, fontWeight: '600', lineHeight: 16, includeFontPadding: false },
  statusTextFinished: { color: '#334155' },
  statusTextLive: { color: '#1D4ED8' },
  chatIconBtn: {
    height: 28,
    borderRadius: 14,
    paddingHorizontal: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  chatIconBtnText: { fontSize: 12, fontWeight: '600', color: '#475569', lineHeight: 16, includeFontPadding: false },
  scoreboardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FAF5FF',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E9D5FF',
    marginBottom: 8,
  },
  teamColLeft: { flex: 1, alignItems: 'flex-start' },
  teamColRight: { flex: 1, alignItems: 'flex-end' },
  teamName: { fontSize: 15, fontWeight: '700', color: '#6B21A8', lineHeight: 20, includeFontPadding: false },
  vsPill: { backgroundColor: '#E9D5FF', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, marginHorizontal: 10 },
  vsPillText: { fontSize: 11, fontWeight: '900', color: '#7E22CE', lineHeight: 14, includeFontPadding: false },
  matchDetailsRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  detailText: { fontSize: 13, color: '#334155', fontWeight: '600', lineHeight: 18, includeFontPadding: false },
  noteTagText: { fontSize: 12, color: '#B45309', fontWeight: '700', lineHeight: 16, includeFontPadding: false },
  setScoreBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    padding: 12,
    gap: 6,
  },
  setScoreBoxBody: { flex: 1, minWidth: 0 },
  setScoreNudge: { fontSize: 11, color: '#94A3B8', fontWeight: '700', lineHeight: 14, includeFontPadding: false, marginBottom: 4 },
  setScoreChevron: { fontSize: 16, color: '#94A3B8', lineHeight: 20, includeFontPadding: false, fontWeight: '400' },
  liveLinkCopyBtn: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 10,
    paddingVertical: 9,
    alignItems: 'center',
    marginTop: 8,
  },
  liveLinkCopyBtnText: { fontSize: 12, fontWeight: '800', color: '#1D4ED8', lineHeight: 16, includeFontPadding: false },
  scoreBannerWinner: { color: '#F8FAFC', fontSize: 14, fontWeight: '800', lineHeight: 20, includeFontPadding: false, marginBottom: 6 },
  setScoreEmpty: { fontSize: 13, color: '#94A3B8', fontWeight: '700', lineHeight: 18, includeFontPadding: false },
  setScorePillsRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start', gap: 8 },
  setScorePill: { backgroundColor: '#0F172A', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 5, minWidth: 72, alignItems: 'center', borderWidth: 1, borderColor: '#334155' },
  setScorePillLabel: { fontSize: 10, fontWeight: '800', color: '#94A3B8', lineHeight: 13, includeFontPadding: false },
  setScorePillValue: { fontSize: 15, fontWeight: '800', color: '#F8FAFC', marginTop: 1, lineHeight: 20, includeFontPadding: false },
  inlineActionRow: { flexDirection: 'row', gap: 8, alignItems: 'stretch', marginTop: 10 },
  flex7: { flex: 7, minWidth: 0 },
  flex3: { flex: 3, flexShrink: 0 },
  mainActionBtn: {
    backgroundColor: '#FEFCE8',
    borderRadius: 10,
    minHeight: 44,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FDE047',
  },
  mainActionBtnText: { color: '#A16207', fontSize: 13, fontWeight: '800', lineHeight: 18, includeFontPadding: false },
  subActionBtn: {
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    minHeight: 44,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    flexShrink: 0,
  },
  subActionBtnText: { color: '#334155', fontSize: 12, fontWeight: '800', lineHeight: 16, includeFontPadding: false },
  liveMainBtn: {
    backgroundColor: '#2563EB',
    borderRadius: 10,
    minHeight: 44,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    width: '100%',
  },
  liveMainBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800', lineHeight: 18, includeFontPadding: false },
});
