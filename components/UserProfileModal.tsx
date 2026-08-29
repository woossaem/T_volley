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
import { supabase } from '../lib/supabase';
import { Colors } from '../constants/Colors';
import StickyAdBanner from './StickyAdBanner';
import BadgeCollectionModal from './BadgeCollectionModal';
import { getAllBadgesWithStatus } from '../lib/badgeUtils';
import { formatTeamDisplayName } from '../lib/teamStatus';
import { parseRosterUserIds, safeIncludes } from '../lib/roster';

interface UserProfileModalProps {
  visible: boolean;
  userId: string | null;
  isMyTeamMember?: boolean; // 💡 내 팀원 여부 (true면 실명 노출, false/undefined면 마스킹)
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
  onClose 
}: UserProfileModalProps) {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfileData | null>(null);
  const [invitedCount, setInvitedCount] = useState<number>(0);
  const [grapeBoardModalVisible, setGrapeBoardModalVisible] = useState(false);
  const [badgeModalVisible, setBadgeModalVisible] = useState(false);

  const [stats, setStats] = useState({
    total: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    winRate: 0,
  });
  const [userTeams, setUserTeams] = useState<{ id: string; name: string; status?: string }[]>([]);

  useEffect(() => {
    if (visible && userId) {
      fetchUserData();
    } else {
      setProfile(null);
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

      const { data: allMatches } = await supabase
        .from('matches')
        .select('*')
        .eq('status', 'completed');

      let total = 0, wins = 0, draws = 0, losses = 0;

      (allMatches || []).forEach((m: any) => {
        const hostList = parseRosterUserIds(m.host_roster);
        const awayList = parseRosterUserIds(m.away_roster);
        const hostMercList = parseRosterUserIds(m.host_mercenary_roster);
        const awayMercList = parseRosterUserIds(m.away_mercenary_roster);

        const inHost = hostList.includes(userId) || safeIncludes(m.host_roster, userId);
        const inAway = awayList.includes(userId) || safeIncludes(m.away_roster, userId);
        const inHostMerc = hostMercList.includes(userId) || safeIncludes(m.host_mercenary_roster, userId);
        const inAwayMerc = awayMercList.includes(userId) || safeIncludes(m.away_mercenary_roster, userId);

        if (inHost || inAway || inHostMerc || inAwayMerc) {
          total++;
          const myTeam = (inHost || inHostMerc) ? m.host_team_name : m.away_team_name;

          if (m.winner_team === myTeam) wins++;
          else if (m.winner_team === 'draw' || m.winner_team === '무승부') draws++;
          else losses++;
        }
      });

      const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
      setStats({ total, wins, draws, losses, winRate });

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
  const rawName = profile?.full_name || '선생님';
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

  const userParams = useMemo(() => ({
    stats,
    userActivityStats: { recordCount: 0, praiseCount: grapeCount },
    invitedCount,
    gender,
  }), [stats, grapeCount, invitedCount, gender]);

  const userBadges = useMemo(() => {
    const all = getAllBadgesWithStatus(userParams);
    return all.filter(b => b.isUnlocked).slice(0, 2);
  }, [userParams]);

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
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
                  <Text style={styles.statsCardTitle}>🏆 공식전 개인 출전 전적</Text>
                  <Text style={styles.statsMainText}>
                    {stats.wins}승 {stats.draws}무 {stats.losses}패
                  </Text>
                  <View style={styles.statsRow}>
                    <Text style={styles.statsSubText}>총 {stats.total}경기 출전</Text>
                    <Text style={styles.statsWinRateText}>승률 {stats.winRate}%</Text>
                  </View>
                </View>
              </ScrollView>

              <View style={styles.adWrapper}>
                <StickyAdBanner isModal={true} />
              </View>
            </>
          )}

          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
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
  modalContent: { backgroundColor: Colors.surface, borderRadius: 20, padding: 16, width: '100%', maxHeight: '85%', elevation: 5 },
  
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

  statsCard: { backgroundColor: '#EFF6FF', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#BFDBFE', marginBottom: 6 },
  statsCardTitle: { fontSize: 12, fontWeight: '800', color: '#1D4ED8', marginBottom: 4 },
  statsMainText: { fontSize: 18, fontWeight: '900', color: '#1E40AF', marginBottom: 4 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statsSubText: { fontSize: 12, color: '#3B82F6', fontWeight: '600' },
  statsWinRateText: { fontSize: 13, fontWeight: '800', color: '#1E40AF' },

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