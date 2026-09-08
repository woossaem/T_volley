import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/Colors';
import StickyAdBanner from './StickyAdBanner';
import ReportScopeTabs, { type ReportScopeTab } from './ReportScopeTabs';
import { OfficialTeamInsightsPanel, IntramuralTeamInsightsPanel } from './TeamReportInsights';
import { supabase } from '../lib/supabase';
import { buildTeamStatusByName, formatTeamDisplayName } from '../lib/teamStatus';
import { resolveTeamName, resolveTeamNameOrNull, cleanRegionName, getTeamIcon } from '../lib/nameUtils';
import { getSafeDisplayName, getSafeTeamName } from '../lib/utils';
import type { OfficialTeamInsights, IntramuralTeamInsights } from '../lib/teamReportAnalytics';

export interface TeamReportStat {
  totalMatches: number;
  totalWins: number;
  totalDraws: number;
  totalLosses: number;
  winRate: number;
  setsWon: number;
  setsLost: number;
  setDiff: number;
  shutoutWins: number;
  fullsetWins: number;
  nemesis: string;
  nemesisStat: string;
  victim: string;
  victimStat: string;
  teamRecent5: string[];
  officialInsights?: OfficialTeamInsights | null;
}

export interface TeamReportAnalytics {
  teamName: string;
  region?: string;
  teamType?: 'school' | 'club' | string;
  mannerTemp?: number;
  isOfficial?: boolean;
  memberCount?: number;
  status?: string;
  teamId?: string;

  totalMatches: number;
  totalWins?: number;
  totalDraws?: number;
  totalLosses?: number;
  winRate?: number;
  setsWon: number;
  setsLost: number;
  setDiff: number;
  shutoutWins: number;
  fullsetWins: number;
  nemesis: string;
  nemesisStat: string;
  victim: string;
  victimStat: string;
  teamRecent5: string[];

  dataScope?: 'official' | 'intramural';
  officialInsights?: OfficialTeamInsights | null;
  intramuralInsights?: IntramuralTeamInsights | null;

  career?: TeamReportStat;
  seasons?: {
    [year: string]: TeamReportStat;
  };
}

interface TeamReportModalProps {
  visible: boolean;
  onClose: () => void;
  analytics: TeamReportAnalytics | null;
  intramuralAnalytics?: TeamReportAnalytics | null;
  selectedSeason?: string;
}

function collectInsightUserIds(
  official?: OfficialTeamInsights | null,
  intramural?: IntramuralTeamInsights | null,
): string[] {
  const ids = new Set<string>();
  official?.rotations.forEach((row) => row.userIds.forEach((id) => ids.add(id)));
  intramural?.attendance.forEach((row) => ids.add(row.userId));
  intramural?.bestDuo?.userIds.forEach((id) => ids.add(id));
  intramural?.bestTrio?.userIds.forEach((id) => ids.add(id));
  return Array.from(ids).filter(Boolean);
}

