import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Colors } from '../constants/Colors';

const REGIONS = ['천안', '아산', '기타'];

export default function ProfileSetupScreen() {
  const router = useRouter();
  const { session } = useAuth();

  const [loading, setLoading] = useState(true);
  const [submitting, setActionSubmitting] = useState(false);

  const [fullName, setFullName] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [selectedRegion, setSelectedRegion] = useState('천안');

  const [myJoinedTeams, setMyJoinedTeams] = useState<any[]>([]);
  
  // 🔥 팀 가입 / 개설 모드 탭
  const [teamMode, setTeamMode] = useState<'join' | 'create'>('join');
  const [joinTeamName, setJoinTeamName] = useState('');
  const [joinPinCode, setJoinPinCode] = useState('');

  // 신생팀 개설 필드
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamType, setNewTeamType] = useState<'school' | 'club'>('school');
  const [newTeamPin, setNewTeamPin] = useState('');

  const userId = session?.user?.id;

  useEffect(() => {
    fetchProfileAndTeams();
  }, [session]);

  const fetchProfileAndTeams = async () => {
    if (!userId) return;
    try {
      setLoading(true);

      const { data: prof } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
      if (prof) {
        setFullName(prof.full_name || '');
        setSchoolName(prof.school_name || '');
        setSelectedRegion(prof.region || '천안');
      } else {
        const googleName = session?.user?.user_metadata?.full_name || session?.user?.user_metadata?.name || '';
        setFullName(googleName);
      }

      const { data: tmData } = await supabase
        .from('team_members')
        .select('team_id, is_primary, teams(id, name, region, team_type)')
        .eq('user_id', userId)
        .eq('is_active', true);

      if (tmData) {
        setMyJoinedTeams(tmData.map((item: any) => ({ ...item.teams, is_primary: item.is_primary })));
      }
    } catch (err) {
      console.error('프로필 및 팀 조회 실패:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!fullName.trim()) return Alert.alert('알림', '성함을 입력해 주세요.');
    if (!schoolName.trim()) return Alert.alert('알림', '소속 학교명을 입력해 주세요.');

    setActionSubmitting(true);
    try {
      const { error } = await supabase.from('profiles').upsert({
        id: userId,
        full_name: fullName.trim(),
        school_name: schoolName.trim(),
        region: selectedRegion,
        updated_at: new Date().toISOString(),
      });

      if (error) throw error;

      Alert.alert('저장 완료! ✨', '프로필 정보가 수정되었습니다.');
      router.back();
    } catch (err: any) {
      Alert.alert('오류', err.message);
    } finally {
      setActionSubmitting(false);
    }
  };

  // 기존 팀 가입
  const handleJoinTeamByPin = async () => {
    if (!joinTeamName.trim() || !joinPinCode.trim()) {
      return Alert.alert('알림', '팀 이름과 비밀번호를 모두 입력해 주세요.');
    }

    setActionSubmitting(true);
    try {
      const { data: targetTeam } = await supabase
        .from('teams')
        .select('*')
        .eq('name', joinTeamName.trim())
        .maybeSingle();

      if (!targetTeam) {
        return Alert.alert('가입 실패', `'${joinTeamName}' 팀을 찾을 수 없습니다. 신생팀 개설 탭에서 등록해 보세요!`);
      }

      if (targetTeam.pin_code !== joinPinCode.trim()) {
        return Alert.alert('비밀번호 오류', '팀 가입 비밀번호가 일치하지 않습니다.');
      }

      await supabase.from('team_members').upsert({
        user_id: userId,
        team_id: targetTeam.id,
        is_active: true,
      });

      Alert.alert('가입 성공! 🎉', `'${targetTeam.name}' 팀 소속으로 추가 가입되었습니다.`);
      setJoinTeamName(''); setJoinPinCode('');
      fetchProfileAndTeams();
    } catch (err: any) {
      Alert.alert('오류', err.message);
    } finally {
      setActionSubmitting(false);
    }
  };

  // 🔥 신생 팀 신규 개설
  const handleCreateNewTeam = async () => {
    if (!newTeamName.trim() || !newTeamPin.trim()) {
      return Alert.alert('알림', '신생 팀 이름과 비밀번호 4자리를 입력해 주세요.');
    }

    setActionSubmitting(true);
    try {
      const { data: existing } = await supabase.from('teams').select('id').eq('name', newTeamName.trim()).maybeSingle();
      if (existing) {
        return Alert.alert('개설 중복', `'${newTeamName}'팀은 이미 존재합니다. 기존 팀 가입 탭에서 가입해 주세요.`);
      }

      const { data: createdTeam, error: createErr } = await supabase
        .from('teams')
        .insert({
          name: newTeamName.trim(),
          region: selectedRegion,
          team_type: newTeamType,
          pin_code: newTeamPin.trim(),
        })
        .select()
        .single();

      if (createErr) throw createErr;

      await supabase.from('team_members').insert({
        user_id: userId,
        team_id: createdTeam.id,
        is_active: true,
        is_primary: myJoinedTeams.length === 0,
      });

      Alert.alert('팀 개설 완료! ✨', `'${newTeamName}' 팀이 새로 창단되어 내 소속 팀으로 자동 가입되었습니다.`);
      setNewTeamName(''); setNewTeamPin('');
      fetchProfileAndTeams();
    } catch (err: any) {
      Alert.alert('오류', err.message);
    } finally {
      setActionSubmitting(false);
    }
  };

  const getTeamIcon = (type?: string) => (type === 'club' ? '🏐' : '🏫');

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} hitSlop={10}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>프로필 및 팀 수정</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator color={Colors.primary} size="large" style={{ marginTop: 40 }} />
        ) : (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>👥 가입된 소속 팀 목록 ({myJoinedTeams.length}개)</Text>
              {myJoinedTeams.length > 0 ? (
                <View style={{ gap: 8 }}>
                  {myJoinedTeams.map((t) => (
                    <View key={t.id} style={styles.joinedTeamItem}>
                      <Text style={styles.joinedTeamName}>
                        {t.is_primary ? '⭐ ' : ''}{getTeamIcon(t.team_type)} {t.name} ({t.team_type === 'club' ? '동호회' : '학교팀'})
                      </Text>
                      <TouchableOpacity onPress={() => router.push('/my-team-detail')}>
                        <Text style={{ fontSize: 12, color: Colors.primary, fontWeight: '700' }}>관리 ➔</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={{ color: Colors.textMuted, fontSize: 13 }}>아직 가입된 팀이 없습니다.</Text>
              )}
            </View>

            {/* 🔥 기존 팀 가입 vs 신생 팀 개설 선택 탭 */}
            <View style={styles.section}>
              <View style={styles.tabToggleRow}>
                <TouchableOpacity style={[styles.toggleBtn, teamMode === 'join' && styles.toggleBtnActive]} onPress={() => setTeamMode('join')}>
                  <Text style={[styles.toggleBtnText, teamMode === 'join' && styles.toggleBtnTextActive]}>👥 기존 팀 가입</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.toggleBtn, teamMode === 'create' && styles.toggleBtnActive]} onPress={() => setTeamMode('create')}>
                  <Text style={[styles.toggleBtnText, teamMode === 'create' && styles.toggleBtnTextActive]}>✨ 신생 팀 개설</Text>
                </TouchableOpacity>
              </View>

              {teamMode === 'join' ? (
                <View style={{ marginTop: 12 }}>
                  <Text style={styles.label}>기존 팀 이름</Text>
                  <TextInput style={styles.input} placeholder="예: 삼은초등학교" value={joinTeamName} onChangeText={setJoinTeamName} />
                  <Text style={[styles.label, { marginTop: 8 }]}>팀 가입 비밀번호</Text>
                  <TextInput style={styles.input} placeholder="비밀번호 4자리" value={joinPinCode} onChangeText={setJoinPinCode} keyboardType="number-pad" />
                  <TouchableOpacity style={styles.actionBtn} onPress={handleJoinTeamByPin} disabled={submitting}>
                    <Text style={styles.actionBtnText}>+ 기존 팀 가입하기</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={{ marginTop: 12 }}>
                  <Text style={styles.label}>신생 팀 이름</Text>
                  <TextInput style={styles.input} placeholder="예: 천안교사배구사랑" value={newTeamName} onChangeText={setNewTeamName} />
                  
                  <Text style={[styles.label, { marginTop: 8 }]}>팀 구분</Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                    <TouchableOpacity style={[styles.chip, newTeamType === 'school' && styles.chipActive]} onPress={() => setNewTeamType('school')}>
                      <Text style={[styles.chipText, newTeamType === 'school' && styles.chipTextActive]}>🏫 학교 팀</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.chip, newTeamType === 'club' && styles.chipActive]} onPress={() => setNewTeamType('club')}>
                      <Text style={[styles.chipText, newTeamType === 'club' && styles.chipTextActive]}>🏐 동호회 팀</Text>
                    </TouchableOpacity>
                  </View>

                  <Text style={[styles.label, { marginTop: 10 }]}>설정할 팀 비밀번호</Text>
                  <TextInput style={styles.input} placeholder="팀원 공유용 비밀번호 4자리" value={newTeamPin} onChangeText={setNewTeamPin} keyboardType="number-pad" />
                  <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#10B981' }]} onPress={handleCreateNewTeam} disabled={submitting}>
                    <Text style={styles.actionBtnText}>✨ 신생 팀 새로 만들기</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>✏️ 성함 및 재직 학교 설정</Text>
              <Text style={styles.label}>성함</Text>
              <TextInput style={styles.input} value={fullName} onChangeText={setFullName} placeholder="성함을 입력하세요" />

              <Text style={[styles.label, { marginTop: 10 }]}>소속 학교명</Text>
              <TextInput style={styles.input} value={schoolName} onChangeText={setSchoolName} placeholder="재직 중인 학교명" />

              <Text style={[styles.label, { marginTop: 10 }]}>주 활동 지역</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                {REGIONS.map((r) => (
                  <TouchableOpacity key={r} style={[styles.chip, selectedRegion === r && styles.chipActive]} onPress={() => setSelectedRegion(r)}>
                    <Text style={[styles.chipText, selectedRegion === r && styles.chipTextActive]}>{r}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveProfile} disabled={submitting}>
                <Text style={styles.saveBtnText}>프로필 정보 저장</Text>
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
  content: { padding: 20, gap: 16 },
  section: { backgroundColor: Colors.surface, borderRadius: 16, padding: 18, borderWidth: 1, borderColor: Colors.border },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: Colors.text, marginBottom: 12 },
  joinedTeamItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F8FAFC', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0' },
  joinedTeamName: { fontSize: 14, fontWeight: '700', color: Colors.text },
  tabToggleRow: { flexDirection: 'row', backgroundColor: '#F1F5F9', borderRadius: 10, padding: 4 },
  toggleBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  toggleBtnActive: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#CBD5E1' },
  toggleBtnText: { fontSize: 13, fontWeight: '700', color: '#64748B' },
  toggleBtnTextActive: { color: Colors.primary, fontWeight: '800' },
  label: { fontSize: 13, fontWeight: '700', color: '#475569', marginBottom: 4 },
  input: { borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 10, padding: 12, fontSize: 14, backgroundColor: '#FFFFFF' },
  actionBtn: { backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 12 },
  actionBtnText: { color: '#1D4ED8', fontWeight: '800', fontSize: 14 },
  chip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F1F5F9' },
  chipActive: { backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#3B82F6' },
  chipText: { fontSize: 13, fontWeight: '600', color: '#64748B' },
  chipTextActive: { color: '#1D4ED8', fontWeight: '800' },
  saveBtn: { backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 16 },
  saveBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
});