import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Switch,
  Modal, // 💡 팝업을 위해 Modal 추가
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Colors } from '../constants/Colors';
import StickyAdBanner from '../components/StickyAdBanner';

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

  // 용병 모집 기능 State
  const [needMercenary, setNeedMercenary] = useState(false);
  const [mercenaryDetails, setMercenaryDetails] = useState('');

  // 💡 항목별 최근 5개 기록 저장 (중복 제거)
  const [recentLocations, setRecentLocations] = useState<string[]>([]);
  const [recentDescriptions, setRecentDescriptions] = useState<string[]>([]);
  const [recentContacts, setRecentContacts] = useState<string[]>([]);

  // 💡 목록 선택 모달 State
  const [historyModalVisible, setHistoryModalVisible] = useState(false);
  const [historyType, setHistoryType] = useState<'location' | 'description' | 'contact' | null>(null);

  const userId = session?.user?.id;

  useEffect(() => {
    fetchMyTeamsAndMatchHistory();
  }, [session]);

  const fetchMyTeamsAndMatchHistory = async () => {
    if (!userId) return;

    try {
      const { data, error } = await supabase
        .from('team_members')
        .select(`team_id, teams (id, name, region)`)
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

      // 💡 최근 20경기 기록을 불러와서 각 항목별 고유값 5개씩 추출
      const { data: recentMatches } = await supabase
        .from('matches')
        .select('location, contact_info, description')
        .eq('host_user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20);

      if (recentMatches && recentMatches.length > 0) {
        const locs = Array.from(new Set(recentMatches.map(m => m.location?.trim()).filter(Boolean))).slice(0, 5);
        const descs = Array.from(new Set(recentMatches.map(m => m.description?.trim()).filter(Boolean))).slice(0, 5);
        const conts = Array.from(new Set(recentMatches.map(m => m.contact_info?.trim()).filter(Boolean))).slice(0, 5);

        setRecentLocations(locs);
        setRecentDescriptions(descs);
        setRecentContacts(conts);
      }
    } catch (err) {
      console.error('데이터 로딩 오류:', err);
    } finally {
      setFetchingProfile(false);
    }
  };

  useEffect(() => {
    if (selectedTeam) {
      setMyGymName(`${selectedTeam.name} 체육관`);
    }
  }, [selectedTeam]);

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

      const { data: members } = await supabase.from('team_members').select('user_id').eq('team_id', teamData.id).eq('is_active', true);

      if (!members || members.length === 0) return;

      const notifications = members.map((m: any) => ({
        user_id: m.user_id, title, message, is_read: false,
      }));

      await supabase.from('notifications').insert(notifications);
    } catch (err) {
      console.error('알림 저장 실패:', err);
    }
  };

  const handleCreateMatch = async () => {
    if (!selectedTeam) return;
    if (!location.trim()) return Alert.alert('알림', '장소(체육관)를 입력해 주세요.');
    if (!contactInfo.trim()) return Alert.alert('알림', '매칭 성사 후 연락할 수 있는 연락망을 입력해 주세요.');
    if (needMercenary && !mercenaryDetails.trim()) return Alert.alert('알림', '용병 모집 조건(필요 포지션, 인원 등)을 작성해 주세요.');
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
        need_mercenary: needMercenary,
        mercenary_details: needMercenary ? mercenaryDetails.trim() : null,
      });

      if (error) throw error;

      const notiTitle = needMercenary ? '🛡️ [팀/용병 모집 알림] 신규 경기 등록' : '🛡️ [팀 모집 알림] 신규 경기 등록';
      const notiBody = needMercenary
        ? `'${selectedTeam.name}' 팀의 신규 경기 및 용병 모집글이 등록되었습니다. (${formattedDate} ${formattedTime})`
        : `'${selectedTeam.name}' 팀의 새로운 경기 모집글이 등록되었습니다. (${formattedDate} ${formattedTime})`;

      await sendTeamNotification(selectedTeam.name, notiTitle, notiBody);

      Alert.alert('등록 완료! 🏐', '경기 모집글이 등록되었으며, 팀원들에게 알림이 발송되었습니다.', [
        { text: '확인', onPress: () => router.replace('/matches') },
      ]);
    } catch (err: any) {
      Alert.alert('오류', '경기 등록 중 문제가 발생했습니다: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const openHistoryModal = (type: 'location' | 'description' | 'contact') => {
    setHistoryType(type);
    setHistoryModalVisible(true);
  };

  const handleSelectHistory = (val: string) => {
    if (historyType === 'location') setLocation(val);
    if (historyType === 'description') setDescription(val);
    if (historyType === 'contact') setContactInfo(val);
    setHistoryModalVisible(false);
  };

  const getCurrentHistoryList = () => {
    if (historyType === 'location') return recentLocations;
    if (historyType === 'description') return recentDescriptions;
    if (historyType === 'contact') return recentContacts;
    return [];
  };

  const getHistoryModalTitle = () => {
    if (historyType === 'location') return '📍 최근 입력한 장소 선택';
    if (historyType === 'description') return '💬 최근 남긴 말 선택';
    if (historyType === 'contact') return '📞 최근 연락처 선택';
    return '';
  };

  if (fetchingProfile) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: 'center' }]} edges={['top', 'left', 'right']}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.inner}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} hitSlop={10}>
            <Text style={styles.backText}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>경기 매치 등록</Text>
          <View style={{ width: 32 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.formGroup}>
            <Text style={styles.label}>어느 팀 소속으로 모집하시나요?</Text>
            {myTeams.length > 1 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                {myTeams.map((team) => (
                  <TouchableOpacity
                    key={team.id}
                    style={[styles.teamChip, selectedTeam?.id === team.id && styles.teamChipActive]}
                    onPress={() => setSelectedTeam(team)}
                  >
                    <Text style={[styles.teamChipText, selectedTeam?.id === team.id && styles.teamChipTextActive]}>
                      🛡️ {team.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            ) : (
              <View style={styles.hostInfo}>
                <Text style={styles.hostInfoText}>초청 팀 ({selectedTeam?.region})</Text>
                <Text style={styles.hostTeamName}>🛡️ {selectedTeam?.name}</Text>
              </View>
            )}
          </View>

          <View style={styles.rowFormGroup}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>날짜 선택</Text>
              <TouchableOpacity style={styles.compactPickerBtn} onPress={() => setShowDatePicker(true)}>
                <Text style={styles.compactPickerText}>📅 {formattedDate}</Text>
              </TouchableOpacity>
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.label}>시간 선택</Text>
              <TouchableOpacity style={styles.compactPickerBtn} onPress={() => setShowTimePicker(true)}>
                <Text style={styles.compactPickerText}>⏰ {formattedTime}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {showDatePicker && <DateTimePicker value={date} mode="date" display="default" onChange={onChangeDate} />}
          {showTimePicker && <DateTimePicker value={date} mode="time" display="default" onChange={onChangeTime} />}

          {/* 장소 입력 영역 */}
          <View style={styles.formGroup}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>장소 (체육관)</Text>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {recentLocations.length > 0 && (
                  <TouchableOpacity style={styles.quickFillChipInline} onPress={() => openHistoryModal('location')}>
                    <Text style={styles.quickFillChipInlineText}>⚡ 장소 선택</Text>
                  </TouchableOpacity>
                )}
                {myGymName && (
                  <TouchableOpacity style={styles.quickInputBtn} onPress={() => setLocation(myGymName)}>
                    <Text style={styles.quickInputText}>⚡ {myGymName} 입력</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
            <TextInput
              style={styles.input}
              placeholder={`예: ${myGymName || '불당초등학교 체육관'}`}
              placeholderTextColor="#94A3B8"
              value={location}
              onChangeText={setLocation}
            />
          </View>

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

          <View style={[styles.formGroup, styles.mercenaryBox]}>
            <View style={styles.switchRow}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={styles.mercenaryTitle}>🙋‍♂️ 개인 용병(게스트)도 함께 구하나요?</Text>
                <Text style={styles.mercenarySub}>인원이 부족할 때 개인 참가자(용병)를 함께 모집합니다.</Text>
              </View>
              <Switch
                value={needMercenary}
                onValueChange={setNeedMercenary}
                trackColor={{ false: '#CBD5E1', true: '#93C5FD' }}
                thumbColor={needMercenary ? '#2563EB' : '#F1F5F9'}
              />
            </View>

            {needMercenary && (
              <View style={{ marginTop: 8 }}>
                <Text style={styles.subInputLabel}>모집 조건 및 상세 내용</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: '#FFFFFF' }]}
                  placeholder="예: 센터 1명, 레프트 1명 모집 (회비 5,000원)"
                  placeholderTextColor="#94A3B8"
                  value={mercenaryDetails}
                  onChangeText={setMercenaryDetails}
                />
              </View>
            )}
          </View>

          {/* 남기고 싶은 말 영역 */}
          <View style={styles.formGroup}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>남기고 싶은 말 (선택)</Text>
              {recentDescriptions.length > 0 && (
                <TouchableOpacity style={styles.quickFillChipInline} onPress={() => openHistoryModal('description')}>
                  <Text style={styles.quickFillChipInlineText}>⚡ 문구 선택</Text>
                </TouchableOpacity>
              )}
            </View>
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

          {/* 대표자 연락처 영역 */}
          <View style={styles.formGroup}>
            <View style={styles.labelRow}>
              <View>
                <Text style={styles.label}>대표자 연락처 또는 오픈채팅</Text>
                <Text style={styles.subLabel}>※ 매칭 성사된 상대에게 안전하게 공개됩니다.</Text>
              </View>
              {recentContacts.length > 0 && (
                <TouchableOpacity style={styles.quickFillChipInline} onPress={() => openHistoryModal('contact')}>
                  <Text style={styles.quickFillChipInlineText}>⚡ 연락처 선택</Text>
                </TouchableOpacity>
              )}
            </View>
            <TextInput
              style={styles.input}
              placeholder="예: 010-1234-5678 또는 카카오톡 오픈채팅 링크"
              placeholderTextColor="#94A3B8"
              value={contactInfo}
              onChangeText={setContactInfo}
            />
          </View>

          <TouchableOpacity style={[styles.submitBtn, loading && styles.btnDisabled]} onPress={handleCreateMatch} disabled={loading} activeOpacity={0.85}>
            {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitBtnText}>모집글 등록하기</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      <StickyAdBanner />

      {/* 💡 최근 기록 선택 모달 */}
      <Modal visible={historyModalVisible} transparent={true} animationType="fade" onRequestClose={() => setHistoryModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{getHistoryModalTitle()}</Text>
            <Text style={styles.modalSub}>이전에 작성했던 항목을 선택하여 자동 완성하세요.</Text>
            
            <ScrollView style={{ maxHeight: 260, marginTop: 10 }} showsVerticalScrollIndicator={false}>
              {getCurrentHistoryList().map((item, idx) => (
                <TouchableOpacity 
                  key={idx} 
                  style={styles.historyItemBtn} 
                  onPress={() => handleSelectHistory(item)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.historyItemText} numberOfLines={3}>{item}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TouchableOpacity style={styles.closeBtn} onPress={() => setHistoryModalVisible(false)}>
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
  inner: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backBtn: { width: 32, height: 32, justifyContent: 'center' },
  backText: { fontSize: 28, color: Colors.text, lineHeight: 28 },
  headerTitle: { fontSize: 16, fontWeight: '800', color: Colors.text },

  scrollContent: { padding: 14, paddingBottom: 30 },
  
  hostInfo: { backgroundColor: '#F0F9FF', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#BAE6FD' },
  hostInfoText: { fontSize: 11, color: '#0369A1', fontWeight: '600', marginBottom: 2 },
  hostTeamName: { fontSize: 16, fontWeight: '800', color: '#0284C7' },

  teamChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: 'transparent' },
  teamChipActive: { backgroundColor: '#EFF6FF', borderColor: '#3B82F6' },
  teamChipText: { fontSize: 13, fontWeight: '600', color: '#64748B' },
  teamChipTextActive: { color: '#1D4ED8', fontWeight: '800' },

  formGroup: { marginBottom: 12 },
  rowFormGroup: { flexDirection: 'row', gap: 10, marginBottom: 12 },

  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  
  /* 개별 퀵 불러오기 버튼 스타일 */
  quickFillChipInline: { backgroundColor: '#FEFCE8', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: '#FDE047' },
  quickFillChipInlineText: { fontSize: 11, color: '#A16207', fontWeight: '800' },

  quickInputBtn: { backgroundColor: '#EFF6FF', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: '#BFDBFE' },
  quickInputText: { fontSize: 11, color: '#1D4ED8', fontWeight: '800' },

  label: { fontSize: 12, fontWeight: '800', color: '#475569', marginBottom: 2 },
  subLabel: { fontSize: 10, color: '#059669', fontWeight: '600', marginBottom: 2 },

  input: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: Colors.text },

  compactPickerBtn: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, alignItems: 'center' },
  compactPickerText: { fontSize: 13, color: Colors.primary, fontWeight: '700' },

  textArea: { height: 68, paddingTop: 10 },

  formatChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: 'transparent' },
  chipActive: { backgroundColor: '#EFF6FF', borderColor: '#3B82F6' },
  chipText: { fontSize: 12, color: '#64748B', fontWeight: '600' },
  chipTextActive: { color: '#2563EB', fontWeight: '800' },

  mercenaryBox: { backgroundColor: '#EFF6FF', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#BFDBFE' },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  mercenaryTitle: { fontSize: 12, fontWeight: '800', color: '#1D4ED8' },
  mercenarySub: { fontSize: 10, color: '#3B82F6', marginTop: 1, fontWeight: '600' },
  subInputLabel: { fontSize: 11, fontWeight: '700', color: '#1E40AF', marginBottom: 4 },

  submitBtn: { backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 8, elevation: 2 },
  btnDisabled: { opacity: 0.7 },
  submitBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },

  /* 💡 히스토리 팝업 모달 스타일 */
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: Colors.surface, borderRadius: 16, padding: 20, width: '100%', maxHeight: '80%', elevation: 5 },
  modalTitle: { fontSize: 16, fontWeight: '800', color: Colors.text, marginBottom: 4 },
  modalSub: { fontSize: 12, color: Colors.textMuted, marginBottom: 6 },
  historyItemBtn: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  historyItemText: { fontSize: 14, color: '#1D4ED8', fontWeight: '600', lineHeight: 20 },
  closeBtn: { backgroundColor: '#F1F5F9', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 14 },
  closeBtnText: { color: Colors.text, fontWeight: '800', fontSize: 14 },
});