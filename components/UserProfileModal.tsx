import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Image,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { Colors } from '../constants/Colors';
import StickyAdBanner from './StickyAdBanner';
import BadgeCollectionModal from './BadgeCollectionModal';
import { getAllBadgesWithStatus } from '../lib/badgeUtils';
import { formatTeamDisplayName } from '../lib/teamStatus';
import { hydrateMatchesWithSetScores } from '../lib/matchSets';
import { buildPersonalReportAnalytics, type PersonalReportAnalytics } from '../lib/personalReportAnalytics';
import ReportScopeTabs, { type ReportScopeTab } from './ReportScopeTabs';
import { PersonalReportSection } from './PersonalReportModal';
import { getSafeDisplayName } from '../lib/utils';

interface UserProfileModalProps {
  visible: boolean;
  userId: string | null;
  isMyTeamMember?: boolean; // 💡 내 팀원 여부 (true면 실명 노출, false/undefined면 마스킹)
  officialOnly?: boolean;
  onClose: () => void;
}

interface UserProfileData {
  full_name: string;
  school_name?: string;
  position?: string;
  gender?: string;
  region?: string;
  avatar_icon?: string;
  avatar_url?: string;
  grape_count?: number;
  manner_temp?: number;
}

// 💡 기존 이름 마스킹 규칙 적용 (홍길동 -> 홍*동 / 김철 -> 김* / 남궁민수 -> 남**수)
const maskName = (name?: string): string => {
  if (!name) return '선생님';
  const trimmed = name.trim();
  if (trimmed.length <= 1) return trimmed;
  if (trimmed.length === 2) return `${trimmed[0]}*`;
  return `${trimmed[0]}${'*'.repeat(trimmed.length - 2)}${trimmed[trimmed.length - 1]}`;
};

