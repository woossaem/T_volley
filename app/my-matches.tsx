import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  SafeAreaView,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Colors } from '../constants/Colors';

interface MatchHistoryItem {
  id: string;
  match_date: string;
  match_time: string;
  location: string;
  host_team_name: string;
  away_team_name: string;
  winner_team: string;
  set_scores?: string;
  status: string;
  host_roster?: string;
  away_roster?: string;
  host_team_type?: 'school' | 'club';
  away_team_type?: 'school' | 'club';
  host_region?: string;
  away_region?: string;
}

export default function MyMatchesScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [history, setHistory] = useState<MatchHistoryItem[]>([]);
  const [myTeamNames, setMyTeamNames] = useState<string[]>([]);

  const userId = session?.user?.id;

  const fetchHistory = async () => {
    if (!userId) return;
    try {
      const { data: tmData } = await supabase
        .from('team_members')
        .select('teams(name)')
        .eq('user_id', userId)
        .eq('is_active', true);

      const teamNames = tmData?.map((tm: any) => tm.teams?.name).filter(Boolean) || [];
      setMyTeamNames(teamNames);

      const { data: allTeamsData } = await supabase
        .from('teams')
        .select('name, team_type, region');

      const teamInfoMap = new Map<string, { type: 'school' | 'club'; region: string }>();
      (allTeamsData || []).forEach((t: any) => {
        teamInfoMap.set(t.name, {
          type: t.team_type || 'school',
          region: t.region || '천안',
        });
      });

      const { data: matchesData } = await supabase
        .from('matches')
        .select('*')
        .order('match_date', { ascending: false });

      if (matchesData) {
        formatAndSetHistory(matchesData, teamInfoMap);
      }
    } catch (err) {
      console.error('경기 이력 조회 오류:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const formatAndSetHistory = (rawMatches: any[], teamInfoMap: Map<string, any>) => {
    const formatted: MatchHistoryItem[] = rawMatches
      .filter((m) => m.status === 'completed' || m.status === 'friendly')
      .map((m) => {
        const hostInfo = teamInfoMap.get(m.host_team_name) || { type: 'school', region: '천안' };
        const awayInfo = teamInfoMap.get(m.away_team_name) || { type: 'school', region: '천안' };

        return {
          id: m.id,
          match_date: m.match_date,
          match_time: m.match_time,
          location: m.location,
          host_team_name: m.host_team_name,
          away_team_name: m.away_team_name || '미등록 팀',
          winner_team: m.winner_team,
          set_scores: m.set_scores,
          status: m.status,
          host_roster: m.host_roster,
          away_roster: m.away_roster,
          host_team_type: hostInfo.type,
          away_team_type: awayInfo.type,
          host_region: hostInfo.region,
          away_region: awayInfo.region,
        };
      });

    setHistory(formatted);
  };

  useEffect(() => {
    fetchHistory();
  }, [session]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchHistory();
  };

  const getTeamBadgeText = (teamName: string, teamType?: string, region?: string) => {
    if (teamType === 'club') {
      return `🏐 [${region || '천안'}] 동호회`;
    }
    return `🏫 학교 팀 (${region || '충남'})`;
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} hitSlop={10}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>역대 경기 상세 이력</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        {loading ? (
          <ActivityIndicator color={Colors.primary} size="large" style={{ marginTop: 40 }} />
        ) : history.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>🏐</Text>
            <Text style={styles.emptyText}>종료된 경기 기록이 없습니다.</Text>
          </View>
        ) : (
          history.map((item) => {
            // 🔥 내가 실제로 출전 체크된 팀을 1순위로 조회하여 승/패 정밀 판정
            const playedInHost = item.host_roster?.split(',').includes(userId || '');
            const playedInAway = item.away_roster?.split(',').includes(userId || '');

            let myTeam = '';
            if (playedInHost) {
              myTeam = item.host_team_name;
            } else if (playedInAway) {
              myTeam = item.away_team_name;
            } else {
              // 출전 명단 기록이 없는 구버전 데이터 호환
              myTeam = myTeamNames.includes(item.host_team_name) ? item.host_team_name : item.away_team_name;
            }

            const isWin = item.winner_team === myTeam;
            const isDraw = item.winner_team === 'draw' || item.winner_team === '무승부';

            return (
              <View key={item.id} style={styles.historyCard}>
                <View style={styles.cardHeader}>
                  <Text style={styles.dateText}>📅 {item.match_date} ({item.match_time})</Text>
                  <View style={[styles.resultBadge, isWin ? styles.winBadge : isDraw ? styles.drawBadge : styles.lossBadge]}>
                    <Text style={[styles.resultBadgeText, isWin ? styles.winText : isDraw ? styles.drawText : styles.lossText]}>
                      {isWin ? '승리 🏆' : isDraw ? '무승부 🤝' : '패배 💧'}
                    </Text>
                  </View>
                </View>

                <View style={styles.versusBox}>
                  <View style={styles.teamCol}>
                    <Text style={styles.teamNameText}>{item.host_team_name}</Text>
                    <Text style={styles.teamSubText}>
                      {getTeamBadgeText(item.host_team_name, item.host_team_type, item.host_region)}
                    </Text>
                  </View>

                  <Text style={styles.vsText}>VS</Text>

                  <View style={styles.teamCol}>
                    <Text style={styles.teamNameText}>{item.away_team_name}</Text>
                    <Text style={styles.teamSubText}>
                      {getTeamBadgeText(item.away_team_name, item.away_team_type, item.away_region)}
                    </Text>
                  </View>
                </View>

                {item.set_scores ? (
                  <View style={styles.scoreRow}>
                    <Text style={styles.scoreLabel}>📊 세트 스코어:</Text>
                    <Text style={styles.scoreVal}>{item.set_scores}</Text>
                  </View>
                ) : null}

                <View style={styles.locationRow}>
                  <Text style={styles.locationText}>📍 장소: {item.location}</Text>
                </View>
              </View>
            );
          })
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
  content: { padding: 20, gap: 16 },
  emptyContainer: { alignItems: 'center', paddingTop: 80 },
  emptyIcon: { fontSize: 50, marginBottom: 16 },
  emptyText: { fontSize: 16, fontWeight: '600', color: Colors.textMuted },
  historyCard: { backgroundColor: Colors.surface, borderRadius: 16, padding: 18, borderWidth: 1, borderColor: Colors.border, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  dateText: { fontSize: 13, fontWeight: '700', color: '#64748B' },
  resultBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  winBadge: { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' },
  winText: { color: '#1D4ED8', fontWeight: '800', fontSize: 12 },
  drawBadge: { backgroundColor: '#F1F5F9', borderColor: '#CBD5E1' },
  drawText: { color: '#475569', fontWeight: '800', fontSize: 12 },
  lossBadge: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  lossText: { color: '#DC2626', fontWeight: '800', fontSize: 12 },
  versusBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F8FAFC', padding: 14, borderRadius: 12, marginBottom: 10 },
  teamCol: { flex: 1, alignItems: 'center' },
  teamNameText: { fontSize: 16, fontWeight: '800', color: Colors.text, marginBottom: 2, textAlign: 'center' },
  teamSubText: { fontSize: 11, fontWeight: '700', color: '#64748B' },
  vsText: { fontSize: 14, fontWeight: '900', color: '#94A3B8', marginHorizontal: 8 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F0F9FF', padding: 10, borderRadius: 8, marginBottom: 8 },
  scoreLabel: { fontSize: 12, fontWeight: '700', color: '#0369A1' },
  scoreVal: { fontSize: 13, fontWeight: '800', color: '#0284C7' },
  locationRow: { paddingLeft: 4 },
  locationText: { fontSize: 12, color: '#64748B', fontWeight: '500' },
});