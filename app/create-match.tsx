import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Colors } from '../constants/Colors';

const MATCH_FORMATS = ['3세트 매치', '5세트 매치', '2시간 교류전', '기타'];

interface MyTeamData {
  id: string;
  name: string;
  region: string;
}

export default function CreateMatchScreen() {
  const router = useRouter();
  const { session } = useAuth();

  const [myTeams, setMyTeams] = useState<MyTeamData[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<MyTeamData | null>(null);

  const [myGymName, setMyGymName] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchingProfile, setFetchingProfile] = useState(true);

  // Native 피커 상태
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const [location, setLocation] = useState('');
  const [format, setFormat] = useState('3세트 매치');
  const [description, setDescription] = useState('');
  const [contactInfo, setContactInfo] = useState('');

  // 🔥 최근에 작성했던 경기 모집글 데이터 저장
  const [lastMatch, setLastMatch] = useState<any>(null);

  const userId = session?.user?.id;

  useEffect(() => {
    fetchMyTeamsAndLastMatch();
  }, [session]);

  const fetchMyTeamsAndLastMatch = async () => {
    if (!userId) return;

    try {
      const { data, error } = await supabase
        .from('team_members')
        .select(`
          team_id,
          teams (id, name, region)
        `)
        .eq('user_id', userId)
        .eq('is_active', true);

      if (error) throw error;

      const teamsList: MyTeamData[] = (data || []).map((item: any) => item.teams).filter(Boolean);

      if (teamsList.length === 0) {
        Alert.alert('알림', '가입된 소속 팀이 없습니다. 프로필 설정에서 팀을 먼저 추가해주세요.');
        router.replace('/profile-setup');
      } else {
        setMyTeams(teamsList);
        setSelectedTeam(teamsList[0]);
      }

      // 🔥 내가 주최했던 가장 최근 모집글 불러오기
      const { data: last } = await supabase
        .from('matches')
        .select('location, contact_info, description, format')
        .eq('host_user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (last) setLastMatch(last);
    } catch (err) {
      console.error('소속 팀 확인 오류:', err);
    } finally {
      setFetchingProfile(false);
    }
  };

  useEffect(() => {
    if (selectedTeam) {
      setMyGymName(`${selectedTeam.name} 체육관`);
    }
  }, [selectedTeam]);

  // 🔥 최근 작성 내역 1초만에 자동입력 함수
  const applyLastMatchInfo = () => {
    if (!lastMatch) return;
    if (lastMatch.location) setLocation(lastMatch.location);
    if (lastMatch.contact_info) setContactInfo(lastMatch.contact_info);
    if (lastMatch.description) setDescription(lastMatch.description);
    if (lastMatch.format) setFormat(lastMatch.format);
    Alert.alert('자동 입력 완료 ✨', '최근에 입력했던 장소, 연락처, 안내글이 채워졌습니다.');
  };

  const onChangeDate = (event: any, selectedDate?: Date) => {
    setShowDatePicker(false);
    if (selectedDate) setDate(selectedDate);
  };

  const onChangeTime = (event: any, selectedDate?: Date) => {
    setShowTimePicker(false);
    if (selectedDate) setDate(selectedDate);
  };

  const formattedDate = `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;

  const formatTime = (d: Date) => {
    const hours = d.getHours();
    const minutes = d.getMinutes();
    const ampm = hours >= 12 ? '오후' : '오전';
    const h = hours % 12 || 12;
    const m = minutes < 10 ? `0${minutes}` : minutes;
    return `${ampm} ${h}:${m}`;
  };
  const formattedTime = formatTime(date);

  const sendTeamNotification = async (teamName: string, title: string, message: string) => {
    try {
      const { data: teamData } = await supabase.from('teams').select('id').eq('name', teamName).maybeSingle();
      if (!teamData) return;

      const { data: members } = await supabase
        .from('team_members')
        .select('user_id')
        .eq('team_id', teamData.id)
        .eq('is_active', true);

      if (!members || members.length === 0) return;

      const notifications = members.map((m: any) => ({
        user_id: m.user_id,
        title,
        message,
        is_read: false,
      }));

      await supabase.from('notifications').insert(notifications);
    } catch (err) {
      console.error('알림 저장 실패:', err);
    }
  };

  const handleCreateMatch = async () => {
    if (!selectedTeam) return;
    if (!location.trim()) {
      return Alert.alert('알림', '장소(체육관)를 입력해 주세요.');
    }
    if (!contactInfo.trim()) {
      return Alert.alert('알림', '매칭 성사 후 연락할 수 있는 연락망을 입력해 주세요.');
    }

    if (!userId) return;

    setLoading(true);
    try {
      const { error } = await supabase.from('matches').insert({
        host_user_id: userId,
        host_team_name: selectedTeam.name,
        region: selectedTeam.region || '천안',
        match_date: formattedDate,
        match_time: formattedTime,
        location: location.trim(),
        format,
        description: description.trim(),
        contact_info: contactInfo.trim(),
        status: 'open',
      });

      if (error) throw error;

      await sendTeamNotification(
        selectedTeam.name,
        '🏐 [팀 모집 알림] 신규 경기 등록',
        `'${selectedTeam.name}' 팀의 새로운 경기 모집글이 등록되었습니다. (${formattedDate} ${formattedTime})`
      );

      Alert.alert('등록 완료! 🏐', '경기 모집글이 등록되었으며, 팀원들에게 알림이 발송되었습니다.', [
        { text: '확인', onPress: () => router.replace('/matches') },
      ]);
    } catch (err: any) {
      Alert.alert('오류', '경기 등록 중 문제가 발생했습니다: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  if (fetchingProfile) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.inner}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backText}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>경기 매치 등록</Text>
          <View style={{ width: 32 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* 🔥 최근 장소/연락처 자동입력 칩 */}
          {lastMatch && (
            <TouchableOpacity style={styles.quickFillChip} onPress={applyLastMatchInfo}>
              <Text style={styles.quickFillText}>✨ 최근에 썼던 장소/연락처 1초만에 자동 채우기</Text>
            </TouchableOpacity>
          )}

          <View style={styles.formGroup}>
            <Text style={styles.label}>어느 팀 소속으로 모집하시나요?</Text>
            {myTeams.length > 1 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {myTeams.map((team) => (
                  <TouchableOpacity
                    key={team.id}
                    style={[styles.teamChip, selectedTeam?.id === team.id && styles.teamChipActive]}
                    onPress={() => setSelectedTeam(team)}
                  >
                    <Text style={[styles.teamChipText, selectedTeam?.id === team.id && styles.teamChipTextActive]}>
                      🏐 {team.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            ) : (
              <View style={styles.hostInfo}>
                <Text style={styles.hostInfoText}>초청 팀 ({selectedTeam?.region})</Text>
                <Text style={styles.hostTeamName}>🏐 {selectedTeam?.name}</Text>
              </View>
            )}
          </View>

          {/* Native 날짜 선택 */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>날짜 선택</Text>
            <TouchableOpacity style={styles.datePickerBtn} onPress={() => setShowDatePicker(true)}>
              <Text style={styles.datePickerText}>📅 {formattedDate}</Text>
            </TouchableOpacity>
            {showDatePicker && <DateTimePicker value={date} mode="date" display="default" onChange={onChangeDate} />}
          </View>

          {/* Native 시간 선택 */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>시간 선택</Text>
            <TouchableOpacity style={styles.datePickerBtn} onPress={() => setShowTimePicker(true)}>
              <Text style={styles.datePickerText}>⏰ {formattedTime}</Text>
            </TouchableOpacity>
            {showTimePicker && <DateTimePicker value={date} mode="time" display="default" onChange={onChangeTime} />}
          </View>

          {/* 체육관 장소 */}
          <View style={styles.formGroup}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>장소 (체육관)</Text>
              {myGymName ? (
                <TouchableOpacity style={styles.quickInputBtn} onPress={() => setLocation(myGymName)}>
                  <Text style={styles.quickInputText}>⚡ {myGymName} 입력</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <TextInput
              style={styles.input}
              placeholder={`예: ${myGymName || '불당초등학교 체육관'}`}
              placeholderTextColor="#94A3B8"
              value={location}
              onChangeText={setLocation}
            />
          </View>

          {/* 경기 방식 */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>경기 방식</Text>
            <View style={styles.formatChips}>
              {MATCH_FORMATS.map((fmt) => (
                <TouchableOpacity
                  key={fmt}
                  style={[styles.chip, format === fmt && styles.chipActive]}
                  onPress={() => setFormat(fmt)}
                >
                  <Text style={[styles.chipText, format === fmt && styles.chipTextActive]}>{fmt}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* 남길 말 */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>남기고 싶은 말 (선택)</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="예: 실력 상관없이 즐겁게 땀 흘리실 분들 환영합니다!"
              placeholderTextColor="#94A3B8"
              value={description}
              onChangeText={setDescription}
              multiline
              textAlignVertical="top"
            />
          </View>

          {/* 연락처 */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>대표자 연락처 또는 오픈채팅</Text>
            <Text style={styles.subLabel}>※ 매칭이 성사된 상대팀에게만 안전하게 공개됩니다.</Text>
            <TextInput
              style={styles.input}
              placeholder="예: 010-1234-5678 또는 카카오톡 오픈채팅 링크"
              placeholderTextColor="#94A3B8"
              value={contactInfo}
              onChangeText={setContactInfo}
            />
          </View>

          <TouchableOpacity style={[styles.submitBtn, loading && styles.btnDisabled]} onPress={handleCreateMatch} disabled={loading}>
            {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitBtnText}>모집글 등록하기</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  inner: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backBtn: { width: 32, height: 32, justifyContent: 'center' },
  backText: { fontSize: 32, color: Colors.text, lineHeight: 32 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: Colors.text },
  scrollContent: { padding: 24, paddingBottom: 40 },
  quickFillChip: { backgroundColor: '#FEF3C7', borderWidth: 1, borderColor: '#FDE68A', borderRadius: 12, padding: 12, alignItems: 'center', marginBottom: 16 },
  quickFillText: { color: '#B45309', fontWeight: '800', fontSize: 13 },
  hostInfo: { backgroundColor: '#F0F9FF', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#BAE6FD' },
  hostInfoText: { fontSize: 13, color: '#0369A1', fontWeight: '600', marginBottom: 4 },
  hostTeamName: { fontSize: 18, fontWeight: '800', color: '#0284C7' },
  teamChip: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: 'transparent' },
  teamChipActive: { backgroundColor: '#EFF6FF', borderColor: '#3B82F6' },
  teamChipText: { fontSize: 15, fontWeight: '600', color: '#64748B' },
  teamChipTextActive: { color: '#1D4ED8', fontWeight: '800' },
  formGroup: { marginBottom: 22 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  quickInputBtn: { backgroundColor: '#EFF6FF', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: '#BFDBFE' },
  quickInputText: { fontSize: 12, color: '#1D4ED8', fontWeight: '700' },
  label: { fontSize: 15, fontWeight: '700', color: Colors.text, marginBottom: 8 },
  subLabel: { fontSize: 12, color: '#059669', fontWeight: '600', marginBottom: 8 },
  input: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: Colors.text },
  datePickerBtn: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 16 },
  datePickerText: { fontSize: 16, color: Colors.primary, fontWeight: '600' },
  textArea: { height: 100, paddingTop: 14 },
  formatChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: 'transparent' },
  chipActive: { backgroundColor: '#EFF6FF', borderColor: '#3B82F6' },
  chipText: { fontSize: 14, color: '#64748B', fontWeight: '600' },
  chipTextActive: { color: '#2563EB', fontWeight: '700' },
  submitBtn: { backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 18, alignItems: 'center', marginTop: 10, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4 },
  btnDisabled: { opacity: 0.7 },
  submitBtnText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
});