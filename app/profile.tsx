import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  SafeAreaView,
  Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Colors } from '../constants/Colors';

interface ProfileInfo {
  fullName: string;
  schoolName: string;
  region: string;
  isNamePublic: boolean;
}

interface TeamMembershipInfo {
  id: string;
  name: string;
  team_type?: 'school' | 'club';
  is_primary: boolean;
}

interface TeamSeasonStat {
  teamId: string;
  teamName: string;
  seasonWins: number;
  seasonLosses: number;
  seasonDraws: number;
  seasonTotal: number;
  totalWins: number;
  totalLosses: number;
  totalDraws: number;
  grandTotal: number;
  team_type?: 'school' | 'club';
  is_primary: boolean;
}

interface PersonalStat {
  totalMatches: number;
  wins: number;
  draws: number;
  losses: number;
  winRate: number;
}

export default function ProfileScreen() {
  const router = useRouter();
  const { session, signOut } = useAuth();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<ProfileInfo>({
    fullName: '',
    schoolName: '',
    region: '천안',
    isNamePublic: false,
  });
  const [myTeams, setMyTeams] = useState<TeamMembershipInfo[]>([]);
  
  const [personalStat, setPersonalStat] = useState<PersonalStat>({ totalMatches: 0, wins: 0, draws: 0, losses: 0, winRate: 0 });
  const [teamStats, setTeamStats] = useState<TeamSeasonStat[]>([]);

  const userEmail = session?.user?.email || '이메일 정보 없음';
  const userId = session?.user?.id;

  useEffect(() => {
    fetchProfileData();
  }, [session]);

  const fetchProfileData = async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const { data: profData } = await supabase
        .from('profiles')
        .select('full_name, school_name, region, is_name_public')
        .eq('id', userId)
        .maybeSingle();

      const googleName = session?.user?.user_metadata?.full_name || session?.user?.user_metadata?.name || '선생님';
      setProfile({
        fullName: profData?.full_name || googleName,
        schoolName: profData?.school_name || '소속 학교 미설정',
        region: profData?.region || '천안 / 아산',
        isNamePublic: profData?.is_name_public ?? false,
      });

      const { data: teamMembersData } = await supabase
        .from('team_members')
        .select('team_id, is_primary, teams(id, name, team_type)')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('is_primary', { ascending: false });

      const joinedList: TeamMembershipInfo[] = (teamMembersData || [])
        .map((tm: any) => ({
          id: tm.teams?.id,
          name: tm.teams?.name,
          team_type: tm.teams?.team_type || 'school',
          is_primary: tm.is_primary || false,
        }))
        .filter((t) => t.id && t.name);

      setMyTeams(joinedList);

      const { data: allMatches } = await supabase
        .from('matches')
        .select('*')
        .eq('status', 'completed');

      const myPlayedMatches = (allMatches || []).filter((m: any) => {
        const inHost = m.host_roster?.split(',').includes(userId);
        const inAway = m.away_roster?.split(',').includes(userId);
        return inHost || inAway;
      });

      let pWins = 0, pLosses = 0, pDraws = 0;
      myPlayedMatches.forEach((m: any) => {
        const inHost = m.host_roster?.split(',').includes(userId);
        const myTeamInMatch = inHost ? m.host_team_name : m.away_team_name;

        if (m.winner_team === myTeamInMatch) pWins++;
        else if (m.winner_team === 'draw' || m.winner_team === '무승부') pDraws++;
        else pLosses++;
      });

      const pTotal = pWins + pLosses + pDraws;
      setPersonalStat({
        totalMatches: pTotal,
        wins: pWins,
        draws: pDraws,
        losses: pLosses,
        winRate: pTotal > 0 ? Math.round((pWins / pTotal) * 100) : 0,
      });

      const currentYear = new Date().getFullYear().toString();

      if (joinedList.length > 0) {
        const tStatPromises = joinedList.map(async (team) => {
          const teamMatches = (allMatches || []).filter(
            (m: any) => m.host_team_name === team.name || m.away_team_name === team.name
          );

          let sWins = 0, sLosses = 0, sDraws = 0;
          let tWins = 0, tLosses = 0, tDraws = 0;

          teamMatches.forEach((m) => {
            const isWin = m.winner_team === team.name;
            const isDraw = m.winner_team === 'draw' || m.winner_team === '무승부';
            const isCurrentSeason = m.match_date && m.match_date.includes(currentYear);

            if (isWin) {
              tWins++;
              if (isCurrentSeason) sWins++;
            } else if (isDraw) {
              tDraws++;
              if (isCurrentSeason) sDraws++;
            } else {
              tLosses++;
              if (isCurrentSeason) sLosses++;
            }
          });

          return {
            teamId: team.id,
            teamName: team.name,
            seasonWins: sWins,
            seasonLosses: sLosses,
            seasonDraws: sDraws,
            seasonTotal: sWins + sLosses + sDraws,
            totalWins: tWins,
            totalLosses: tLosses,
            totalDraws: tDraws,
            grandTotal: tWins + tLosses + tDraws,
            team_type: team.team_type,
            is_primary: team.is_primary,
          };
        });

        const resolved = await Promise.all(tStatPromises);
        setTeamStats(resolved.filter(Boolean) as TeamSeasonStat[]);
      }
    } catch (err) {
      console.error('프로필 종합 조회 오류:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleNamePublic = async (val: boolean) => {
    setProfile(prev => ({ ...prev, isNamePublic: val }));
    if (!userId) return;
    try {
      await supabase.from('profiles').update({ is_name_public: val }).eq('id', userId);
      Alert.alert('설정 변경', val ? '랭킹에 실명이 노출됩니다.' : '랭킹에 이름이 마스킹(예: 홍*동) 처리됩니다.');
    } catch (err) {
      console.error('설정 저장 실패:', err);
    }
  };

  const handleEditProfile = () => router.push('/profile-setup');
  const handleGoToMyMatches = () => router.push('/my-matches');
  const handleGoToTeamDetail = () => router.push('/my-team-detail');

  const handleSignOut = () => {
    Alert.alert('로그아웃', '정말 로그아웃 하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      { text: '로그아웃', style: 'destructive', onPress: async () => { await signOut(); router.replace('/login'); } },
    ]);
  };

  const getTeamIcon = (type?: string) => (type === 'club' ? '🏐' : '🏫');

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} hitSlop={10}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>내 프로필</Text>
        <TouchableOpacity onPress={handleGoToTeamDetail}>
          <Text style={styles.manageHeaderLink}>팀 관리 ⚙️</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator color={Colors.primary} size="large" style={{ marginTop: 40 }} />
        ) : (
          <>
            <View style={styles.card}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{profile.fullName ? profile.fullName.charAt(0) : '🏐'}</Text>
              </View>
              <Text style={styles.nickname}>{profile.fullName} 선생님</Text>
              <View style={styles.schoolBadge}>
                <Text style={styles.schoolBadgeText}>🏫 재직: {profile.schoolName}</Text>
              </View>

              {myTeams.length > 0 ? (
                <View style={styles.teamBadgeRow}>
                  {myTeams.map((t) => (
                    <TouchableOpacity key={t.id} style={[styles.teamBadge, t.is_primary && styles.primaryTeamBadge]} onPress={handleGoToTeamDetail}>
                      <Text style={[styles.teamBadgeText, t.is_primary && styles.primaryTeamBadgeText]}>
                        {t.is_primary ? '⭐ ' : ''}{getTeamIcon(t.team_type)} {t.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : (
                <Text style={styles.noTeamBadgeText}>가입된 소속 팀이 없습니다.</Text>
              )}
            </View>

            {/* 내 개인 실제 출전 성적 */}
            <View style={styles.personalStatCard}>
              <View style={styles.personalStatHeader}>
                <Text style={styles.personalTitle}>🏃‍♂️ 내 개인 실제 출전 성적</Text>
                <TouchableOpacity onPress={handleGoToMyMatches}>
                  <Text style={styles.viewMoreText}>상세 이력 ➔</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.personalStatRow}>
                <View style={styles.pStatItem}>
                  <Text style={styles.pStatValue}>{personalStat.totalMatches}전</Text>
                  <Text style={styles.pStatLabel}>총 출전 경기</Text>
                </View>
                <View style={styles.pStatItem}>
                  <Text style={[styles.pStatValue, { color: '#2563EB' }]}>
                    {personalStat.wins}승 {personalStat.draws}무 {personalStat.losses}패
                  </Text>
                  <Text style={styles.pStatLabel}>개인 전적</Text>
                </View>
                <View style={styles.pStatItem}>
                  <Text style={[styles.pStatValue, { color: '#059669' }]}>{personalStat.winRate}%</Text>
                  <Text style={styles.pStatLabel}>개인 승률</Text>
                </View>
              </View>
            </View>

            {/* 🔥 자연스러운 제목으로 완전 수정: 소속 팀별 전적 */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>🛡️ 소속 팀별 전적</Text>
              {teamStats.length > 0 ? (
                teamStats.map((st) => (
                  <View key={st.teamId} style={[styles.historyCardCurrent, st.is_primary && styles.primaryHistoryCard]}>
                    <View style={styles.historyHeader}>
                      <View style={[styles.tagCurrent, st.is_primary && { backgroundColor: '#D97706' }]}>
                        <Text style={styles.tagCurrentText}>{st.is_primary ? '⭐ 1순위 팀' : '소속 팀'}</Text>
                      </View>
                      <Text style={styles.seasonTitle}>{getTeamIcon(st.team_type)} {st.teamName}</Text>
                    </View>
                    
                    <View style={{ gap: 4, marginTop: 4 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#1D4ED8' }}>
                        📅 2026 상반기 시즌: {st.seasonWins}승 {st.seasonLosses}패 ({st.seasonTotal}전)
                      </Text>
                      <Text style={{ fontSize: 12, fontWeight: '600', color: '#64748B' }}>
                        📜 팀 통산 전체 전적: {st.totalWins}승 {st.totalLosses}패 ({st.grandTotal}전)
                      </Text>
                    </View>
                  </View>
                ))
              ) : (
                <Text style={{ color: Colors.textMuted }}>가입된 팀이 없습니다.</Text>
              )}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>계정 & 프라이버시 설정</Text>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>연동 계정</Text>
                <Text style={styles.infoValue}>{userEmail}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>주 활동 지역</Text>
                <Text style={styles.infoValue}>충남 {profile.region}</Text>
              </View>
              
              <View style={[styles.infoRow, { marginTop: 4 }]}>
                <View>
                  <Text style={styles.infoLabel}>개인 랭킹 실명 공개</Text>
                  <Text style={{ fontSize: 11, color: Colors.textMuted }}>꺼두면 랭킹에서 홍*동 으로 표시됩니다</Text>
                </View>
                <Switch value={profile.isNamePublic} onValueChange={toggleNamePublic} trackColor={{ true: Colors.primary }} />
              </View>
            </View>

            <View style={styles.btnGroup}>
              <TouchableOpacity style={styles.editBtn} onPress={handleEditProfile}>
                <Text style={styles.editBtnText}>✏️ 성함 / 소속 학교 / 팀 추가 가입</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.logoutBtn} onPress={handleSignOut}>
                <Text style={styles.logoutBtnText}>로그아웃</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backBtn: { width: 32, height: 32, justifyContent: 'center' },
  backText: { fontSize: 32, color: Colors.text, lineHeight: 32 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: Colors.text },
  manageHeaderLink: { fontSize: 14, fontWeight: '700', color: '#2563EB' },
  content: { padding: 20, gap: 16 },
  card: { backgroundColor: Colors.surface, borderRadius: 20, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: Colors.border, elevation: 2 },
  avatar: { width: 76, height: 76, borderRadius: 38, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  avatarText: { fontSize: 32, fontWeight: '700', color: '#FFFFFF' },
  nickname: { fontSize: 22, fontWeight: '800', color: Colors.primary, marginBottom: 10 },
  schoolBadge: { backgroundColor: '#F1F5F9', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#CBD5E1', marginBottom: 10 },
  schoolBadgeText: { fontSize: 13, fontWeight: '700', color: '#334155' },
  teamBadgeRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginTop: 2 },
  teamBadge: { backgroundColor: '#EFF6FF', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 16, borderWidth: 1, borderColor: '#BFDBFE' },
  primaryTeamBadge: { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' },
  teamBadgeText: { fontSize: 13, fontWeight: '700', color: '#1D4ED8' },
  primaryTeamBadgeText: { color: '#B45309' },
  noTeamBadgeText: { fontSize: 13, color: Colors.textMuted, marginTop: 4 },
  personalStatCard: { backgroundColor: '#EFF6FF', borderRadius: 16, padding: 18, borderWidth: 1.5, borderColor: '#3B82F6' },
  personalStatHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  personalTitle: { fontSize: 16, fontWeight: '800', color: '#1E40AF' },
  viewMoreText: { fontSize: 13, fontWeight: '700', color: '#2563EB' },
  personalStatRow: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: '#FFFFFF', padding: 12, borderRadius: 12 },
  pStatItem: { alignItems: 'center' },
  pStatValue: { fontSize: 16, fontWeight: '800', color: '#0F172A', marginBottom: 2 },
  pStatLabel: { fontSize: 11, fontWeight: '600', color: '#64748B' },
  section: { backgroundColor: Colors.surface, borderRadius: 16, padding: 18, borderWidth: 1, borderColor: Colors.border, gap: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: Colors.text },
  historyCardCurrent: { backgroundColor: '#F8FAFC', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#E2E8F0' },
  primaryHistoryCard: { backgroundColor: '#FEFCE8', borderColor: '#FDE047' },
  historyHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  tagCurrent: { backgroundColor: '#0284C7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  tagCurrentText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  seasonTitle: { fontSize: 15, fontWeight: '800', color: '#0F172A' },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  infoLabel: { fontSize: 14, color: Colors.text, fontWeight: '600' },
  infoValue: { fontSize: 14, color: Colors.textMuted, fontWeight: '600' },
  btnGroup: { gap: 10, marginTop: 4 },
  editBtn: { backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  editBtnText: { color: Colors.primary, fontSize: 15, fontWeight: '700' },
  logoutBtn: { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FCA5A5', borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  logoutBtnText: { color: '#DC2626', fontSize: 15, fontWeight: '700' },
});