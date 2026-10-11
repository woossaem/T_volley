import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Colors } from '../constants/Colors';
import SchoolSearchField from '../components/SchoolSearchField';
import { canonicalizeAdminRegion, isCanonicalAdminRegion } from '../constants/adminRegions';
import { ensureSchoolTeamMembership, formatSchoolShortName } from '../lib/schoolTeam';
import { isActiveTeamStatus } from '../lib/teamStatus';
import { getSafeTeamName } from '../lib/utils';

interface ClubTeam {
  id: string;
  name: string;
  region: string | null;
  pin_code?: string | null;
  status?: string | null;
}

export default function OnboardingScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user?.id;

  const [step, setStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [schoolName, setSchoolName] = useState('');
  const [schoolRegion, setSchoolRegion] = useState('');
  const [placedTeamName, setPlacedTeamName] = useState('');

  const [clubs, setClubs] = useState<ClubTeam[]>([]);
  const [clubQuery, setClubQuery] = useState('');
  const [clubHits, setClubHits] = useState<ClubTeam[]>([]);
  const [showClubs, setShowClubs] = useState(false);
  const [selectedClub, setSelectedClub] = useState<ClubTeam | null>(null);
  const [clubPin, setClubPin] = useState('');

  useEffect(() => {
    loadProfile();
  }, [userId]);

  const loadProfile = async () => {
    if (!userId) return;
    try {
      setLoading(true);
      const { data: prof } = await supabase.from('profiles').select('full_name, school_name, school_region').eq('id', userId).maybeSingle();
      if (!prof?.full_name) {
        router.replace('/profile-setup');
        return;
      }
      if (prof.school_name) setSchoolName(formatSchoolShortName(prof.school_name));
      const region = canonicalizeAdminRegion(prof.school_region);
      if (region) setSchoolRegion(region);
    } catch (err) {
      console.error('온보딩 프로필 로드 실패:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadClubs = async () => {
    const { data } = await supabase.from('teams').select('id, name, region, pin_code, team_type, status').eq('team_type', 'club');
    const rows = ((data || []) as ClubTeam[]).filter((team) => isActiveTeamStatus(team.status) && team.name);
    setClubs(rows);
  };

  const placeSchoolTeam = async () => {
    const name = formatSchoolShortName(schoolName);
    const region = canonicalizeAdminRegion(schoolRegion);
    if (!name || name.length < 2) {
      Alert.alert('입력 확인', '소속 학교명을 입력하거나 검색 결과에서 선택해 주세요.');
      return;
    }
    if (!region || !isCanonicalAdminRegion(region)) {
      Alert.alert('입력 확인', '학교 소재 행정구역을 선택해 주세요.\n예: 충남 아산시, 서울 강남구');
      return;
    }

    setSubmitting(true);
    try {
      const placed = await ensureSchoolTeamMembership(name, region);
      setSchoolName(name);
      setSchoolRegion(placed.region);
      setPlacedTeamName(placed.teamName);
      await loadClubs();
      setStep(2);
      Alert.alert(
        placed.created ? '학교 팀을 만들었습니다' : '학교 팀에 배치했습니다',
        `'${placed.teamName}' (${placed.region})에 일반 팀원으로 가입했습니다.\n팀 대표는 공석이며, 내 소속 팀에서 직접 등록할 수 있습니다.\n이어서 동호회 팀을 찾거나 건너뛸 수 있습니다.`,
      );
    } catch (err: any) {
      Alert.alert('학교 팀 배치 실패', err?.message || '다시 시도해 주세요.');
    } finally {
      setSubmitting(false);
    }
  };

  const onClubQuery = (text: string) => {
    setClubQuery(text);
    setSelectedClub(null);
    const q = text.trim();
    if (!q) {
      setClubHits([]);
      setShowClubs(false);
      return;
    }
    const hits = clubs.filter((team) => team.name.includes(q)).slice(0, 30);
    setClubHits(hits);
    setShowClubs(true);
  };

  const selectClub = (team: ClubTeam) => {
    setSelectedClub(team);
    setClubQuery(team.name);
    setShowClubs(false);
  };

  const joinClub = async () => {
    if (!selectedClub) {
      Alert.alert('알림', '가입할 동호회 팀을 검색 결과에서 선택해 주세요.');
      return;
    }
    if (!isActiveTeamStatus(selectedClub.status)) {
      Alert.alert('가입 불가', '휴면 또는 삭제된 팀에는 가입할 수 없습니다.');
      return;
    }
    const pin = (selectedClub.pin_code || '').trim();
    if (pin) {
      if (!clubPin.trim()) {
        Alert.alert('비밀번호 필요', `'${selectedClub.name}' 팀은 가입 비밀번호가 있습니다. 4자리를 입력해 주세요.`);
        return;
      }
      if (pin !== clubPin.trim()) {
        Alert.alert('비밀번호 오류', '비밀번호가 일치하지 않습니다.');
        return;
      }
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.from('team_members').upsert({
        user_id: userId,
        team_id: selectedClub.id,
        is_active: true,
      });
      if (error) throw error;
      Alert.alert('동호회 가입 완료', `'${getSafeTeamName(selectedClub)}' 팀에 합류했습니다.`, [
        { text: '홈으로', onPress: () => router.replace('/home') },
      ]);
    } catch (err: any) {
      Alert.alert('가입 실패', err?.message || '다시 시도해 주세요.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => (step === 2 ? setStep(1) : router.replace('/profile-setup'))}
            hitSlop={10}
          >
            <Text style={styles.backText}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{step === 1 ? '1단계 · 소속 학교' : '2단계 · 동호회 팀'}</Text>
          <View style={{ width: 32 }} />
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {loading ? (
            <ActivityIndicator color={Colors.primary} size="large" style={{ marginTop: 40 }} />
          ) : step === 1 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>학교 검색과 행정구역</Text>
              <Text style={styles.sectionSub}>
                고른 학교로 학교 팀을 찾습니다. 없으면 학교명 그대로 팀을 만들고 바로 가입합니다.
              </Text>
              <SchoolSearchField
                schoolName={schoolName}
                schoolRegion={schoolRegion}
                onChangeSchoolName={setSchoolName}
                onChangeSchoolRegion={setSchoolRegion}
              />
              <TouchableOpacity style={styles.primaryBtn} onPress={placeSchoolTeam} disabled={submitting}>
                {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryBtnText}>학교 팀 가입하고 다음</Text>}
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>동호회 팀 (선택)</Text>
              <Text style={styles.sectionSub}>
                {placedTeamName ? `'${placedTeamName}' 학교 팀 배치는 끝났습니다. ` : ''}
                기존 동호회만 검색해 가입하거나, 나중에 팀 관리에서 가입해도 됩니다.
              </Text>

              <Text style={styles.label}>동호회 팀 검색</Text>
              <View style={{ zIndex: 20 }}>
                <TextInput
                  style={styles.input}
                  value={clubQuery}
                  onChangeText={onClubQuery}
                  placeholder="예: 교사배구사랑"
                  placeholderTextColor="#94A3B8"
                />
                {showClubs && (
                  <View style={styles.dropdown}>
                    <ScrollView style={{ maxHeight: 180 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                      {clubHits.length === 0 ? (
                        <View style={styles.dropdownItem}>
                          <Text style={styles.emptyText}>일치하는 동호회 팀이 없습니다.</Text>
                        </View>
                      ) : clubHits.map((team) => (
                        <TouchableOpacity key={team.id} style={styles.dropdownItem} onPress={() => selectClub(team)}>
                          <Text style={styles.dropdownTitle} numberOfLines={1}>🛡️ {getSafeTeamName(team)}</Text>
                          <Text style={styles.dropdownBadge}>{team.region || '지역 미입력'}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </View>

              {selectedClub ? (
                <View style={styles.selectedBox}>
                  <Text style={styles.selectedText}>선택: {getSafeTeamName(selectedClub)}</Text>
                </View>
              ) : null}

              <Text style={[styles.label, { marginTop: 14 }]}>가입 비밀번호 (보호된 팀만)</Text>
              <TextInput
                style={styles.input}
                value={clubPin}
                onChangeText={setClubPin}
                placeholder="공개 팀은 비워 두세요"
                placeholderTextColor="#94A3B8"
                keyboardType="number-pad"
                maxLength={8}
              />

              <TouchableOpacity style={styles.primaryBtn} onPress={joinClub} disabled={submitting}>
                {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryBtnText}>선택한 동호회 가입</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={styles.skipBtn} onPress={() => router.replace('/home')} disabled={submitting}>
                <Text style={styles.skipBtnText}>건너뛰고 홈으로</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
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
  backBtn: { width: 32, height: 32, justifyContent: 'center' },
  backText: { fontSize: 32, color: Colors.text, lineHeight: 32 },
  headerTitle: { fontSize: 16, fontWeight: '800', color: Colors.text },
  content: { padding: 20, paddingBottom: 60 },
  section: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sectionTitle: { fontSize: 16, fontWeight: '900', color: Colors.text, marginBottom: 6 },
  sectionSub: { fontSize: 12, color: '#475569', lineHeight: 18, marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '700', color: '#475569', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    backgroundColor: '#F8FAFC',
    color: Colors.text,
  },
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#3B82F6',
    borderRadius: 12,
    marginTop: 4,
    zIndex: 30,
    elevation: 8,
  },
  dropdownItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  dropdownTitle: { flex: 1, fontSize: 14, fontWeight: '800', color: '#0F172A', marginRight: 8 },
  dropdownBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1D4ED8',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: 'hidden',
  },
  emptyText: { fontSize: 12, color: '#94A3B8' },
  selectedBox: {
    marginTop: 10,
    backgroundColor: '#F0FDF4',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  selectedText: { fontSize: 13, fontWeight: '800', color: '#166534' },
  primaryBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 22,
  },
  primaryBtnText: { color: '#FFFFFF', fontWeight: '900', fontSize: 15 },
  skipBtn: {
    marginTop: 10,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  skipBtnText: { color: '#475569', fontWeight: '800', fontSize: 14 },
});