export default function UserProfileModal({ 
  visible, 
  userId, 
  isMyTeamMember = false,
  officialOnly = false,
  onClose 
}: UserProfileModalProps) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfileData | null>(null);
  const [invitedCount, setInvitedCount] = useState<number>(0);
  const [grapeBoardModalVisible, setGrapeBoardModalVisible] = useState(false);
  const [badgeModalVisible, setBadgeModalVisible] = useState(false);
  const [reportScope, setReportScope] = useState<ReportScopeTab>('official');
  const [selectedTeamName, setSelectedTeamName] = useState<string | null>(null);
  const [allMatches, setAllMatches] = useState<any[]>([]);
  const [profilesMap, setProfilesMap] = useState<Record<string, string>>({});
  const [userTeams, setUserTeams] = useState<{ id: string; name: string; status?: string }[]>([]);

  useEffect(() => {
    if (visible && userId) {
      setReportScope('official');
      setSelectedTeamName(null);
      fetchUserData();
    } else {
      setProfile(null);
      setAllMatches([]);
    }
  }, [visible, userId]);

  const fetchUserData = async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const { data: prof } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (prof) setProfile(prof);

      const { count } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('invited_by', userId);

      setInvitedCount(count || 0);

      const { data: tmData } = await supabase
        .from('team_members')
        .select('team_id, teams(id, name, status)')
        .eq('user_id', userId)
        .eq('is_active', true);

      const teamsList: { id: string; name: string; status?: string }[] = [];
      const addedIds = new Set<string>();
      (tmData || []).forEach((tm: any) => {
        const teamObj = Array.isArray(tm.teams) ? tm.teams[0] : tm.teams;
        if (teamObj?.id && !addedIds.has(teamObj.id)) {
          addedIds.add(teamObj.id);
          teamsList.push({
            id: teamObj.id,
            name: teamObj.name,
            status: teamObj.status || 'active',
          });
        }
      });
      setUserTeams(teamsList);

      const { data: allProfs } = await supabase.from('profiles').select('*');
      const pMap: Record<string, string> = {};
      (allProfs || []).forEach((p: any) => {
        if (p?.id) pMap[p.id] = getSafeDisplayName(p);
      });
      setProfilesMap(pMap);

      const { data: allMatchesRaw } = await supabase
        .from('matches')
        .select('*, match_sets(*)')
        .in('status', ['completed', 'friendly', 'intramural']);
      const hydrated = await hydrateMatchesWithSetScores(allMatchesRaw || []);
      setAllMatches(hydrated);
    } catch (err) {
      console.error('상대 프로필 조회 오류:', err);
    } finally {
      setLoading(false);
    }
  };

  const auraInfo = useMemo(() => {
    if (invitedCount >= 10) return { title: '티볼리의 개국공신', style: styles.auraPlatinum };
    if (invitedCount >= 5) return { title: '티볼리의 인도자', style: styles.auraGold };
    if (invitedCount >= 3) return { title: '티볼리의 수호자', style: styles.auraSilver };
    if (invitedCount >= 1) return { title: '티볼리의 전령', style: styles.auraBronze };
    return { title: null, style: null };
  }, [invitedCount]);

  // 💡 내 팀원이면 실명, 타 팀원이면 홍*동 처리
  const rawName = getSafeDisplayName(profile);
  const displayName = isMyTeamMember ? rawName : maskName(rawName);

  const avatarIco = profile?.avatar_icon || '🏐';
  const avatarUrl = profile?.avatar_url;
  const gender = profile?.gender || '남성';
  const grapeCount = profile?.grape_count || 0;
  const mannerTemp = profile?.manner_temp || 36.5;

  const grapeClusters = Math.floor(grapeCount / 10);
  const grapeRemainder = grapeCount % 10;

  const formattedRegions = profile?.region
    ? profile.region.split(',').map((r, idx) => `${idx + 1}순위 ${r.trim()}`).join(' · ')
    : '활동 지역 미설정';

  const analytics = useMemo<PersonalReportAnalytics | null>(() => {
    if (!userId || !profile) return null;
    const built = buildPersonalReportAnalytics({
      userId,
      playerName: getSafeDisplayName(profile),
      matches: allMatches,
      profilesMap,
      teamName: selectedTeamName,
    });
    const maskPartner = (name: string) => {
      if (isMyTeamMember) return name;
      if (!name || name === '데이터 없음' || name === '팀원') return name;
      return maskName(name);
    };
    return {
      ...built,
      official: { ...built.official, bestPartnerName: maskPartner(built.official.bestPartnerName) },
      intramural: { ...built.intramural, bestPartnerName: maskPartner(built.intramural.bestPartnerName) },
    };
  }, [userId, profile, allMatches, profilesMap, selectedTeamName, isMyTeamMember]);

  const showIntramural = !!(analytics?.intramural && (
    analytics.intramural.myGames > 0
    || ((analytics.intramural.setsWon || 0) + (analytics.intramural.setsDrawn ?? 0) + (analytics.intramural.setsLost || 0)) > 0
  ));
  const intramuralView = reportScope === 'intramural' && showIntramural;
  const activeSlice = intramuralView ? analytics?.intramural : analytics?.official;

  const userParams = useMemo(() => ({
    stats: {
      total: analytics?.official.myGames || 0,
      wins: analytics?.official.setsWon || 0,
      draws: analytics?.official.setsDrawn || 0,
      losses: analytics?.official.setsLost || 0,
      winRate: 0,
      recent5: analytics?.official.recent5 || [],
    },
    userActivityStats: { recordCount: 0, praiseCount: grapeCount },
    invitedCount,
    gender,
  }), [analytics, grapeCount, invitedCount, gender]);

  const userBadges = useMemo(() => {
    const all = getAllBadgesWithStatus(userParams);
    return all.filter(b => b.isUnlocked).slice(0, 2);
  }, [userParams]);

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <View style={[styles.modalOverlay, { paddingTop: Math.max(insets.top, 16), paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={styles.modalContent}>
          {loading ? (
            <ActivityIndicator color={Colors.primary} size="large" style={{ marginVertical: 30 }} />
          ) : (
            <>
              <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
                <View style={styles.profileHeaderCard}>
                  <View style={[styles.avatarCircle, auraInfo.style]}>
                    {avatarUrl ? (
                      <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
                    ) : (
                      <Text style={{ fontSize: 28 }}>{avatarIco}</Text>
                    )}
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <Text style={styles.nameText}>{displayName} 선생님</Text>
                    <View style={[styles.genderChip, gender === '여성' ? styles.femaleChip : styles.maleChip]}>
                      <Text style={[styles.genderChipText, gender === '여성' ? styles.femaleText : styles.maleText]}>
                        {gender}
                      </Text>
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 4, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 6 }}>
                    {userBadges.map((badge) => (
                      <TouchableOpacity
                        key={badge.id}
                        activeOpacity={0.8}
                        onPress={() => setBadgeModalVisible(true)}
                        style={[styles.autoTitleBadge, badge.style]}
                      >
                        <Text style={[styles.autoTitleText, { color: badge.style.color }]}>
                          {badge.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={styles.subText}>
                    🏫 {profile?.school_name || '학교 미설정'} · 🏐 {profile?.position || '포지션 미설정'}
                  </Text>
                  {userTeams.length > 0 ? (
                    <Text style={styles.subText}>
                      🛡️ {userTeams.map((t) => formatTeamDisplayName(t.name, t.status)).join(' · ')}
                    </Text>
                  ) : null}
                  <Text style={styles.regionText}>📍 {formattedRegions}</Text>
                </View>

                <View style={styles.assetMannerRow}>
                  <TouchableOpacity 
                    style={styles.grapeBox} 
                    onPress={() => setGrapeBoardModalVisible(true)}
                    activeOpacity={0.8}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={styles.grapeTitle}>🍇 칭찬 포도알</Text>
                      <Text style={{ fontSize: 10, color: '#9333EA', fontWeight: '800' }}>판 보기 ›</Text>
                    </View>
                    <Text style={styles.grapeVal}>
                      {grapeClusters > 0 ? `${grapeClusters}송이 + ${grapeRemainder}알` : `${grapeRemainder}알`}
                    </Text>
                    
                    <View style={styles.miniGrapeDotsRow}>
                      {Array.from({ length: 10 }).map((_, idx) => (
                        <View 
                          key={idx} 
                          style={[
                            styles.miniGrapeDot, 
                            idx < grapeRemainder && styles.miniGrapeDotFilled
                          ]} 
                        />
                      ))}
                    </View>
                  </TouchableOpacity>

                  <View style={styles.mannerTempBox}>
                    <View style={styles.mannerHeaderRow}>
                      <Text style={styles.mannerTitle}>🌡️ 매너 온도</Text>
                      <Text style={styles.mannerVal}>{mannerTemp.toFixed(1)}°C</Text>
                    </View>
                    <View style={styles.mannerGaugeBg}>
                      <View style={[styles.mannerGaugeFill, { width: `${Math.min(100, (mannerTemp / 99) * 100)}%` }]} />
                    </View>
                  </View>
                </View>

                <View style={styles.protectionNoticeBox}>
                  <Text style={styles.protectionNoticeText}>
                    ✨ 매너 온도는 서로의 신뢰를 보호하고 쾌적한 코트 문화를 위해 3회 이상 수집 후 은은하게 반영됩니다.
                  </Text>
                </View>

                <View style={styles.statsCard}>
                  <Text style={styles.statsCardTitle}>📊 개인 출전 성적</Text>
                  <Text style={styles.statsSubText}>
                    {selectedTeamName
                      ? `[${formatTeamDisplayName(selectedTeamName)}] 교류전·청백전을 나눠 봅니다`
                      : '교류전·청백전을 나눠 봅니다. 팀을 고르면 참여율도 나옵니다.'}
                  </Text>
                  {userTeams.length > 0 ? (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.teamChipRow}>
                      <TouchableOpacity
                        style={[styles.teamChip, !selectedTeamName && styles.teamChipActive]}
                        onPress={() => setSelectedTeamName(null)}
                      >
                        <Text style={[styles.teamChipText, !selectedTeamName && styles.teamChipTextActive]}>전체</Text>
                      </TouchableOpacity>
                      {userTeams.map((t) => {
                        const active = selectedTeamName === t.name;
                        return (
                          <TouchableOpacity
                            key={t.id}
                            style={[styles.teamChip, active && styles.teamChipActive]}
                            onPress={() => setSelectedTeamName(t.name)}
                          >
                            <Text style={[styles.teamChipText, active && styles.teamChipTextActive]} numberOfLines={1}>
                              {formatTeamDisplayName(t.name, t.status)}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  ) : null}
                  <ReportScopeTabs
                    value={reportScope}
                    onChange={setReportScope}
                    showIntramural
                  />
                  <View style={{ marginTop: 8 }}>
                    <PersonalReportSection
                      slice={activeSlice}
                      intramural={!!intramuralView}
                      hideAttendance={!selectedTeamName}
                    />
                  </View>
                </View>
              </ScrollView>

              <View style={styles.adWrapper}>
                <StickyAdBanner isModal={true} />
              </View>
            </>
          )}

          <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={8}>
            <Text style={styles.closeBtnText}>닫기</Text>
          </TouchableOpacity>
        </View>
      </View>

      <BadgeCollectionModal
        visible={badgeModalVisible}
        onClose={() => setBadgeModalVisible(false)}
        userParams={userParams}
        equippedBadgeIds={userBadges.map(b => b.id)}
        onSaveEquippedBadges={() => {}}
      />

      <Modal visible={grapeBoardModalVisible} animationType="fade" transparent={true} onRequestClose={() => setGrapeBoardModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: '#FAF5FF', borderColor: '#E9D5FF', borderWidth: 1.5 }]}>
            <Text style={{ fontSize: 18, fontWeight: '900', color: '#6B21A8', textAlign: 'center', marginBottom: 4 }}>
              🍇 칭찬 포도알 판
            </Text>
            <Text style={{ fontSize: 12, color: '#7E22CE', textAlign: 'center', fontWeight: '600', marginBottom: 16 }}>
              상대팀의 매너 칭찬을 모아 10알을 채우면 1송이가 완성됩니다!
            </Text>

            <View style={styles.grapeBoardContainer}>
              <Text style={styles.grapeStemText}>🌿</Text>
              
              <View style={styles.grapeRow}>
                {[0, 1, 2, 3].map(idx => (
                  <View key={idx} style={[styles.grapeSticker, idx < grapeRemainder && styles.grapeStickerFilled]}>
                    <Text style={styles.grapeStickerText}>{idx < grapeRemainder ? '🍇' : '⚪'}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.grapeRow}>
                {[4, 5, 6].map(idx => (
                  <View key={idx} style={[styles.grapeSticker, idx < grapeRemainder && styles.grapeStickerFilled]}>
                    <Text style={styles.grapeStickerText}>{idx < grapeRemainder ? '🍇' : '⚪'}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.grapeRow}>
                {[7, 8].map(idx => (
                  <View key={idx} style={[styles.grapeSticker, idx < grapeRemainder && styles.grapeStickerFilled]}>
                    <Text style={styles.grapeStickerText}>{idx < grapeRemainder ? '🍇' : '⚪'}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.grapeRow}>
                {[9].map(idx => (
                  <View key={idx} style={[styles.grapeSticker, idx < grapeRemainder && styles.grapeStickerFilled]}>
                    <Text style={styles.grapeStickerText}>{idx < grapeRemainder ? '🍇' : '⚪'}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.grapeBoardStatusBox}>
              <Text style={styles.grapeBoardStatusText}>
                현재 누적: <Text style={{ fontWeight: '900', color: '#7E22CE' }}>{grapeCount}알</Text> ({grapeClusters}송이 완판 + {grapeRemainder}/10알 진행 중)
              </Text>
            </View>

            <TouchableOpacity style={[styles.closeBtn, { backgroundColor: '#E9D5FF', marginTop: 8 }]} onPress={() => setGrapeBoardModalVisible(false)}>
              <Text style={[styles.closeBtnText, { color: '#6B21A8' }]}>닫기</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  modalContent: { backgroundColor: Colors.surface, borderRadius: 20, padding: 16, width: '100%', maxHeight: '90%', elevation: 5 },
  
  profileHeaderCard: { alignItems: 'center', backgroundColor: '#F8FAFC', padding: 12, borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 8 },
  avatarCircle: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center', marginBottom: 6, borderWidth: 2, borderColor: '#BFDBFE', overflow: 'hidden' },
  avatarImage: { width: 56, height: 56, borderRadius: 28 },

  auraBronze: { borderColor: '#CD7F32', borderWidth: 3 },
  auraSilver: { borderColor: '#94A3B8', borderWidth: 3.5 },
  auraGold: { borderColor: '#F59E0B', borderWidth: 4 },
  auraPlatinum: { borderColor: '#A855F7', borderWidth: 4 },

  nameText: { fontSize: 16, fontWeight: '800', color: Colors.text },

  genderChip: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, borderWidth: 1 },
  genderChipText: { fontSize: 10, fontWeight: '800' },
  maleChip: { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' },
  maleText: { color: '#1D4ED8' },
  femaleChip: { backgroundColor: '#FDF2F8', borderColor: '#FBCFE8' },
  femaleText: { color: '#DB2777' },

  autoTitleBadge: { paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: 6, borderWidth: 1 },
  autoTitleText: { fontSize: 10, fontWeight: '800' },

  subText: { fontSize: 12, color: Colors.textMuted, fontWeight: '600', marginBottom: 2 },
  regionText: { fontSize: 11, color: '#0284C7', fontWeight: '700', marginBottom: 4 },

  assetMannerRow: { flexDirection: 'row', gap: 6, marginBottom: 8 },
  grapeBox: { flex: 1, backgroundColor: '#FAF5FF', borderRadius: 12, padding: 10, borderWidth: 1, borderColor: '#E9D5FF', justifyContent: 'center' },
  grapeTitle: { fontSize: 11, fontWeight: '800', color: '#7E22CE' },
  grapeVal: { fontSize: 12.5, fontWeight: '900', color: '#6B21A8', marginTop: 2 },
  miniGrapeDotsRow: { flexDirection: 'row', gap: 2, marginTop: 6 },
  miniGrapeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#E9D5FF' },
  miniGrapeDotFilled: { backgroundColor: '#9333EA' },

  mannerTempBox: { flex: 1, backgroundColor: '#FFFBEB', borderRadius: 12, padding: 10, borderWidth: 1, borderColor: '#FDE68A', justifyContent: 'center' },
  mannerHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  mannerTitle: { fontSize: 11, fontWeight: '800', color: '#B45309' },
  mannerVal: { fontSize: 12.5, fontWeight: '900', color: '#D97706' },
  mannerGaugeBg: { height: 6, backgroundColor: '#FEF3C7', borderRadius: 3, overflow: 'hidden', marginTop: 4 },
  mannerGaugeFill: { height: '100%', backgroundColor: '#F59E0B', borderRadius: 3 },

  protectionNoticeBox: { backgroundColor: '#F8FAFC', borderRadius: 8, padding: 8, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 8 },
  protectionNoticeText: { fontSize: 10, color: '#64748B', lineHeight: 14, fontWeight: '600' },

  statsCard: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 6 },
  statsCardTitle: { fontSize: 12, lineHeight: 16, fontWeight: '800', color: '#1D4ED8', marginBottom: 2, includeFontPadding: false },
  statsSubText: { fontSize: 11, lineHeight: 15, color: '#64748B', fontWeight: '600', includeFontPadding: false, marginBottom: 8 },
  teamChipRow: { gap: 6, paddingBottom: 4 },
  teamChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  teamChipActive: { backgroundColor: '#EFF6FF', borderColor: '#3B82F6' },
  teamChipText: { fontSize: 11, fontWeight: '700', color: '#64748B' },
  teamChipTextActive: { color: '#1D4ED8', fontWeight: '800' },

  scrollArea: { flexShrink: 1, flexGrow: 0 },
  adWrapper: { marginTop: 6, marginBottom: 0, borderRadius: 10, overflow: 'hidden' },
  closeBtn: { backgroundColor: '#F1F5F9', borderRadius: 10, paddingVertical: 11, alignItems: 'center', marginTop: 8 },
  closeBtnText: { color: Colors.text, fontSize: 14, fontWeight: '800' },

  grapeBoardContainer: { alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#E9D5FF', marginVertical: 10 },
  grapeStemText: { fontSize: 24, marginBottom: -4 },
  grapeRow: { flexDirection: 'row', gap: 8, marginVertical: 2 },
  grapeSticker: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#F3E8FF', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E9D5FF' },
  grapeStickerFilled: { backgroundColor: '#FAF5FF', borderColor: '#C084FC' },
  grapeStickerText: { fontSize: 20 },
  grapeBoardStatusBox: { backgroundColor: '#F3E8FF', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, marginVertical: 8, alignItems: 'center' },
  grapeBoardStatusText: { fontSize: 12, color: '#6B21A8', fontWeight: '700' },
});