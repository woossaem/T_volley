import React, { useEffect, useState, useMemo } from 'react';
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
import { supabase } from '../lib/supabase';
import { Colors } from '../constants/Colors';

const REGION_TABS = ['전체', '천안', '아산', '세종', '대전', '서울/경기', '기타'];

interface TeamData {
  team_id: string;
  team_name: string;
  region: string;
  team_type: 'school' | 'club'; // 🏫 학교팀 vs 🏐 동호회팀
  members: string[]; // 마스킹 및 가나다순 정렬된 이름
  rawMembers: string[]; // 원본 이름
  memberCount: number;
  isOfficial: boolean;
}

// 🔥 이름 자동 마스킹 함수
const maskName = (name: string) => {
  if (!name || name === '선생님') return '팀*'; // '교*' 에서 '팀*' 으로 중립적 변경
  if (name.length === 1) return name;
  if (name.length === 2) return name.charAt(0) + '*';
  
  const first = name.charAt(0);
  const last = name.charAt(name.length - 1);
  const middle = '*'.repeat(name.length - 2);
  return first + middle + last;
};

export default function AllTeamsListScreen() {
  const router = useRouter();
  const [teams, setTeams] = useState<TeamData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // 📍 지역 및 정렬 상태
  const [selectedRegion, setSelectedRegion] = useState('전체');
  const [sortType, setSortType] = useState<'popular' | 'recruiting'>('popular');

  // 🔥 팀원 목록 펼쳐보기 상태 관리 (펼쳐진 팀의 ID 저장)
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);

  const fetchTeams = async () => {
    try {
      const { data, error } = await supabase
        .from('team_members')
        .select(`
          team_id,
          teams (id, name, region, team_type),
          profiles (full_name)
        `)
        .eq('is_active', true);

      if (error) throw error;

      const teamMap = new Map<string, { name: string; region: string; team_type: 'school' | 'club'; members: string[] }>();

      data?.forEach((item: any) => {
        const team = item.teams;
        const profile = item.profiles;

        if (!team || !team.name) return;

        const existing = teamMap.get(team.id) || {
          name: team.name,
          region: team.region || '천안',
          team_type: team.team_type || 'school',
          members: [],
        };

        const memberName = profile?.full_name || '팀원';
        if (!existing.members.includes(memberName)) {
          existing.members.push(memberName);
        }

        teamMap.set(team.id, existing);
      });

      const teamList: TeamData[] = Array.from(teamMap.entries()).map(([team_id, info]) => {
        const sortedMembers = [...info.members].sort((a, b) => a.localeCompare(b, 'ko-KR'));
        const maskedMembers = sortedMembers.map(maskName);

        return {
          team_id,
          team_name: info.name,
          region: info.region,
          team_type: info.team_type,
          members: maskedMembers,
          rawMembers: sortedMembers,
          memberCount: info.members.length,
          isOfficial: info.members.length >= 3,
        };
      });

      setTeams(teamList);
    } catch (err) {
      console.error('팀 목록 불러오기 오류:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchTeams();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    setExpandedTeamId(null); // 새로고침 시 펼침 상태 초기화
    fetchTeams();
  };

  const filteredAndSortedTeams = useMemo(() => {
    let result = [...teams];

    if (selectedRegion !== '전체') {
      if (selectedRegion === '기타') {
        const mainRegions = ['천안', '아산', '세종', '대전', '서울/경기'];
        result = result.filter((t) => !mainRegions.includes(t.region));
      } else {
        result = result.filter((t) => t.region === selectedRegion);
      }
    }

    result.sort((a, b) => {
      if (sortType === 'popular') {
        if (a.isOfficial !== b.isOfficial) return a.isOfficial ? -1 : 1;
        if (b.memberCount !== a.memberCount) return b.memberCount - a.memberCount;
        return a.team_name.localeCompare(b.team_name, 'ko-KR');
      } else {
        if (a.isOfficial !== b.isOfficial) return a.isOfficial ? 1 : -1;
        if (a.memberCount !== b.memberCount) return a.memberCount - b.memberCount;
        return a.team_name.localeCompare(b.team_name, 'ko-KR');
      }
    });

    return result;
  }, [teams, selectedRegion, sortType]);

  return (
    <SafeAreaView style={styles.container}>
      {/* 1. 상단 헤더 */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} hitSlop={10}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>전체 팀 목록</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => router.push('/profile-setup')}>
          <Text style={styles.addBtnText}>+ 개설</Text>
        </TouchableOpacity>
      </View>

      {/* 📍 2. 지역 탭 */}
      <View style={styles.regionTabWrapper}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.regionTabScroll}>
          {REGION_TABS.map((region) => (
            <TouchableOpacity
              key={region}
              style={[styles.regionTab, selectedRegion === region && styles.regionTabActive]}
              onPress={() => {
                setSelectedRegion(region);
                setExpandedTeamId(null); // 탭 이동 시 펼침 초기화
              }}
            >
              <Text style={[styles.regionTabText, selectedRegion === region && styles.regionTabTextActive]}>
                {region}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* 🔄 3. 정렬 버튼 */}
      <View style={styles.sortWrapper}>
        <TouchableOpacity
          style={[styles.sortBtn, sortType === 'popular' && styles.sortBtnActive]}
          onPress={() => setSortType('popular')}
        >
          <Text style={[styles.sortBtnText, sortType === 'popular' && styles.sortBtnTextActive]}>
            🔥 대형·공식 팀 우선
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.sortBtn, sortType === 'recruiting' && styles.sortBtnActive]}
          onPress={() => setSortType('recruiting')}
        >
          <Text style={[styles.sortBtnText, sortType === 'recruiting' && styles.sortBtnTextActive]}>
            🌱 신규·모집 팀 우선
          </Text>
        </TouchableOpacity>
      </View>

      {/* 4. 팀 카드 목록 */}
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        <View style={styles.infoBanner}>
          <Text style={styles.infoBannerIcon}>💡</Text>
          <Text style={styles.infoBannerText}>
            같은 팀에 <Text style={{ fontWeight: '800' }}>3명 이상</Text> 모이면{'\n'}
            <Text style={{ color: '#0284C7', fontWeight: '800' }}>블루리본(🟦) 공식 팀</Text>으로 자동 승격됩니다!
          </Text>
        </View>

        {loading ? (
          <ActivityIndicator color={Colors.primary} size="large" style={{ marginTop: 40 }} />
        ) : filteredAndSortedTeams.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyEmoji}>👀</Text>
            <Text style={styles.emptyText}>선택하신 지역/조건의 팀이 아직 없습니다.</Text>
          </View>
        ) : (
          filteredAndSortedTeams.map((team) => {
            const isSchool = team.team_type === 'school';
            
            // 🔥 펼쳐보기 상태 확인
            const isExpanded = expandedTeamId === team.team_id;
            const MAX_DISPLAY = 3;
            const extraCount = team.memberCount - MAX_DISPLAY;
            
            // 펼쳐져 있으면 전체 멤버를, 아니면 최대 3명만 추출
            const displayMembers = isExpanded ? team.members : team.members.slice(0, MAX_DISPLAY);

            return (
              <View key={team.team_id} style={[styles.teamCard, team.isOfficial && styles.teamCardOfficial]}>
                <View style={styles.teamHeader}>
                  <View style={styles.teamNameRow}>
                    <Text style={styles.teamName}>{team.team_name}</Text>

                    <View style={[styles.typeBadge, isSchool ? styles.schoolTypeBadge : styles.clubTypeBadge]}>
                      <Text style={[styles.typeBadgeText, isSchool ? styles.schoolTypeBadgeText : styles.clubTypeBadgeText]}>
                        {isSchool ? '🏫 학교' : '🏐 동호회'}
                      </Text>
                    </View>

                    <Text style={styles.regionTag}>[{team.region}]</Text>

                    {team.isOfficial && (
                      <View style={styles.blueRibbon}>
                        <Text style={styles.blueRibbonText}>🟦 공식</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.countBadge}>
                    <Text style={styles.countText}>{team.memberCount}명</Text>
                  </View>
                </View>

                {/* 🔥 명칭 변경: 소속 교사 -> 소속 팀원 */}
                <View style={styles.membersArea}>
                  <Text style={styles.membersLabel}>👥 소속 팀원 현황</Text>
                  <View style={styles.membersList}>
                    {displayMembers.map((member, mIndex) => (
                      <View key={mIndex} style={styles.memberTag}>
                        <Text style={styles.memberTagText}>{member}</Text>
                      </View>
                    ))}
                    
                    {/* 전체보기 토글 버튼 로직 */}
                    {extraCount > 0 && !isExpanded && (
                      <TouchableOpacity 
                        style={[styles.memberTag, styles.extraMemberTag]}
                        onPress={() => setExpandedTeamId(team.team_id)}
                      >
                        <Text style={styles.extraMemberTagText}>+{extraCount}명 전체보기</Text>
                      </TouchableOpacity>
                    )}

                    {isExpanded && extraCount > 0 && (
                      <TouchableOpacity 
                        style={[styles.memberTag, styles.collapseTag]}
                        onPress={() => setExpandedTeamId(null)}
                      >
                        <Text style={styles.collapseTagText}>- 닫기</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>

                {!team.isOfficial && (
                  <Text style={styles.needMoreText}>
                    🌱 팀원 적극 모집 중! (블루리본까지 {3 - team.memberCount}명)
                  </Text>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: {
    width: 32,
    height: 32,
    justifyContent: 'center',
  },
  backText: {
    fontSize: 32,
    color: Colors.text,
    lineHeight: 32,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
  },
  addBtn: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  addBtnText: {
    color: '#1D4ED8',
    fontWeight: '700',
    fontSize: 14,
  },

  regionTabWrapper: {
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingVertical: 10,
  },
  regionTabScroll: {
    paddingHorizontal: 20,
    gap: 8,
  },
  regionTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
  },
  regionTabActive: {
    backgroundColor: Colors.primary,
  },
  regionTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  regionTabTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  sortWrapper: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginTop: 14,
    gap: 8,
  },
  sortBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
  },
  sortBtnActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#3B82F6',
  },
  sortBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  sortBtnTextActive: {
    color: '#1D4ED8',
    fontWeight: '800',
  },

  content: {
    padding: 20,
    gap: 16,
  },
  infoBanner: {
    flexDirection: 'row',
    backgroundColor: '#F0F9FF',
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#BAE6FD',
    alignItems: 'center',
    marginBottom: 4,
  },
  infoBannerIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  infoBannerText: {
    fontSize: 14,
    color: '#0369A1',
    lineHeight: 20,
    flex: 1,
  },

  emptyContainer: {
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 16,
    color: Colors.textMuted,
  },

  teamCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  teamCardOfficial: {
    borderColor: '#93C5FD',
    backgroundColor: '#FAFAFA',
    borderWidth: 1.5,
  },
  teamHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  teamNameRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  teamName: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.primary,
  },

  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  schoolTypeBadge: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  schoolTypeBadgeText: {
    color: '#166534',
    fontSize: 11,
    fontWeight: '800',
  },
  clubTypeBadge: {
    backgroundColor: '#FEFCE8',
    borderColor: '#FDE047',
  },
  clubTypeBadgeText: {
    color: '#A16207',
    fontSize: 11,
    fontWeight: '800',
  },

  regionTag: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  blueRibbon: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  blueRibbonText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1D4ED8',
  },
  countBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginLeft: 10,
  },
  countText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },

  membersArea: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 14,
  },
  membersLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 10,
  },
  membersList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  memberTag: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  memberTagText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text,
  },
  
  // 🔥 전체보기 / 닫기 버튼 스타일
  extraMemberTag: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  extraMemberTagText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1D4ED8',
  },
  collapseTag: {
    backgroundColor: '#F1F5F9',
    borderColor: '#CBD5E1',
  },
  collapseTagText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },

  needMoreText: {
    fontSize: 12,
    color: '#10B981',
    fontWeight: '700',
    marginTop: 12,
    textAlign: 'right',
  },
});