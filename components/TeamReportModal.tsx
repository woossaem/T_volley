import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
} from 'react-native';
import { Colors } from '../constants/Colors';
import StickyAdBanner from './StickyAdBanner';
import { supabase } from '../lib/supabase';
import { buildTeamStatusByName, formatTeamDisplayName } from '../lib/teamStatus';
import { resolveTeamName, resolveTeamNameOrNull, cleanRegionName, getTeamIcon } from '../lib/nameUtils';

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

  career?: TeamReportStat;
  seasons?: {
    [year: string]: TeamReportStat;
  };
}

interface TeamReportModalProps {
  visible: boolean;
  onClose: () => void;
  analytics: TeamReportAnalytics | null;
  selectedSeason?: string;
}

export default function TeamReportModal({
  visible,
  onClose,
  analytics,
  selectedSeason,
}: TeamReportModalProps) {
  const [viewMode, setViewMode] = useState<'career' | string>('career');
  const [statusByName, setStatusByName] = useState<Record<string, string>>({});

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

  if (!analytics) return null;

  const formatNamedTeam = (rawInput: any) => {
    const raw = resolveTeamNameOrNull(rawInput) || (typeof rawInput === 'string' ? rawInput : '');
    if (!raw || raw === '없음') return raw || '없음';
    return formatTeamDisplayName(raw, statusByName[raw]);
  };

  const teamIcon = getTeamIcon(analytics.teamType);
  const rawTeamName = resolveTeamName(analytics.teamName, resolveTeamName(analytics, '소속팀'));
  const displayTeamName = formatTeamDisplayName(
    rawTeamName,
    analytics.status || statusByName[rawTeamName]
  );
  const mannerTemp = analytics.mannerTemp || 36.5;
  const regionName = cleanRegionName(analytics?.region);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* 상단 팀 메타 프로필 헤더 */}
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

            {/* 통산 / 시즌 선택 스위퍼 */}
            {availableSeasons.length > 0 ? (
              <View style={styles.seasonSegmentRow}>
                <TouchableOpacity
                  style={[styles.seasonSegmentBtn, viewMode === 'career' && styles.seasonSegmentBtnActive]}
                  onPress={() => setViewMode('career')}
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
          </View>

          {/* ScrollView 자동 수축 처리 */}
          <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
            {/* 1. 경기 & 세트 전적 마진 */}
            <View style={styles.reportBox}>
              <Text style={styles.reportLabel}>
                📊 {viewMode === 'career' ? '통산 전체' : `${viewMode} 시즌`} 경기 & 세트 전적
              </Text>
              
              <View style={styles.statGrid}>
                <View style={styles.statItem}>
                  <Text style={styles.statSubLabel}>경기 전적</Text>
                  <Text style={styles.statMainValue}>
                    {currentData.totalWins}승 {currentData.totalDraws > 0 ? `${currentData.totalDraws}무 ` : ''}{currentData.totalLosses}패
                  </Text>
                  <Text style={styles.statSubValue}>승률 {currentData.winRate}%</Text>
                </View>

                <View style={styles.verticalDivider} />

                <View style={styles.statItem}>
                  <Text style={styles.statSubLabel}>세트 득실</Text>
                  <Text style={styles.statMainValue}>
                    {currentData.setsWon}득 / {currentData.setsLost}실
                  </Text>
                  <Text style={[styles.statSubValue, { color: currentData.setDiff >= 0 ? '#2563EB' : '#EF4444' }]}>
                    마진 {currentData.setDiff >= 0 ? `+${currentData.setDiff}` : currentData.setDiff}
                  </Text>
                </View>
              </View>
            </View>

            {/* 2. 승리 패턴 분석 */}
            <View style={styles.reportBox}>
              <Text style={styles.reportLabel}>⚡ 승리 패턴 분석</Text>
              <View style={styles.winTypeRow}>
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 16, fontWeight: '900', color: Colors.primary }}>
                    {currentData.shutoutWins}회
                  </Text>
                  <Text style={styles.winTypeSub}>무실점 완승 (2:0 등)</Text>
                </View>
                <View style={styles.divider} />
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 16, fontWeight: '900', color: '#7E22CE' }}>
                    {currentData.fullsetWins}회
                  </Text>
                  <Text style={styles.winTypeSub}>접전승 (1세트 차)</Text>
                </View>
              </View>
            </View>

            {/* 3. 천적 팀 & 상대적 우위 팀 */}
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 6 }}>
              <View style={[styles.reportBox, styles.nemesisBox]}>
                <Text style={styles.nemesisLabel}>😈 까다로운 천적 팀</Text>
                <Text style={styles.nemesisName}>{formatNamedTeam(currentData.nemesis)}</Text>
                <Text style={styles.nemesisStat}>{currentData.nemesisStat || '기록 없음'}</Text>
              </View>

              <View style={[styles.reportBox, styles.victimBox]}>
                <Text style={styles.victimLabel}>🎯 상대적 우위 팀</Text>
                <Text style={styles.victimName}>{formatNamedTeam(currentData.victim)}</Text>
                <Text style={styles.victimStat}>{currentData.victimStat || '기록 없음'}</Text>
              </View>
            </View>

            {/* 4. 최근 5경기 흐름 */}
            <View style={styles.reportBox}>
              <Text style={styles.reportLabel}>🔥 최근 5경기 흐름</Text>
              {currentData.teamRecent5.length === 0 ? (
                <Text style={styles.reportSubText}>기록된 경기 결과가 없습니다.</Text>
              ) : (
                <View style={styles.formRow}>
                  {currentData.teamRecent5.map((res, idx) => (
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
          </ScrollView>

          {/* 모달 전용 스티커 광고 배너 */}
          <View style={styles.adWrapper}>
            <StickyAdBanner isModal={true} />
          </View>

          <TouchableOpacity style={styles.modalCloseBtn} onPress={onClose}>
            <Text style={styles.modalCloseBtnText}>닫기</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  modalContent: { backgroundColor: Colors.surface, borderRadius: 20, padding: 14, width: '100%', maxHeight: '85%', elevation: 5 },
  
  modalHeader: { borderBottomWidth: 1, borderBottomColor: '#E2E8F0', paddingBottom: 8, marginBottom: 8 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  modalTitle: { fontSize: 17, fontWeight: '900', color: Colors.text },
  officialBadge: { backgroundColor: '#EFF6FF', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: '#3B82F6' },
  officialBadgeText: { fontSize: 10, fontWeight: '800', color: '#1D4ED8' },
  
  headerMetaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5, marginTop: 4 },
  metaRegionTag: { fontSize: 12, fontWeight: '800', color: '#0369A1' },
  metaSubText: { fontSize: 11.5, color: '#64748B', fontWeight: '600' },
  metaDivider: { fontSize: 10, color: '#CBD5E1' },
  mannerBadge: { backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, marginLeft: 2 },
  mannerBadgeText: { fontSize: 10.5, fontWeight: '800', color: '#D97706' },

  seasonSegmentRow: { flexDirection: 'row', gap: 6, marginTop: 8 },
  seasonSegmentBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0' },
  seasonSegmentBtnActive: { backgroundColor: '#EFF6FF', borderColor: '#3B82F6' },
  seasonSegmentText: { fontSize: 11, fontWeight: '700', color: '#64748B' },
  seasonSegmentTextActive: { color: '#1D4ED8', fontWeight: '800' },

  seasonTag: { fontSize: 11, fontWeight: '700', color: Colors.primary, marginTop: 4 },

  scrollArea: { flexShrink: 1, flexGrow: 0 },
  reportBox: { backgroundColor: '#F8FAFC', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 6 },
  reportLabel: { fontSize: 12, fontWeight: '800', color: '#475569', marginBottom: 6 },

  statGrid: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingTop: 2, paddingBottom: 2 },
  statItem: { flex: 1, alignItems: 'center' },
  statSubLabel: { fontSize: 10.5, color: '#64748B', fontWeight: '700', marginBottom: 2 },
  statMainValue: { fontSize: 14, fontWeight: '900', color: '#0F172A' },
  statSubValue: { fontSize: 11, fontWeight: '800', color: '#2563EB', marginTop: 1 },
  verticalDivider: { width: 1, height: 28, backgroundColor: '#CBD5E1' },

  reportSubText: { fontSize: 11, color: Colors.textMuted, fontWeight: '600', marginTop: 2 },
  winTypeRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', marginTop: 2 },
  winTypeSub: { fontSize: 10.5, color: Colors.textMuted, marginTop: 2, fontWeight: '600' },
  divider: { width: 1, height: 20, backgroundColor: '#CBD5E1' },

  nemesisBox: { flex: 1, backgroundColor: '#FEF2F2', borderColor: '#FECACA', marginBottom: 0, padding: 8 },
  nemesisLabel: { fontSize: 11, fontWeight: '800', color: '#DC2626' },
  nemesisName: { fontSize: 13.5, fontWeight: '800', color: '#991B1B', marginVertical: 2 },
  nemesisStat: { fontSize: 10, color: '#B91C1C', fontWeight: '600' },

  victimBox: { flex: 1, backgroundColor: '#F0FDF4', borderColor: '#BBF7D0', marginBottom: 0, padding: 8 },
  victimLabel: { fontSize: 11, fontWeight: '800', color: '#166534' },
  victimName: { fontSize: 13.5, fontWeight: '800', color: '#14532D', marginVertical: 2 },
  victimStat: { fontSize: 10, color: '#15803D', fontWeight: '600' },

  formRow: { flexDirection: 'row', gap: 6, marginTop: 2 },
  formBadge: { width: 26, height: 26, borderRadius: 6, justifyContent: 'center', alignItems: 'center' },
  formWin: { backgroundColor: '#10B981' },
  formDraw: { backgroundColor: '#64748B' },
  formLoss: { backgroundColor: '#EF4444' },
  formBadgeText: { color: '#FFFFFF', fontWeight: '900', fontSize: 10.5 },

  adWrapper: { marginTop: 6, marginBottom: 0, borderRadius: 10, overflow: 'hidden' },
  modalCloseBtn: { backgroundColor: '#F1F5F9', borderRadius: 10, paddingVertical: 11, alignItems: 'center', marginTop: 8 },
  modalCloseBtnText: { color: Colors.text, fontSize: 14, fontWeight: '800' },
});