import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
  Modal,
  TouchableOpacity,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Colors } from '../constants/Colors';
import StickyAdBanner from '../components/StickyAdBanner';
import BadgeCollectionModal from '../components/BadgeCollectionModal';
import { getAllBadgesWithStatus, BadgeItem } from '../lib/badgeUtils';

const MENU_ITEMS = [
  { id: 'matches', emoji: '📅', label: '경기 목록', route: '/matches' },
  { id: 'register', emoji: '➕', label: '경기 등록', route: '/create-match' },
  { id: 'teams', emoji: '👥', label: '팀 목록', route: '/teams' },
  { id: 'ranking', emoji: '🏆', label: '랭킹 보기', route: '/rankings' },
  { id: 'intramural', emoji: '⚔️', label: '자체 내전', route: '/intramural' },
  { id: 'history', emoji: '📜', label: '내 경기 이력', route: '/my-match-history' },
] as const;

interface UserProfile {
  fullName: string;
  schoolName?: string;
  gender?: string;
  position?: string;
  avatarIcon?: string;
  avatarUrl?: string;
  teams: { id: string; name: string }[];
}

interface AppNotification {
  id: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

export default function HomeScreen() {
  const router = useRouter();
  const { session, signOut } = useAuth();
  const userId = session?.user?.id;

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotiModal, setShowNotiModal] = useState(false);
  const [showTeamsModal, setShowTeamsModal] = useState(false);
  const [badgeModalVisible, setBadgeModalVisible] = useState(false); // 💡 칭호 도감 모달 State
  const [equippedBadgeIds, setEquippedBadgeIds] = useState<string[]>([]); // 💡 대표 장착 칭호 ID 배열 (최대 2개)
  const [loading, setLoading] = useState(true);

  const [stats, setStats] = useState({ total: 0, wins: 0, winRate: 0, recent5: [] as string[] });
  const [invitedCount, setInvitedCount] = useState(0);

  const [userActivityStats, setUserActivityStats] = useState({
    recordCount: 0,
    praiseCount: 0,
    monthlyAttendance: 0,
  });

  const [liveMatch, setLiveMatch] = useState<any>(null);