export default function TeamReportModal({
  visible,
  onClose,
  analytics,
  intramuralAnalytics,
  selectedSeason,
}: TeamReportModalProps) {
  const insets = useSafeAreaInsets();
  const [scope, setScope] = useState<ReportScopeTab>('official');
  const [viewMode, setViewMode] = useState<'career' | string>('career');
  const [statusByName, setStatusByName] = useState<Record<string, string>>({});
  const [nameMap, setNameMap] = useState<Record<string, string>>({});

  useEffect(() => {
    if (visible) {
      setScope('official');
      setViewMode('career');
    }
  }, [visible, analytics?.teamName]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from('teams').select('*');
      if (cancelled || !data) return;
      setStatusByName(buildTeamStatusByName(data.map((t: any) => ({
        name: resolveTeamNameOrNull(t),
        status: t.status || 'active',
      }))));
    })();
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const rootStat: TeamReportStat = useMemo(() => {
    const wins = analytics?.totalWins ?? 0;
    const total = analytics?.totalMatches || 0;
    return {
      totalMatches: total,
      totalWins: wins,
      totalDraws: analytics?.totalDraws ?? 0,
      totalLosses: analytics?.totalLosses ?? 0,
      winRate: analytics?.winRate ?? (total > 0 ? Math.round((wins / total) * 100) : 0),
      setsWon: analytics?.setsWon || 0,
      setsLost: analytics?.setsLost || 0,
      setDiff: analytics?.setDiff || 0,
      shutoutWins: analytics?.shutoutWins || 0,
      fullsetWins: analytics?.fullsetWins || 0,
      nemesis: analytics?.nemesis || '없음',
      nemesisStat: analytics?.nemesisStat || '',
      victim: analytics?.victim || '없음',
      victimStat: analytics?.victimStat || '',
      teamRecent5: analytics?.teamRecent5 || [],
      officialInsights: analytics?.officialInsights || null,
    };
  }, [analytics]);

  const currentData = useMemo(() => {
    if (!analytics) return rootStat;
    if (viewMode === 'career' || !analytics.seasons || !analytics.seasons[viewMode]) {
      return analytics.career || rootStat;
    }
    return analytics.seasons[viewMode];
  }, [viewMode, analytics, rootStat]);

  const availableSeasons = useMemo(() => {
    if (!analytics?.seasons) return [];
    return Object.keys(analytics.seasons).sort((a, b) => Number(b) - Number(a));
  }, [analytics]);

  const intramuralInsights = intramuralAnalytics?.intramuralInsights;
  const officialInsights = currentData.officialInsights || analytics?.officialInsights || null;

  useEffect(() => {
    if (!visible) return;
    const ids = collectInsightUserIds(officialInsights, intramuralInsights);
    if (ids.length === 0) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from('profiles').select('*').in('id', ids);
      if (cancelled || !data) return;
      const next: Record<string, string> = {};
      data.forEach((row: any) => {
        if (row?.id) next[row.id] = getSafeDisplayName(row);
      });
      setNameMap((prev) => ({ ...prev, ...next }));
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, officialInsights, intramuralInsights]);

  if (!analytics) return null;

  const showIntramural = !!(intramuralAnalytics && (
    (intramuralAnalytics.totalMatches || 0) > 0
    || (intramuralInsights?.totalSets || 0) > 0
    || (intramuralAnalytics.setsWon || 0) + (intramuralAnalytics.setsLost || 0) > 0
  ));
  const intramuralView = scope === 'intramural' && showIntramural && intramuralAnalytics;
  const activeAnalytics = intramuralView ? intramuralAnalytics : analytics;

  const formatNamedTeam = (rawInput: any) => {
    const raw = resolveTeamNameOrNull(rawInput) || (typeof rawInput === 'string' ? rawInput : '');
    if (!raw || raw === '없음') return raw || '없음';
    return formatTeamDisplayName(raw, statusByName[raw]);
  };

  const teamIcon = getTeamIcon(activeAnalytics.teamType || analytics.teamType);
  const rawTeamName = getSafeTeamName(activeAnalytics.teamName || analytics);
  const displayTeamName = formatTeamDisplayName(
    rawTeamName,
    analytics.status || statusByName[rawTeamName]
  );
  const mannerTemp = activeAnalytics.mannerTemp || analytics.mannerTemp || 36.5;
  const regionName = cleanRegionName(activeAnalytics?.region || analytics?.region);

  const displayStat = intramuralView
    ? {
        totalMatches: intramuralAnalytics?.totalMatches || 0,
        totalWins: intramuralAnalytics?.totalWins ?? 0,
        totalDraws: intramuralAnalytics?.totalDraws ?? 0,
        totalLosses: intramuralAnalytics?.totalLosses ?? 0,
        winRate: intramuralAnalytics?.winRate ?? 0,
        setsWon: intramuralAnalytics?.setsWon || 0,
        setsLost: intramuralAnalytics?.setsLost || 0,
        setDiff: intramuralAnalytics?.setDiff || 0,
        shutoutWins: 0,
        fullsetWins: 0,
        nemesis: '없음',
        nemesisStat: '',
        victim: '없음',
        victimStat: '',
        teamRecent5: intramuralAnalytics?.teamRecent5 || [],
      }
    : currentData;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={[styles.modalOverlay, { paddingTop: Math.max(insets.top, 16), paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <View style={styles.headerTitleRow}>
              <Text style={styles.modalTitle}>
                {teamIcon} {displayTeamName}
              </Text>
              {analytics.isOfficial && (
                <View style={styles.officialBadge}>
                  <Text style={styles.officialBadgeText}>💎 공식인증</Text>
                </View>
              )}
            </View>

            <View style={styles.headerMetaRow}>
              <Text style={styles.metaRegionTag}>📍 {regionName}</Text>
              <Text style={styles.metaDivider}>•</Text>
              <Text style={styles.metaSubText}>
                {analytics.teamType === 'school' || analytics.teamType === '학교'
                  ? '학교 팀'
                  : analytics.teamType === 'club' || analytics.teamType === '동호회'
                  ? '동호회 팀'
                  : '팀'}
              </Text>
              <Text style={styles.metaDivider}>•</Text>
              <Text style={styles.metaSubText}>소속 {analytics.memberCount || 0}명</Text>
              <View style={styles.mannerBadge}>
                <Text style={styles.mannerBadgeText}>🌡️ {mannerTemp.toFixed(1)}°C</Text>
              </View>
            </View>

            {!intramuralView && availableSeasons.length > 0 ? (
              <View style={styles.seasonSegmentRow}>
                <TouchableOpacity
                  style={[styles.seasonSegmentBtn, viewMode === 'career' && styles.seasonSegmentBtnActive]}
                  onPress={() => setViewMode('career')}
                  hitSlop={8}
                >
                  <Text style={[styles.seasonSegmentText, viewMode === 'career' && styles.seasonSegmentTextActive]}>
                    📜 통산 전체
                  </Text>
                </TouchableOpacity>

                {availableSeasons.map((yr) => (
                  <TouchableOpacity
                    key={yr}
                    style={[styles.seasonSegmentBtn, viewMode === yr && styles.seasonSegmentBtnActive]}
                    onPress={() => setViewMode(yr)}
                    hitSlop={8}
                  >
                    <Text style={[styles.seasonSegmentText, viewMode === yr && styles.seasonSegmentTextActive]}>
                      📅 {yr} 시즌
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <Text style={styles.seasonTag}>
                📅 {selectedSeason === 'all' ? '통산 전체 리포트' : `${selectedSeason || '통산'} 리포트`}
              </Text>
            )}
            <ReportScopeTabs value={scope} onChange={setScope} showIntramural={showIntramural} />
          </View>

          <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
            {intramuralView ? (
              <>
                <View style={styles.scopeBanner}>
                  <Text style={styles.scopeBannerText}>
                    청백전은 승패·득실이 아니라 소화량, 출석, 함께 뛴 조합으로 봅니다. 개인 승부처 기록은 [내 출전 성적]에서 확인하세요.
                  </Text>
                </View>
                <IntramuralTeamInsightsPanel insights={intramuralInsights} nameMap={nameMap} />
              </>
            ) : (
              <>
                <View style={styles.reportBox}>
                  <Text style={styles.reportLabel}>
                    📊 {viewMode === 'career' ? '통산 전체' : `${viewMode} 시즌`} 경기 & 세트 전적
                  </Text>

                  <View style={styles.statGrid}>
                    <View style={styles.statItem}>
                      <Text style={styles.statSubLabel}>경기 전적</Text>
                      <Text style={styles.statMainValue}>
                        {`${displayStat.totalWins}승 ${displayStat.totalDraws > 0 ? `${displayStat.totalDraws}무 ` : ''}${displayStat.totalLosses}패`}
                      </Text>
                      <Text style={styles.statSubValue}>승률 {displayStat.winRate}%</Text>
                    </View>

                    <View style={styles.verticalDivider} />

                    <View style={styles.statItem}>
                      <Text style={styles.statSubLabel}>세트 득실</Text>
                      <Text style={styles.statMainValue}>
                        {displayStat.setsWon}득 / {displayStat.setsLost}실
                      </Text>
                      <Text style={[styles.statSubValue, { color: displayStat.setDiff >= 0 ? '#2563EB' : '#EF4444' }]}>
                        마진 {displayStat.setDiff >= 0 ? `+${displayStat.setDiff}` : displayStat.setDiff}
                      </Text>
                    </View>
                  </View>
                </View>

                <OfficialTeamInsightsPanel insights={officialInsights} nameMap={nameMap} />

                <View style={styles.reportBox}>
                  <Text style={styles.reportLabel}>⚡ 승리 패턴 분석</Text>
                  <View style={styles.winTypeRow}>
                    <View style={{ alignItems: 'center', flexShrink: 0 }}>
                      <Text style={{ fontSize: 16, lineHeight: 20, fontWeight: '900', color: Colors.primary, includeFontPadding: false }}>
                        {displayStat.shutoutWins}회
                      </Text>
                      <Text style={styles.winTypeSub}>무실점 완승 (2:0 등)</Text>
                    </View>
                    <View style={styles.divider} />
                    <View style={{ alignItems: 'center', flexShrink: 0 }}>
                      <Text style={{ fontSize: 16, lineHeight: 20, fontWeight: '900', color: '#7E22CE', includeFontPadding: false }}>
                        {displayStat.fullsetWins}회
                      </Text>
                      <Text style={styles.winTypeSub}>접전승 (1세트 차)</Text>
                    </View>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', gap: 6, marginBottom: 6, flexShrink: 0 }}>
                  <View style={[styles.reportBox, styles.nemesisBox]}>
                    <Text style={styles.nemesisLabel}>😈 까다로운 천적 팀</Text>
                    <Text style={styles.nemesisName}>{formatNamedTeam(displayStat.nemesis)}</Text>
                    <Text style={styles.nemesisStat}>{displayStat.nemesisStat || '기록 없음'}</Text>
                  </View>

                  <View style={[styles.reportBox, styles.victimBox]}>
                    <Text style={styles.victimLabel}>🎯 상대적 우위 팀</Text>
                    <Text style={styles.victimName}>{formatNamedTeam(displayStat.victim)}</Text>
                    <Text style={styles.victimStat}>{displayStat.victimStat || '기록 없음'}</Text>
                  </View>
                </View>

                <View style={styles.reportBox}>
                  <Text style={styles.reportLabel}>🔥 최근 5경기 흐름</Text>
                  {displayStat.teamRecent5.length === 0 ? (
                    <Text style={styles.reportSubText}>기록된 경기 결과가 없습니다.</Text>
                  ) : (
                    <View style={styles.formRow}>
                      {displayStat.teamRecent5.map((res, idx) => (
                        <View
                          key={idx}
                          style={[
                            styles.formBadge,
                            res === 'WIN' ? styles.formWin : res === 'DRAW' ? styles.formDraw : styles.formLoss,
                          ]}
                        >
                          <Text style={styles.formBadgeText}>
                            {res === 'WIN' ? '승' : res === 'DRAW' ? '무' : '패'}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              </>
            )}
          </ScrollView>

          <View style={styles.adWrapper}>
            <StickyAdBanner isModal={true} />
          </View>

          <TouchableOpacity style={styles.modalCloseBtn} onPress={onClose} hitSlop={8}>
            <Text style={styles.modalCloseBtnText}>닫기</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16 },
  modalContent: { backgroundColor: Colors.surface, borderRadius: 20, padding: 14, width: '100%', maxHeight: '85%', elevation: 5 },

  modalHeader: { borderBottomWidth: 1, borderBottomColor: '#E2E8F0', paddingBottom: 8, marginBottom: 8 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  modalTitle: { fontSize: 17, lineHeight: 22, fontWeight: '900', color: Colors.text, includeFontPadding: false, flexShrink: 0 },
  officialBadge: { backgroundColor: '#EFF6FF', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: '#3B82F6', flexShrink: 0 },
  officialBadgeText: { fontSize: 10, lineHeight: 13, fontWeight: '800', color: '#1D4ED8', includeFontPadding: false },

  headerMetaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5, marginTop: 4 },
  metaRegionTag: { fontSize: 12, lineHeight: 16, fontWeight: '800', color: '#0369A1', includeFontPadding: false, flexShrink: 0 },
  metaSubText: { fontSize: 11.5, lineHeight: 15, color: '#64748B', fontWeight: '600', includeFontPadding: false, flexShrink: 0 },
  metaDivider: { fontSize: 10, lineHeight: 13, color: '#CBD5E1', includeFontPadding: false, flexShrink: 0 },
  mannerBadge: { backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, marginLeft: 2, flexShrink: 0 },
  mannerBadgeText: { fontSize: 10.5, lineHeight: 14, fontWeight: '800', color: '#D97706', includeFontPadding: false },

  seasonSegmentRow: { flexDirection: 'row', gap: 6, marginTop: 8 },
  seasonSegmentBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0', flexShrink: 0 },
  seasonSegmentBtnActive: { backgroundColor: '#EFF6FF', borderColor: '#3B82F6' },
  seasonSegmentText: { fontSize: 11, lineHeight: 15, fontWeight: '700', color: '#64748B', includeFontPadding: false },
  seasonSegmentTextActive: { color: '#1D4ED8', fontWeight: '800' },

  seasonTag: { fontSize: 11, lineHeight: 15, fontWeight: '700', color: Colors.primary, marginTop: 4, includeFontPadding: false, flexShrink: 0 },
  scopeBanner: { backgroundColor: '#FAF5FF', borderRadius: 10, padding: 8, borderWidth: 1, borderColor: '#E9D5FF', marginBottom: 6, flexShrink: 0 },
  scopeBannerText: { fontSize: 11, lineHeight: 15, fontWeight: '700', color: '#6B21A8', includeFontPadding: false, flexShrink: 0 },

  scrollArea: { flexShrink: 1, flexGrow: 0 },
  reportBox: { backgroundColor: '#F8FAFC', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 6, flexShrink: 0 },
  reportLabel: { fontSize: 12, lineHeight: 16, fontWeight: '800', color: '#475569', marginBottom: 6, includeFontPadding: false, flexShrink: 0 },

  statGrid: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingTop: 2, paddingBottom: 2, flexShrink: 0 },
  statItem: { flex: 1, alignItems: 'center', flexShrink: 0 },
  statSubLabel: { fontSize: 10.5, lineHeight: 14, color: '#64748B', fontWeight: '700', marginBottom: 2, includeFontPadding: false, flexShrink: 0 },
  statMainValue: { fontSize: 14, lineHeight: 20, fontWeight: '900', color: '#0F172A', includeFontPadding: false, flexShrink: 0 },
  statSubValue: { fontSize: 11, lineHeight: 15, fontWeight: '800', color: '#2563EB', marginTop: 1, includeFontPadding: false, flexShrink: 0 },
  verticalDivider: { width: 1, height: 28, backgroundColor: '#CBD5E1', flexShrink: 0 },

  reportSubText: { fontSize: 11, lineHeight: 15, color: Colors.textMuted, fontWeight: '600', marginTop: 2, includeFontPadding: false, flexShrink: 0 },
  winTypeRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', marginTop: 2, flexShrink: 0 },
  winTypeSub: { fontSize: 10.5, lineHeight: 14, color: Colors.textMuted, marginTop: 2, fontWeight: '600', includeFontPadding: false, flexShrink: 0 },
  divider: { width: 1, height: 20, backgroundColor: '#CBD5E1', flexShrink: 0 },

  nemesisBox: { flex: 1, backgroundColor: '#FEF2F2', borderColor: '#FECACA', marginBottom: 0, padding: 8 },
  nemesisLabel: { fontSize: 11, lineHeight: 15, fontWeight: '800', color: '#DC2626', includeFontPadding: false, flexShrink: 0 },
  nemesisName: { fontSize: 13.5, lineHeight: 18, fontWeight: '800', color: '#991B1B', marginVertical: 2, includeFontPadding: false, flexShrink: 0 },
  nemesisStat: { fontSize: 10, lineHeight: 13, color: '#B91C1C', fontWeight: '600', includeFontPadding: false, flexShrink: 0 },

  victimBox: { flex: 1, backgroundColor: '#F0FDF4', borderColor: '#BBF7D0', marginBottom: 0, padding: 8 },
  victimLabel: { fontSize: 11, lineHeight: 15, fontWeight: '800', color: '#166534', includeFontPadding: false, flexShrink: 0 },
  victimName: { fontSize: 13.5, lineHeight: 18, fontWeight: '800', color: '#14532D', marginVertical: 2, includeFontPadding: false, flexShrink: 0 },
  victimStat: { fontSize: 10, lineHeight: 13, color: '#15803D', fontWeight: '600', includeFontPadding: false, flexShrink: 0 },

  formRow: { flexDirection: 'row', gap: 6, marginTop: 2, flexShrink: 0 },
  formBadge: { width: 26, height: 26, borderRadius: 6, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  formWin: { backgroundColor: '#10B981' },
  formDraw: { backgroundColor: '#64748B' },
  formLoss: { backgroundColor: '#EF4444' },
  formBadgeText: { color: '#FFFFFF', fontWeight: '900', fontSize: 10.5, lineHeight: 14, includeFontPadding: false },

  adWrapper: { marginTop: 6, marginBottom: 0, borderRadius: 10, overflow: 'hidden' },
  modalCloseBtn: { backgroundColor: '#F1F5F9', borderRadius: 10, paddingVertical: 11, alignItems: 'center', marginTop: 8 },
  modalCloseBtnText: { color: Colors.text, fontSize: 14, lineHeight: 20, fontWeight: '800', includeFontPadding: false },
});
