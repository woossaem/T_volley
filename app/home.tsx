import React, { useEffect, useState, useCallback } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Colors } from '../constants/Colors';

const MENU_ITEMS = [
  { id: 'profile', emoji: '👤', label: '내 프로필', route: '/profile' },
  { id: 'matches', emoji: '📅', label: '경기 목록', route: '/matches' },
  { id: 'register', emoji: '➕', label: '경기 등록', route: '/create-match' },
  { id: 'teams', emoji: '🏐', label: '팀 목록', route: '/teams' },
  { id: 'ranking', emoji: '🏆', label: '랭킹 보기', route: '/rankings' },
] as const;

interface UserProfile {
  fullName: string;
  teams: string[];
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
  const [profile, setProfile] = useState<UserProfile | null>(null);
  
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotiModal, setShowNotiModal] = useState(false);
  
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      fetchUserProfile();
      fetchNotifications();
    }, [session])
  );

  const fetchUserProfile = async () => {
    const userId = session?.user?.id;
    if (!userId) {
      setLoading(false);
      return;
    }
    try {
      const { data: profData } = await supabase.from('profiles').select('full_name').eq('id', userId).maybeSingle();
      
      const { data: tmData } = await supabase
        .from('team_members')
        .select('is_primary, teams(name)')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('is_primary', { ascending: false });

      const teamNames = tmData?.map((tm: any) => tm.teams?.name).filter(Boolean) || [];

      if (!profData && teamNames.length === 0) {
        router.replace('/profile-setup');
      } else {
        const googleName = session?.user?.user_metadata?.full_name || session?.user?.user_metadata?.name;
        setProfile({
          fullName: profData?.full_name || googleName || '선생님',
          teams: teamNames,
        });
      }
    } catch (err) {
      console.error('프로필 에러:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchNotifications = async () => {
    const userId = session?.user?.id;
    if (!userId) return;

    try {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(30);

      if (data) {
        setNotifications(data);
        setUnreadCount(data.filter(n => !n.is_read).length);
      }
    } catch (err) {
      console.error('알림 조회 실패:', err);
    }
  };

  const handleOpenNotifications = async () => {
    setShowNotiModal(true);
    
    if (unreadCount > 0) {
      const userId = session?.user?.id;
      if (userId) {
        await supabase
          .from('notifications')
          .update({ is_read: true })
          .eq('user_id', userId)
          .eq('is_read', false);
        
        setUnreadCount(0);
        setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      }
    }
  };

  const handleClearAllNotifications = () => {
    if (notifications.length === 0) return;

    Alert.alert('알림 정리', '모든 알림 내역을 삭제하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          const userId = session?.user?.id;
          if (!userId) return;

          try {
            await supabase.from('notifications').delete().eq('user_id', userId);
            setNotifications([]);
            setUnreadCount(0);
          } catch (err: any) {
            Alert.alert('오류', err.message);
          }
        },
      },
    ]);
  };

  const handleMenuPress = (route: string) => router.push(route as any);

  const handleSignOut = () => {
    Alert.alert('로그아웃', '정말 로그아웃 하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '로그아웃', style: 'destructive',
        onPress: async () => {
          await signOut();
          router.replace('/login');
        },
      },
    ]);
  };

  const displayName = profile?.fullName || '선생님';
  let displayTeam = '소속 팀 미설정';
  
  if (profile?.teams && profile.teams.length > 0) {
    if (profile.teams.length === 1) {
      displayTeam = `🏐 ${profile.teams[0]}`;
    } else {
      displayTeam = `🏐 ${profile.teams[0]} 외 ${profile.teams.length - 1}개 팀`;
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar style="light" />

      {/* 깔끔한 상단 헤더 바 */}
      <View style={styles.header}>
        <View style={styles.logoRow}>
          <View style={styles.logoBadge}>
            <Text style={styles.logoEmoji}>🏐</Text>
          </View>
          <Text style={styles.logoText}>T volley</Text>
        </View>

        <View style={styles.headerRight}>
          <Pressable
            style={({ pressed }) => [styles.bellButton, pressed && styles.pressed]}
            onPress={handleOpenNotifications}
            hitSlop={8}
          >
            <Text style={styles.bellIcon}>🔔</Text>
            {unreadCount > 0 && (
              <View style={styles.notiBadge}>
                <Text style={styles.notiBadgeText}>{unreadCount}</Text>
              </View>
            )}
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.logoutButton, pressed && styles.pressed]}
            onPress={handleSignOut}
            hitSlop={8}
          >
            <Text style={styles.logoutText}>로그아웃</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.welcome}>환영합니다. 초등교사 배구 커뮤니티 티볼리입니다.</Text>

        {/* 프로필 카드 */}
        <View style={styles.profileCard}>
          {loading ? (
            <ActivityIndicator color={Colors.primary} style={{ padding: 10 }} />
          ) : (
            <>
              <TouchableOpacity
                style={styles.avatar}
                onPress={() => router.push('/profile')}
                activeOpacity={0.7}
              >
                <Text style={styles.avatarText}>{displayName.charAt(0)}</Text>
              </TouchableOpacity>

              <View style={styles.profileInfo}>
                <TouchableOpacity onPress={() => router.push('/profile')} activeOpacity={0.7}>
                  <Text style={styles.profileName}>{displayName} 선생님 👤</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() =>
                    router.push(profile?.teams && profile.teams.length > 0 ? '/my-team-detail' : '/profile-setup')
                  }
                  activeOpacity={0.7}
                >
                  <Text style={styles.profileTeam}>{displayTeam} ⚙️</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>

        <Text style={styles.sectionTitle}>메인 메뉴</Text>

        <View style={styles.menuGrid}>
          {MENU_ITEMS.map((item) => (
            <Pressable
              key={item.id}
              style={({ pressed }) => [styles.menuCard, pressed && styles.pressed]}
              onPress={() => handleMenuPress(item.route)}
            >
              <Text style={styles.menuEmoji}>{item.emoji}</Text>
              <Text style={styles.menuLabel}>{item.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* 하단 패치노트 & 건의사항 서브 링크 */}
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

      {/* 알림 모달 */}
      <Modal visible={showNotiModal} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
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
  header: { backgroundColor: Colors.primary, paddingHorizontal: 20, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomLeftRadius: 20, borderBottomRightRadius: 20, shadowColor: '#0F172A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 6 },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoBadge: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  logoEmoji: { fontSize: 18 },
  logoText: { fontSize: 22, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.5 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bellButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center', position: 'relative' },
  bellIcon: { fontSize: 18 },
  notiBadge: { position: 'absolute', top: -2, right: -2, backgroundColor: '#EF4444', borderRadius: 10, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: Colors.primary },
  notiBadgeText: { color: '#FFFFFF', fontSize: 9, fontWeight: '900' },
  logoutButton: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  logoutText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  scrollContent: { padding: 20, paddingBottom: 32 },
  welcome: { fontSize: 15, lineHeight: 22, color: Colors.textMuted, marginBottom: 20 },
  profileCard: { backgroundColor: Colors.surface, borderRadius: 16, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 16, borderWidth: 1, borderColor: Colors.border, shadowColor: '#0F172A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2, marginBottom: 24, minHeight: 104 },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 26, fontWeight: '700', color: '#FFFFFF' },
  profileInfo: { flex: 1, gap: 6 },
  profileName: { fontSize: 20, fontWeight: '700', color: Colors.primary },
  profileTeam: { fontSize: 14, color: Colors.textMuted, fontWeight: '600' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: Colors.text, marginBottom: 14 },
  menuGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  menuCard: { width: '47%', minHeight: 100, backgroundColor: Colors.surface, borderRadius: 14, paddingVertical: 18, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border, shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  menuLabel: { marginTop: 8, fontSize: 14, fontWeight: '600', color: Colors.primary, textAlign: 'center' },
  menuEmoji: { fontSize: 28 },
  pressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },

  subInfoBar: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    paddingVertical: 12,
    marginTop: 20,
    alignItems: 'center',
    justify: 'space-evenly',
  },
  subInfoBtn: { paddingHorizontal: 12 },
  subInfoBtnText: { fontSize: 13, fontWeight: '700', color: '#475569' },
  subDivider: { width: 1, height: 16, backgroundColor: '#CBD5E1' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 10 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#F1F5F9', paddingBottom: 16, marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: Colors.text },
  clearNotiBtn: { backgroundColor: '#FEF2F2', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#FECACA' },
  clearNotiText: { fontSize: 12, color: '#DC2626', fontWeight: '700' },
  emptyNotiText: { textAlign: 'center', color: '#94A3B8', marginVertical: 30, fontSize: 15 },
  notiItem: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F8FAFC' },
  notiItemUnread: { backgroundColor: '#F0F9FF', paddingHorizontal: 12, borderRadius: 10, borderBottomWidth: 0, marginBottom: 8 },
  notiItemTitle: { fontSize: 15, fontWeight: '700', color: Colors.text, marginBottom: 4 },
  notiItemDesc: { fontSize: 13, color: '#475569', lineHeight: 18, marginBottom: 6 },
  notiItemDate: { fontSize: 11, color: '#94A3B8', fontWeight: '500', textAlign: 'right' },
  closeBtn: { backgroundColor: '#F1F5F9', paddingVertical: 16, borderRadius: 14, alignItems: 'center', marginTop: 20 },
  closeBtnText: { color: '#475569', fontSize: 16, fontWeight: '700' },
});