  const parseTeamName = (rawName: any): string => {
    if (!rawName) return '';
    if (typeof rawName === 'string') {
      const trimmed = rawName.trim();
      if (!trimmed || trimmed === 'null' || trimmed === 'undefined') return '';
      if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
        try { return parseTeamName(JSON.parse(trimmed)); } catch (e) {}
      }
      return trimmed;
    }
    if (Array.isArray(rawName)) {
      if (rawName.length === 0) return '';
      for (const item of rawName) {
        const parsed = parseTeamName(item);
        if (parsed) return parsed;
      }
    }
    if (typeof rawName === 'object') {
      const candidate = rawName.name || rawName.team_name || rawName.title || rawName.formatted;
      if (candidate && candidate !== rawName) {
        const parsedCand = parseTeamName(candidate);
        if (parsedCand) return parsedCand;
      }
      for (const key of Object.keys(rawName)) {
        if (typeof rawName[key] === 'string' && rawName[key].trim().length > 0 && !['id', 'team_id', 'user_id', 'team_type', 'region'].includes(key)) {
          return rawName[key].trim();
        }
      }
    }
    return '';
  };

  useFocusEffect(
    useCallback(() => {
      fetchDashboardData();
      fetchNotifications();
    }, [session])
  );

  const fetchDashboardData = async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    try {
      const { data: profData } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
      const { data: tmData } = await supabase
        .from('team_members')
        .select('is_primary, teams(id, name, team_type)')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('is_primary', { ascending: false });

      const teamList: { id: string; name: string }[] = [];
      const addedIds = new Set<string>();

      (tmData || []).forEach((tm: any) => {
        const teamObj = Array.isArray(tm.teams) ? tm.teams[0] : tm.teams;
        if (teamObj && teamObj.id && !addedIds.has(teamObj.id)) {
          const parsed = parseTeamName(teamObj.name || teamObj);
          if (parsed) {
            addedIds.add(teamObj.id);
            teamList.push({ id: teamObj.id, name: parsed });
          }
        }
      });

      if (!profData && teamList.length === 0) {
        router.replace('/profile-setup');
        return;
      }

      setProfile({
        fullName: profData?.full_name || session?.user?.user_metadata?.full_name || '선생님',
        schoolName: profData?.school_name || '학교 미설정',
        gender: profData?.gender || '남성',
        position: profData?.position || '포지션 미설정',
        avatarIcon: profData?.avatar_icon || '🏐',
        avatarUrl: profData?.avatar_url || undefined,
        teams: teamList,
      });

      const { count: invCount } = await supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('invited_by', userId);
      setInvitedCount(invCount || 0);

      const teamNames = teamList.map(t => t.name);

      const { data: activeMatches } = await supabase
        .from('matches')
        .select('*')
        .in('status', ['matched', 'pending_result'])
        .order('created_at', { ascending: false });

      const currentLive = activeMatches?.find((m: any) => {
        const isMyTeamHost = teamNames.includes(m.host_team_name);
        const isMyTeamAway = m.away_team_name ? teamNames.includes(m.away_team_name) : false;
        
        const hostRoster = m.host_roster || '';
        const awayRoster = m.away_roster || '';
        const inHostRoster = hostRoster.includes(userId);
        const inAwayRoster = awayRoster.includes(userId);

        return (isMyTeamHost || isMyTeamAway) && (inHostRoster || inAwayRoster);
      });

      setLiveMatch(currentLive || null);

      const { data: matchesData } = await supabase.from('matches')
        .select('host_team_name, away_team_name, host_roster, away_roster, host_mercenary_roster, away_mercenary_roster, status, winner_team, host_user_id')
        .eq('status', 'completed')
        .order('match_date', { ascending: false });

      let total = 0, wins = 0, recordCount = 0;
      const recent5: string[] = [];

      matchesData?.forEach(m => {
        if (m.host_user_id === userId) recordCount++;

        const inH = (m.host_roster || '').includes(userId) || (m.host_mercenary_roster || '').includes(userId);
        const inA = (m.away_roster || '').includes(userId) || (m.away_mercenary_roster || '').includes(userId);

        if (inH || inA) {
          total++;
          let isWin = false;
          let isDraw = m.winner_team === 'draw' || m.winner_team === '무승부';

          const myTeam = inH ? m.host_team_name : m.away_team_name;
          if (m.winner_team === myTeam) isWin = true;

          if (isWin) wins++;
          if (recent5.length < 5) recent5.push(isWin ? 'WIN' : isDraw ? 'DRAW' : 'LOSS');
        }
      });

      const { count: tagCount } = await supabase.from('user_tags').select('id', { count: 'exact', head: true }).eq('sender_id', userId);

      setUserActivityStats({
        recordCount,
        praiseCount: tagCount || 0,
        monthlyAttendance: total,
      });

      recent5.reverse();
      setStats({ total, wins, winRate: total > 0 ? Math.round((wins / total) * 100) : 0, recent5 });

    } catch (err) {
      console.error('대시보드 로드 오류:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchNotifications = async () => {
    if (!userId) return;
    try {
      const { data } = await supabase.from('notifications').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(30);
      if (data) {
        setNotifications(data);
        setUnreadCount(data.filter(n => !n.is_read).length);
      }
    } catch (err) { console.error('알림 조회 실패:', err); }
  };

  const handleOpenNotifications = async () => {
    setShowNotiModal(true);
    if (unreadCount > 0 && userId) {
      await supabase.from('notifications').update({ is_read: true }).eq('user_id', userId).eq('is_read', false);
      setUnreadCount(0);
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    }
  };

  const handleClearAllNotifications = () => {
    if (notifications.length === 0) return;
    Alert.alert('알림 정리', '모든 알림 내역을 삭제하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: async () => {
          if (!userId) return;
          try {
            await supabase.from('notifications').delete().eq('user_id', userId);
            setNotifications([]); setUnreadCount(0);
          } catch (err: any) { Alert.alert('오류', err.message); }
        }
      },
    ]);
  };

  const handleSignOut = () => {
    Alert.alert('로그아웃', '정말 로그아웃 하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      { text: '로그아웃', style: 'destructive', onPress: async () => { await signOut(); router.replace('/login'); } },
    ]);
  };

  const handleGoToLiveMatch = () => {
    if (!liveMatch) return;
    router.push({
      pathname: '/matches',
      params: { matchId: liveMatch.id, autoOpen: 'result' },
    });
  };

  const formatLiveSetInfo = (match: any) => {
    if (!match) return '진행 중';
    if (!match.set_scores || match.set_scores.trim() === '') {
      return '1세트 진행 중';
    }
    const sets = match.set_scores.split(',').map((s: string) => s.trim()).filter(Boolean);
    if (sets.length === 0) return '1세트 진행 중';

    const completedText = sets.map((score: string, idx: number) => `${idx + 1}세트 ${score}`).join(' · ');
    const currentSetNum = sets.length + 1;
    return `${completedText} · ${currentSetNum}세트 진행 중`;
  };

  const auraInfo = useMemo(() => {
    if (invitedCount >= 10) return { style: styles.auraPlatinum };
    if (invitedCount >= 5) return { style: styles.auraGold };
    if (invitedCount >= 3) return { style: styles.auraSilver };
    if (invitedCount >= 1) return { style: styles.auraBronze };
    return { style: styles.auraNone };
  }, [invitedCount]);

  // 💡 유저 가공 파라미터
  const badgeUserParams = useMemo(() => ({
    stats: { losses: 0, draws: 0, ...stats, recent5: stats.recent5 || [] },
    userActivityStats: {
      recordCount: userActivityStats.recordCount || 0,
      praiseCount: userActivityStats.praiseCount || 0,
    },
    invitedCount: invitedCount || 0,
    gender: profile?.gender || '남성',
  }), [stats, userActivityStats, invitedCount, profile?.gender]);

  // 💡 전체 칭호 중 해금된 대표 칭호 최대 2개 추출 (수동 장착 없으면 상위 2개 자동)
  const equippedBadges = useMemo(() => {
    const allBadges = getAllBadgesWithStatus(badgeUserParams);
    const unlocked = allBadges.filter(b => b.isUnlocked);

    if (equippedBadgeIds.length > 0) {
      const equipped = allBadges.filter(b => equippedBadgeIds.includes(b.id) && b.isUnlocked);
      if (equipped.length > 0) return equipped;
    }
    return unlocked.slice(0, 2); // 기본 수동선택 없으면 해금 상위 2개 노출
  }, [badgeUserParams, equippedBadgeIds]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar style="light" />
      
      {/* 헤더 */}
      <View style={styles.header}>
        <View style={styles.logoRow}>
          <View style={styles.logoBadge}><Text style={styles.logoEmoji}>🏐</Text></View>
          <Text style={styles.logoText}>T volley</Text>
        </View>
        <View style={styles.headerRight}>
          <Pressable style={({ pressed }) => [styles.bellButton, pressed && styles.pressed]} onPress={handleOpenNotifications} hitSlop={8}>
            <Text style={styles.bellIcon}>🔔</Text>
            {unreadCount > 0 && <View style={styles.notiBadge}><Text style={styles.notiBadgeText}>{unreadCount}</Text></View>}
          </Pressable>
          <Pressable style={({ pressed }) => [styles.logoutButton, pressed && styles.pressed]} onPress={handleSignOut} hitSlop={8}>
            <Text style={styles.logoutText}>로그아웃</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* 1. 🔴 LIVE 진행 경기 바 */}
        {liveMatch && (
          <TouchableOpacity 
            style={styles.liveMatchBarSlim}
            onPress={handleGoToLiveMatch}
            activeOpacity={0.85}
          >
            <View style={styles.liveBarTopRow}>
              <View style={styles.liveBarLeft}>
                <View style={styles.liveDotPill}><Text style={styles.liveDotPillText}>🔴 LIVE</Text></View>
                <Text style={styles.liveBarTeamsText} numberOfLines={1}>
                  {liveMatch.host_team_name} vs {liveMatch.away_team_name || '상대팀'}
                </Text>
              </View>
              <Text style={styles.liveBarActionText}>실시간 확인/입력 ›</Text>
            </View>

            <View style={styles.liveBarScoreRow}>
              <Text style={styles.liveBarScoreText} numberOfLines={1}>
                📊 {formatLiveSetInfo(liveMatch)}
              </Text>
            </View>
          </TouchableOpacity>
        )}

        {/* 무소속 유저 온보딩 카드 */}
        {profile && profile.teams.length === 0 && (
          <View style={styles.onboardingCard}>
            <Text style={styles.onboardingTitle}>🔰 아직 소속된 배구 팀이 없으신가요?</Text>
            <Text style={styles.onboardingSub}>
              팀에 가입하시면 교류전 신청, 3x3 스마트 라인업, 매너 온도 관리 등 티볼리의 주요 기능을 자유롭게 이용하실 수 있습니다!
            </Text>
            <TouchableOpacity style={styles.onboardingBtn} onPress={() => router.push('/team-management')}>
              <Text style={styles.onboardingBtnText}>👉 3초 만에 팀 검색 / 가입하기</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* 💡 스마트 프로필 카드 */}
        <View style={styles.profileCard}>
          {loading ? (
            <ActivityIndicator color={Colors.primary} style={{ padding: 20 }} />
          ) : (
            <View style={{ width: '100%' }}>
              
              {/* 1영역: 프로필 정보 전체 터치 ➔ 프로필 수정 이동 */}
              <TouchableOpacity
                style={styles.profileHeaderRow}
                onPress={() => router.push('/profile-setup')}
                activeOpacity={0.7}
              >
                <View style={[styles.avatarCircle, auraInfo.style]}>
                  {profile?.avatarUrl ? (
                    <Image source={{ uri: profile.avatarUrl }} style={styles.avatarImage} />
                  ) : (
                    <Text style={{ fontSize: 24 }}>{profile?.avatarIcon || '🏐'}</Text>
                  )}
                </View>

                <View style={styles.profileInfo}>
                  <View style={styles.nameRow}>
                    <Text style={styles.profileName}>{profile?.fullName || '선생님'} 선생님</Text>
                    <View style={[styles.genderTag, profile?.gender === '여성' ? styles.femaleTag : styles.maleTag]}>
                      <Text style={[styles.genderTagText, profile?.gender === '여성' ? styles.femaleText : styles.maleText]}>
                        {profile?.gender || '남성'}
                      </Text>
                    </View>

                    {/* 💡 [개선] 2개 대표 칭호 가로 노출 & 터치 시 [칭호 도감 모달] 오픈 */}
                    <View style={{ flexDirection: 'row', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                      {equippedBadges.map((badge) => (
                        <TouchableOpacity
                          key={badge.id}
                          activeOpacity={0.8}
                          onPress={(e) => {
                            e.stopPropagation(); // 👈 부모 클릭(프로필 이동) 방지
                            setBadgeModalVisible(true);
                          }}
                          style={[styles.autoTitleBadge, badge.style]}
                        >
                          <Text style={[styles.autoTitleText, { color: badge.style.color }]}>
                            {badge.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  <View style={{ marginTop: 3 }}>
                    <Text style={styles.subDetailText} numberOfLines={1}>
                      🏫 {profile?.schoolName || '학교 미설정'} · 👟 {profile?.position || '포지션 미설정'}
                    </Text>
                  </View>
                </View>

                <Text style={styles.profileHeaderArrow}>›</Text>
              </TouchableOpacity>

              {/* 2영역: 소속팀 스위퍼 & ⚙️ 팀 관리 버튼 */}
              <View style={styles.teamSectionRow}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.teamChipsContainer}>
                  {profile?.teams && profile.teams.length > 0 ? (
                    <>
                      {profile.teams.slice(0, 2).map((tObj) => (
                        <TouchableOpacity
                          key={tObj.id}
                          style={styles.teamChip}
                          onPress={() => router.push({ pathname: '/my-team-detail', params: { teamId: tObj.id } })}
                        >
                          <Text style={styles.teamChipText}>🛡️ {tObj.name}</Text>
                        </TouchableOpacity>
                      ))}

                      {profile.teams.length > 2 && (
                        <TouchableOpacity
                          style={styles.teamMoreChip}
                          onPress={() => setShowTeamsModal(true)}
                        >
                          <Text style={styles.teamMoreChipText}>+{profile.teams.length - 2}개</Text>
                        </TouchableOpacity>
                      )}
                    </>
                  ) : (
                    <TouchableOpacity onPress={() => router.push('/team-management')}>
                      <Text style={styles.noTeamText}>+ 팀 가입 또는 창단하기 ➔</Text>
                    </TouchableOpacity>
                  )}
                </ScrollView>

                <TouchableOpacity
                  style={styles.cardHeaderSetupBtn}
                  onPress={() => router.push('/my-team-detail')}
                  hitSlop={6}
                >
                  <Text style={styles.cardHeaderSetupBtnText}>⚙️ 팀 관리 ›</Text>
                </TouchableOpacity>
              </View>

              {/* 3영역: 통산 전적 콤팩트 리포트 */}
              <TouchableOpacity
                style={styles.statsSummaryContainer}
                onPress={() => router.push('/profile')}
                activeOpacity={0.85}
              >
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>공식전 통산 승률</Text>
                  <Text style={styles.statValue}>
                    {stats.winRate}% <Text style={{ fontSize: 10, color: Colors.textMuted, fontWeight: '600' }}>({stats.total}전 {stats.wins}승)</Text>
                  </Text>
                </View>
                <View style={styles.verticalDivider} />
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>최근 5경기 (공식)</Text>
                  {stats.recent5.length > 0 ? (
                    <View style={styles.recentFormRow}>
                      {stats.recent5.map((res, i) => (
                        <View key={i} style={[styles.formBadge, res === 'WIN' ? styles.formWin : res === 'DRAW' ? styles.formDraw : styles.formLoss]}>
                          <Text style={styles.formBadgeText}>{res === 'WIN' ? '승' : res === 'DRAW' ? '무' : '패'}</Text>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Text style={{ fontSize: 10, color: Colors.textMuted, marginTop: 1, fontWeight: '600' }}>기록 없음</Text>
                  )}
                </View>
                <Text style={styles.reportArrowHint}>›</Text>
              </TouchableOpacity>

            </View>
          )}
        </View>

        {/* 3. 메인 메뉴 그리드 */}
        <View style={styles.menuGrid}>
          {MENU_ITEMS.map((item) => (
            <Pressable key={item.id} style={({ pressed }) => [styles.menuCard, pressed && styles.pressed]} onPress={() => router.push(item.route as any)}>
              <Text style={styles.menuEmoji}>{item.emoji}</Text>
              <Text style={styles.menuLabel}>{item.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* 서브 정보 바 */}
        <View style={styles.subInfoBar}>
          <TouchableOpacity style={styles.subInfoBtn} onPress={() => router.push('/release-notes')}>
            <Text style={styles.subInfoBtnText}>🛠️ 패치노트</Text>
          </TouchableOpacity>
          <View style={styles.subDivider} />
          <TouchableOpacity style={styles.subInfoBtn} onPress={() => router.push('/feedback')}>
            <Text style={styles.subInfoBtnText}>🚨 오류 / 건의 제보</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <StickyAdBanner />

      {/* 📖 [신규] 칭호 수집 도감 & 2개 대표 장착 모달 */}
      <BadgeCollectionModal
        visible={badgeModalVisible}
        onClose={() => setBadgeModalVisible(false)}
        userParams={badgeUserParams}
        equippedBadgeIds={equippedBadgeIds}
        onSaveEquippedBadges={(badgeIds) => setEquippedBadgeIds(badgeIds)}
      />

      {/* 소속 팀 전체보기 팝업 모달 */}
      <Modal visible={showTeamsModal} animationType="fade" transparent={true}>
        <View style={styles.modalOverlayCenter}>
          <View style={styles.teamsModalContent}>
            <Text style={styles.teamsModalTitle}>🛡️ 내 소속 팀 전체 목록 ({profile?.teams.length || 0}개)</Text>
            <Text style={styles.teamsModalSub}>관리를 원하는 팀을 선택하시면 해당 팀 설정으로 즉시 이동합니다.</Text>
            
            <ScrollView style={{ maxHeight: 220, marginVertical: 10 }} showsVerticalScrollIndicator={false}>
              {profile?.teams.map((tObj, idx) => (
                <TouchableOpacity
                  key={tObj.id}
                  style={styles.teamModalItem}
                  onPress={() => {
                    setShowTeamsModal(false);
                    router.push({ pathname: '/my-team-detail', params: { teamId: tObj.id } });
                  }}
                >
                  <Text style={styles.teamModalItemText}>
                    {idx === 0 ? '⭐ ' : ''}🛡️ {tObj.name}
                  </Text>
                  <Text style={styles.teamModalItemArrow}>관리 ›</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TouchableOpacity style={styles.closeBtn} onPress={() => setShowTeamsModal(false)}>
              <Text style={styles.closeBtnText}>닫기</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 알림 모달 */}
      <Modal visible={showNotiModal} animationType="slide" transparent={true}>
        <View style={styles.modalOverlayBottom}>
          <View style={styles.modalContentBottom}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>🔔 새 소식 알림</Text>
              {notifications.length > 0 && (
                <TouchableOpacity onPress={handleClearAllNotifications} style={styles.clearNotiBtn}>
                  <Text style={styles.clearNotiText}>🗑️ 전체 정리</Text>
                </TouchableOpacity>
              )}
            </View>
            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 380 }}>
              {notifications.length === 0 ? (
                <Text style={styles.emptyNotiText}>아직 수신된 알림이 없습니다.</Text>
              ) : (
                notifications.map((noti) => {
                  const dateStr = new Date(noti.created_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                  return (
                    <View key={noti.id} style={[styles.notiItem, !noti.is_read && styles.notiItemUnread]}>
                      <Text style={styles.notiItemTitle}>{noti.title}</Text>
                      <Text style={styles.notiItemDesc}>{noti.message}</Text>
                      <Text style={styles.notiItemDate}>{dateStr}</Text>
                    </View>
                  );
                })
              )}
            </ScrollView>
            <TouchableOpacity style={styles.closeBtn} onPress={() => setShowNotiModal(false)}>
              <Text style={styles.closeBtnText}>닫기</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { backgroundColor: Colors.primary, paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomLeftRadius: 10, borderBottomRightRadius: 10, elevation: 4 },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  logoBadge: { width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  logoEmoji: { fontSize: 14 },
  logoText: { fontSize: 18, fontWeight: '900', color: '#FFFFFF' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bellButton: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  bellIcon: { fontSize: 14 },
  notiBadge: { position: 'absolute', top: -2, right: -2, backgroundColor: '#EF4444', borderRadius: 10, minWidth: 15, height: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: Colors.primary },
  notiBadgeText: { color: '#FFFFFF', fontSize: 8.5, fontWeight: '900' },
  logoutButton: { paddingHorizontal: 9, paddingVertical: 4.5, borderRadius: 7, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  logoutText: { color: '#FFFFFF', fontSize: 10.5, fontWeight: '700' },
  
  scrollContent: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12 },

  liveMatchBarSlim: { backgroundColor: '#FEF2F2', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: '#FECACA', marginBottom: 10 },
  liveBarTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  liveBarLeft: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, marginRight: 8 },
  liveDotPill: { backgroundColor: '#EF4444', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  liveDotPillText: { color: '#FFFFFF', fontSize: 9.5, fontWeight: '900' },
  liveBarTeamsText: { fontSize: 12.5, fontWeight: '800', color: '#991B1B', flex: 1 },
  liveBarActionText: { fontSize: 11, fontWeight: '800', color: '#DC2626' },
  liveBarScoreRow: { marginTop: 4, paddingTop: 4, borderTopWidth: 1, borderTopColor: '#FEE2E2', flexDirection: 'row', alignItems: 'center' },
  liveBarScoreText: { fontSize: 11, fontWeight: '700', color: '#B91C1C' },

  onboardingCard: { backgroundColor: '#EFF6FF', borderRadius: 14, padding: 14, borderWidth: 1.5, borderColor: '#3B82F6', marginBottom: 12 },
  onboardingTitle: { fontSize: 14, fontWeight: '900', color: '#1E40AF', marginBottom: 4 },
  onboardingSub: { fontSize: 12, color: '#1D4ED8', lineHeight: 18, marginBottom: 10 },
  onboardingBtn: { backgroundColor: '#2563EB', paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  onboardingBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },

  profileCard: { backgroundColor: Colors.surface, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: Colors.border, marginBottom: 10, elevation: 2 },
  
  profileHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: '#F1F5F9', paddingBottom: 8 },
  avatarCircle: { width: 46, height: 48, borderRadius: 23, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center', borderWidth: 2, overflow: 'hidden' },
  avatarImage: { width: 42, height: 44, borderRadius: 21 },
  auraPlatinum: { borderColor: '#A855F7' },
  auraGold: { borderColor: '#F59E0B' },
  auraSilver: { borderColor: '#94A3B8' },
  auraBronze: { borderColor: '#CD7F32' },
  auraNone: { borderColor: '#BFDBFE' },

  profileInfo: { flex: 1, justifyContent: 'center' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  profileName: { fontSize: 15, fontWeight: '900', color: Colors.text },

  genderTag: { paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4, borderWidth: 1 },
  genderTagText: { fontSize: 9, fontWeight: '800' },
  maleTag: { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' },
  maleText: { color: '#1D4ED8' },
  femaleTag: { backgroundColor: '#FDF2F8', borderColor: '#FBCFE8' },
  femaleText: { color: '#DB2777' },

  autoTitleBadge: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, borderWidth: 1 },
  autoTitleText: { fontSize: 9, fontWeight: '800' },

  subDetailText: { fontSize: 11, color: Colors.textMuted, fontWeight: '600' },

  profileHeaderArrow: { fontSize: 18, fontWeight: '800', color: '#94A3B8', marginLeft: 4 },

  cardHeaderSetupBtn: { backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#CBD5E1', paddingHorizontal: 7, paddingVertical: 4, borderRadius: 6 },
  cardHeaderSetupBtnText: { fontSize: 10, fontWeight: '800', color: '#475569' },

  teamSectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  teamChipsContainer: { flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1 },
  teamChip: { backgroundColor: '#F8FAFC', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: '#CBD5E1' },
  teamChipText: { fontSize: 11, fontWeight: '800', color: '#1E293B' },
  teamMoreChip: { backgroundColor: '#EFF6FF', paddingHorizontal: 7, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: '#BFDBFE' },
  teamMoreChipText: { fontSize: 10.5, fontWeight: '800', color: '#1D4ED8' },
  noTeamText: { fontSize: 11, color: Colors.primary, fontWeight: '700' },

  statsSummaryContainer: { flexDirection: 'row', backgroundColor: '#F8FAFC', borderRadius: 8, padding: 6, borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center', marginTop: 8 },
  statBox: { flex: 1, alignItems: 'center' },
  statLabel: { fontSize: 9, color: '#64748B', fontWeight: '800', marginBottom: 1 },
  statValue: { fontSize: 12.5, fontWeight: '900', color: Colors.primary },
  verticalDivider: { width: 1, height: 20, backgroundColor: '#CBD5E1' },
  
  recentFormRow: { flexDirection: 'row', gap: 2, marginTop: 1 },
  formBadge: { width: 17, height: 17, borderRadius: 4, justifyContent: 'center', alignItems: 'center' },
  formWin: { backgroundColor: '#10B981' },
  formDraw: { backgroundColor: '#64748B' },
  formLoss: { backgroundColor: '#EF4444' },
  formBadgeText: { color: '#FFFFFF', fontWeight: '900', fontSize: 8.5 },
  reportArrowHint: { fontSize: 15, fontWeight: '800', color: '#94A3B8', marginLeft: 4, marginRight: 2 },

  menuGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 8, marginBottom: 10 },
  menuCard: { width: '48.8%', height: 88, backgroundColor: Colors.surface, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: Colors.border, elevation: 1 },
  menuLabel: { fontSize: 13, fontWeight: '800', color: Colors.text },
  menuEmoji: { fontSize: 26 },
  pressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },

  subInfoBar: { height: 40, backgroundColor: '#F1F5F9', borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly', borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 4 },
  subInfoBtn: { paddingHorizontal: 12 },
  subInfoBtnText: { fontSize: 11.5, fontWeight: '700', color: '#475569' },
  subDivider: { width: 1, height: 12, backgroundColor: '#CBD5E1' },

  modalOverlayCenter: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  teamsModalContent: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 18, width: '100%', elevation: 5 },
  teamsModalTitle: { fontSize: 15, fontWeight: '800', color: Colors.text, marginBottom: 2 },
  teamsModalSub: { fontSize: 11.5, color: Colors.textMuted, marginBottom: 8 },
  teamModalItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F8FAFC', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 6 },
  teamModalItemText: { fontSize: 13, fontWeight: '800', color: '#1E293B' },
  teamModalItemArrow: { fontSize: 12, fontWeight: '800', color: '#2563EB' },

  modalOverlayBottom: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContentBottom: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 30, elevation: 10 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#F1F5F9', paddingBottom: 12, marginBottom: 12 },
  modalTitle: { fontSize: 16, fontWeight: '800', color: Colors.text },
  clearNotiBtn: { backgroundColor: '#FEF2F2', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: '#FECACA' },
  clearNotiText: { fontSize: 11, color: '#DC2626', fontWeight: '700' },
  emptyNotiText: { textAlign: 'center', color: '#94A3B8', marginVertical: 30, fontSize: 14 },
  notiItem: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F8FAFC' },
  notiItemUnread: { backgroundColor: '#F0F9FF', paddingHorizontal: 10, borderRadius: 8, borderBottomWidth: 0, marginBottom: 6 },
  notiItemTitle: { fontSize: 14, fontWeight: '700', color: Colors.text, marginBottom: 4 },
  notiItemDesc: { fontSize: 12, color: '#475569', lineHeight: 16, marginBottom: 4 },
  notiItemDate: { fontSize: 10, color: '#94A3B8', fontWeight: '500', textAlign: 'right' },
  closeBtn: { backgroundColor: '#F1F5F9', paddingVertical: 12, borderRadius: 10, alignItems: 'center', marginTop: 8 },
  closeBtnText: { color: '#475569', fontSize: 14, fontWeight: '700' },
});