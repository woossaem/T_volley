import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  RefreshControl,
  Modal,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Colors } from '../constants/Colors';

interface MyTeam {
  id: string;
  name: string;
  region: string;
  pin_code: string;
  team_type?: 'school' | 'club';
  is_primary?: boolean;
}

interface TeamMember {
  id: string;
  full_name: string;
  school_name: string | null;
}

interface TeamStats {
  totalMatches: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  winRate: number;
}

export default function MyTeamDetailScreen() {
  const router = useRouter();
  const { session } = useAuth();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const [myTeams, setMyTeams] = useState<MyTeam[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<MyTeam | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);

  const [seasonStats, setSeasonStats] = useState<TeamStats>({ totalMatches: 0, wins: 0, draws: 0, losses: 0, points: 0, winRate: 0 });
  const [totalStats, setTotalStats] = useState<TeamStats>({ totalMatches: 0, wins: 0, draws: 0, losses: 0, points: 0, winRate: 0 });

  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [newPinCode, setNewPinCode] = useState('');

  const userId = session?.user?.id;

  useEffect(() => {
    fetchMyTeams();
  }, [session]);

  useEffect(() => {
    if (selectedTeam) {
      fetchTeamMembers(selectedTeam.id);
      fetchTeamStats(selectedTeam.name);
    }
  }, [selectedTeam]);

  const fetchMyTeams = async () => {
    if (!userId) return;

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('team_members')
        .select(`
          team_id,
          is_primary,
          teams (id, name, region, pin_code, team_type)
        `)
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('is_primary', { ascending: false });

      if (error) throw error;

      const teamsList: MyTeam[] = (data || [])
        .map((item: any) => ({
          ...item.teams,
          is_primary: item.is_primary || false,
        }))
        .filter(Boolean);

      setMyTeams(teamsList);

      if (teamsList.length > 0) {
        if (!selectedTeam || !teamsList.some((t) => t.id === selectedTeam.id)) {
          setSelectedTeam(teamsList[0]);
        } else {
          const updated = teamsList.find((t) => t.id === selectedTeam.id);
          if (updated) setSelectedTeam(updated);
        }
      }
    } catch (err) {
      console.error('팀 목록 조회 오류:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchTeamMembers = async (teamId: string) => {
    try {
      const { data } = await supabase
        .from('team_members')
        .select(`user_id, profiles (id, full_name, school_name)`)
        .eq('team_id', teamId)
        .eq('is_active', true);

      setMembers((data || []).map((item: any) => item.profiles).filter(Boolean));
    } catch (err) {
      console.error('팀원 조회 오류:', err);
    }
  };

  const fetchTeamStats = async (teamName: string) => {
    try {
      const { data: matches } = await supabase
        .from('matches')
        .select('*')
        .or(`host_team_name.eq."${teamName}",away_team_name.eq."${teamName}"`)
        .eq('status', 'completed');

      let sWins = 0, sDraws = 0, sLosses = 0;
      let tWins = 0, tDraws = 0, tLosses = 0;

      const currentYear = new Date().getFullYear().toString();

      (matches || []).forEach((m) => {
        const isWin = m.winner_team === teamName;
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

      const sTotal = sWins + sDraws + sLosses;
      setSeasonStats({
        totalMatches: sTotal,
        wins: sWins,
        draws: sDraws,
        losses: sLosses,
        points: sWins * 3 + sDraws,
        winRate: sTotal > 0 ? Math.round((sWins / sTotal) * 100) : 0,
      });

      const tTotal = tWins + tDraws + tLosses;
      setTotalStats({
        totalMatches: tTotal,
        wins: tWins,
        draws: tDraws,
        losses: tLosses,
        points: tWins * 3 + tDraws,
        winRate: tTotal > 0 ? Math.round((tWins / tTotal) * 100) : 0,
      });
    } catch (err) {
      console.error('팀 성적 집계 오류:', err);
    }
  };

  const handleChangePinCode = async () => {
    if (!selectedTeam) return;
    if (!newPinCode || newPinCode.trim().length < 4) {
      return Alert.alert('알림', '4자리 이상의 새로운 비밀번호를 입력해 주세요.');
    }

    try {
      setActionLoading(true);
      await supabase.from('teams').update({ pin_code: newPinCode.trim() }).eq('id', selectedTeam.id);
      Alert.alert('비밀번호 변경 완료 🔑', '새로운 가입 비밀번호가 설정되었습니다.');
      setPinModalVisible(false);
      setNewPinCode('');
      await fetchMyTeams();
    } catch (err: any) {
      Alert.alert('오류', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const getTeamIcon = (type?: string) => (type === 'club' ? '🏐' : '🏫');

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} hitSlop={10}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>내 소속 팀 관리</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={fetchMyTeams} tintColor={Colors.primary} />}>
        
        {/* 상단 탭 (인라인 강제 스타일로 글자 안보임 문제 100% 원천 차단) */}
        <View style={styles.switcherSection}>
          <Text style={styles.sectionLabel}>내 소속 팀 선택 ({myTeams.length}개 활동 중)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabScroll}>
            {myTeams.map((team) => {
              const isSelected = selectedTeam?.id === team.id;
              const icon = getTeamIcon(team.team_type);
              return (
                <TouchableOpacity
                  key={team.id}
                  style={[
                    styles.teamTabBase,
                    {
                      backgroundColor: isSelected ? '#2563EB' : '#F1F5F9',
                      borderColor: team.is_primary ? '#F59E0B' : isSelected ? '#1D4ED8' : '#CBD5E1',
                      borderWidth: team.is_primary ? 2 : 1.5,
                    }
                  ]}
                  onPress={() => setSelectedTeam(team)}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: '800',
                      color: isSelected ? '#FFFFFF' : '#0F172A', // 🔥 강제 고대비 글자색
                    }}
                  >
                    {team.is_primary ? '⭐ ' : ''}{icon} {team.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity style={styles.addTeamChip} onPress={() => router.push('/profile-setup')}>
              <Text style={styles.addTeamChipText}>+ 팀 추가 가입</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>

        {selectedTeam && (
          <>
            <View style={styles.teamHeaderCard}>
              <View style={styles.teamHeaderTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.regionBadge}>{getTeamIcon(selectedTeam.team_type)} {selectedTeam.team_type === 'club' ? '동호회 팀' : '학교 팀'} • {selectedTeam.region}</Text>
                  <Text style={styles.teamTitle}>{selectedTeam.name}</Text>
                </View>
                {members.length >= 3 ? (
                  <View style={styles.blueRibbonBadge}><Text style={styles.blueRibbonText}>🟦 공식 팀 (3명+)</Text></View>
                ) : (
                  <View style={styles.pendingBadge}><Text style={styles.pendingBadgeText}>🌱 팀원 모집 중 ({members.length}/3)</Text></View>
                )}
              </View>

              <View style={styles.pinBox}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                  <Text style={styles.pinBoxLabel}>🔑 팀 가입 비밀번호</Text>
                  <TouchableOpacity style={styles.changePinBtn} onPress={() => { setNewPinCode(selectedTeam.pin_code); setPinModalVisible(true); }}>
                    <Text style={styles.changePinBtnText}>✏️ 변경</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.pinCodeText}>{selectedTeam.pin_code}</Text>
              </View>
            </View>

            {/* 🔥 전적 명칭 깔끔하게 변경 */}
            <View style={styles.statsSection}>
              <Text style={styles.sectionTitle}>📊 소속 팀 전적</Text>
              
              <Text style={{ fontSize: 13, fontWeight: '800', color: '#2563EB', marginTop: 12, marginBottom: 6 }}>
                📅 2026 상반기 시즌 성적
              </Text>
              <View style={styles.statsGrid}>
                <View style={[styles.statBox, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
                  <Text style={[styles.statValue, { color: '#1D4ED8' }]}>{seasonStats.wins}승 {seasonStats.losses}패</Text>
                  <Text style={[styles.statLabel, { color: '#1E40AF' }]}>시즌 전적 ({seasonStats.winRate}%)</Text>
                </View>
                <View style={[styles.statBox, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
                  <Text style={[styles.statValue, { color: '#1D4ED8' }]}>{seasonStats.points}점</Text>
                  <Text style={[styles.statLabel, { color: '#1E40AF' }]}>시즌 승점 ({seasonStats.totalMatches}전)</Text>
                </View>
              </View>

              <Text style={{ fontSize: 13, fontWeight: '800', color: '#475569', marginTop: 16, marginBottom: 6 }}>
                📜 팀 통산 전체 전적
              </Text>
              <View style={styles.statsGrid}>
                <View style={styles.statBox}>
                  <Text style={styles.statValue}>{totalStats.wins}승 {totalStats.losses}패</Text>
                  <Text style={styles.statLabel}>통산 전적 ({totalStats.winRate}%)</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statValue}>{totalStats.points}점</Text>
                  <Text style={styles.statLabel}>통산 승점 ({totalStats.totalMatches}전)</Text>
                </View>
              </View>
            </View>

            <View style={styles.rosterSection}>
              <Text style={styles.sectionTitle}>👥 팀원 명단 ({members.length}명)</Text>
              <View style={{ gap: 8, marginTop: 10 }}>
                {members.map((m) => (
                  <View key={m.id} style={styles.memberCard}>
                    <Text style={styles.memberName}>{m.full_name} 선생님 {m.id === userId && '(나)'}</Text>
                    <Text style={styles.memberSchool}>🏫 {m.school_name || '미설정'}</Text>
                  </View>
                ))}
              </View>
            </View>
          </>
        )}
      </ScrollView>

      <Modal visible={pinModalVisible} animationType="fade" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>🔑 팀 가입 비밀번호 변경</Text>
            <TextInput style={styles.pinInput} value={newPinCode} onChangeText={setNewPinCode} keyboardType="number-pad" />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <TouchableOpacity style={[styles.closeBtn, { flex: 1 }]} onPress={() => setPinModalVisible(false)}><Text style={styles.closeBtnText}>취소</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.confirmBtn, { flex: 2 }]} onPress={handleChangePinCode}><Text style={styles.confirmBtnText}>변경 저장</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backBtn: { width: 32, height: 32, justifyContent: 'center' },
  backText: { fontSize: 32, color: Colors.text, lineHeight: 32 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: Colors.text },
  scrollContent: { padding: 20, paddingBottom: 40 },
  switcherSection: { marginBottom: 16 },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: Colors.textMuted, marginBottom: 8 },
  tabScroll: { flexDirection: 'row' },
  teamTabBase: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, marginRight: 8 },
  addTeamChip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE', borderStyle: 'dashed' },
  addTeamChipText: { fontSize: 13, fontWeight: '700', color: '#2563EB' },
  teamHeaderCard: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 18, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 16 },
  teamHeaderTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  regionBadge: { fontSize: 12, fontWeight: '700', color: '#0284C7' },
  teamTitle: { fontSize: 22, fontWeight: '800', color: Colors.text, marginVertical: 4 },
  blueRibbonBadge: { backgroundColor: '#EFF6FF', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  blueRibbonText: { fontSize: 11, fontWeight: '800', color: '#2563EB' },
  pendingBadge: { backgroundColor: '#FEF3C7', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  pendingBadgeText: { fontSize: 11, fontWeight: '700', color: '#D97706' },
  pinBox: { backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#E2E8F0', marginTop: 10 },
  pinBoxLabel: { fontSize: 12, fontWeight: '600', color: Colors.textMuted },
  changePinBtn: { backgroundColor: '#EFF6FF', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  changePinBtnText: { fontSize: 11, fontWeight: '700', color: '#2563EB' },
  pinCodeText: { fontSize: 20, fontWeight: '900', color: Colors.primary, letterSpacing: 4, textAlign: 'center', marginTop: 4 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: Colors.text },
  statsSection: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 16 },
  statsGrid: { flexDirection: 'row', gap: 8 },
  statBox: { flex: 1, backgroundColor: '#F8FAFC', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#F1F5F9', alignItems: 'center' },
  statValue: { fontSize: 15, fontWeight: '800', color: Colors.text },
  statLabel: { fontSize: 11, color: Colors.textMuted, fontWeight: '600', marginTop: 2 },
  rosterSection: { marginTop: 6 },
  memberCard: { backgroundColor: '#FFFFFF', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#F1F5F9', flexDirection: 'row', justifyContent: 'space-between' },
  memberName: { fontSize: 14, fontWeight: '700', color: Colors.text },
  memberSchool: { fontSize: 12, color: Colors.textMuted },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: Colors.surface, borderRadius: 20, padding: 20, width: '100%' },
  modalTitle: { fontSize: 17, fontWeight: '800', color: Colors.text, marginBottom: 12 },
  pinInput: { borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 10, padding: 12, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  closeBtn: { backgroundColor: '#F1F5F9', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  closeBtnText: { color: Colors.text, fontWeight: '700' },
  confirmBtn: { backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  confirmBtnText: { color: '#FFFFFF', fontWeight: '800' },
});