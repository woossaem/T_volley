import React, { useState, useEffect } from 'react';
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
import StickyAdBanner from '../components/StickyAdBanner'; // 💡 스티커 배너 Import

interface OfficialSchool { id: string; region: string; name: string; formatted: string; }
interface TeamData { id: string; name: string; region: string; pin_code?: string | null; }

const normalizeRegionName = (input: string): string => {
  if (!input || !input.trim()) return '';
  let text = input.trim();
  text = text.replace(/^(충청남도|충청북도|경기도|전라북도|전라남도|경상북도|경상남도|충남|충북|경기|전남|전북|경남|경북)\s*/, '');
  if (text.length > 2) {
    text = text.replace(/(특별자치시|광역시|특별시|시|군)$/, '');
  }
  return text.trim();
};

export default function TeamManagementScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user?.id;

  const [loading, setLoading] = useState(true);
  const [submitting, setActionSubmitting] = useState(false);

  const [dbSchools, setDbSchools] = useState<OfficialSchool[]>([]);
  const [dbTeams, setDbTeams] = useState<TeamData[]>([]);
  const [availableRegions, setAvailableRegions] = useState<string[]>(['천안', '아산']); 

  const [myJoinedTeams, setMyJoinedTeams] = useState<any[]>([]);
  const [teamMode, setTeamMode] = useState<'join' | 'create'>('join');
  
  // 기존 팀 가입 관련
  const [joinTeamName, setJoinTeamName] = useState('');
  const [filteredJoinTeams, setFilteredJoinTeams] = useState<TeamData[]>([]);
  const [showJoinTeamDropdown, setShowJoinTeamDropdown] = useState(false);
  const [joinPinCode, setJoinPinCode] = useState('');
  
  // 신생 팀 창단 관련
  const [newTeamName, setNewTeamName] = useState('');
  const [filteredCreateSchools, setFilteredCreateSchools] = useState<OfficialSchool[]>([]);
  const [showCreateTeamDropdown, setShowCreateTeamDropdown] = useState(false);
  const [newTeamType, setNewTeamType] = useState<'school' | 'club'>('school');
  
  const [selectedCreateTeamRegion, setSelectedCreateTeamRegion] = useState('천안');
  const [customCreateTeamRegionText, setCustomCreateTeamRegionText] = useState('');
  const [filteredRegionSuggestions, setFilteredRegionSuggestions] = useState<string[]>([]);
  const [showRegionDropdown, setShowRegionDropdown] = useState(false);

  const [newTeamPin, setNewTeamPin] = useState('');
  const [newTeamYoutube, setNewTeamYoutube] = useState('');

  const parseTeam = (raw: any) => (Array.isArray(raw) ? raw[0] : raw);

  useEffect(() => {
    fetchInitialData();
  }, [session]);

  const fetchInitialData = async () => {
    if (!userId) return;
    try {
      setLoading(true);

      const { data: sData } = await supabase.from('official_schools').select('*').eq('is_active', true);
      const regionSet = new Set<string>(['천안', '아산']); 

      if (sData) {
        const formattedSchools = sData.map(s => {
          if (s.region) {
            const cleanReg = normalizeRegionName(s.region);
            if (cleanReg) regionSet.add(cleanReg);
          }
          return {
            ...s,
            formatted: s.name.replace(/초등학교$/, '초')
          };
        });
        setDbSchools(formattedSchools);
      }

      const { data: tData } = await supabase.from('teams').select('id, name, region, pin_code');
      if (tData) {
        tData.forEach(t => { 
          if (t.region) {
            const cleanReg = normalizeRegionName(t.region);
            if (cleanReg) regionSet.add(cleanReg);
          }
        });
        setDbTeams(tData);
      }

      setAvailableRegions(Array.from(regionSet));

      const { data: tmData } = await supabase
        .from('team_members')
        .select('team_id, is_primary, teams(id, name, region, team_type)')
        .eq('user_id', userId)
        .eq('is_active', true);

      if (tmData) {
        setMyJoinedTeams(
          tmData.map((item: any) => ({
            ...parseTeam(item.teams),
            is_primary: item.is_primary,
          })).filter(t => t && t.name)
        );
      }
    } catch (err) {
      console.error('팀 데이터 로드 실패:', err);
    } finally {
      setLoading(false);
    }
  };

  const onJoinTeamChange = (text: string) => {
    setJoinTeamName(text);
    if (text.trim().length >= 1) {
      const matches = dbTeams.filter(t => t.name.includes(text.trim()));
      setFilteredJoinTeams(matches);
      setShowJoinTeamDropdown(matches.length > 0);
    } else {
      setShowJoinTeamDropdown(false);
    }
  };

  const selectJoinTeam = (team: TeamData) => {
    setJoinTeamName(team.name);
    setShowJoinTeamDropdown(false);
  };

  const handleJoinTeamByPin = async () => {
    if (!joinTeamName.trim()) return Alert.alert('알림', '가입할 팀 이름을 입력하거나 선택해 주세요.');
    
    setActionSubmitting(true);
    try {
      let searchName = joinTeamName.trim();
      const exactMatch = dbTeams.find(t => t.name === searchName || t.name === searchName.replace(/초등학교$/, '초'));
      if (exactMatch) {
        searchName = exactMatch.name;
      }

      const { data: targetTeam } = await supabase.from('teams').select('*').eq('name', searchName).maybeSingle();
      if (!targetTeam) return Alert.alert('가입 실패', `'${joinTeamName}' 팀을 찾을 수 없습니다. 정확한 팀명을 선택해 주세요.`);
      
      if (targetTeam.pin_code && targetTeam.pin_code.trim().length > 0) {
        if (!joinPinCode.trim()) {
          return Alert.alert('비밀번호 필요', `'${targetTeam.name}' 팀은 가입 비밀번호가 설정된 팀입니다. 비밀번호 4자리를 입력해 주세요.`);
        }
        if (targetTeam.pin_code !== joinPinCode.trim()) {
          return Alert.alert('비밀번호 오류', '비밀번호가 일치하지 않습니다.');
        }
      }

      await supabase.from('team_members').upsert({ user_id: userId, team_id: targetTeam.id, is_active: true });
      Alert.alert('가입 성공! 🎉', `'${targetTeam.name}' 팀에 합류하셨습니다.`);
      setJoinTeamName(''); setJoinPinCode('');
      fetchInitialData();
    } catch (err: any) { Alert.alert('오류', err.message); } 
    finally { setActionSubmitting(false); }
  };

  const onCreateTeamNameChange = (text: string) => {
    setNewTeamName(text);
    if (newTeamType === 'school' && text.trim().length >= 1) {
      const matches = dbSchools.filter(s => s.formatted.includes(text.trim()) || s.name.includes(text.trim()));
      setFilteredCreateSchools(matches);
      setShowCreateTeamDropdown(matches.length > 0);
    } else {
      setShowCreateTeamDropdown(false);
    }
  };

  const selectCreateTeamSchool = (school: OfficialSchool) => {
    setNewTeamName(school.formatted);
    setShowCreateTeamDropdown(false);
    if (school.region) {
      const cleanRegion = normalizeRegionName(school.region);
      setSelectedCreateTeamRegion(cleanRegion); 
      setCustomCreateTeamRegionText('');
    }
  };

  const onCustomRegionChange = (text: string) => {
    setCustomCreateTeamRegionText(text);
    if (text.trim().length >= 1) {
      const matches = availableRegions.filter(r => r.includes(text.trim()) || text.trim().includes(r));
      setFilteredRegionSuggestions(matches);
      setShowRegionDropdown(matches.length > 0);
    } else {
      setShowRegionDropdown(false);
    }
  };

  const selectRegionSuggestion = (region: string) => {
    setSelectedCreateTeamRegion(region);
    setCustomCreateTeamRegionText('');
    setShowRegionDropdown(false);
  };

  const handleCreateNewTeam = async () => {
    let finalTeamName = newTeamName.trim();
    if (!finalTeamName) return Alert.alert('알림', '신생 팀 이름을 입력해 주세요.');

    let rawRegionInput = selectedCreateTeamRegion === '직접 입력' ? customCreateTeamRegionText.trim() : selectedCreateTeamRegion;
    let finalTeamRegion = normalizeRegionName(rawRegionInput);

    if (!finalTeamRegion) {
      return Alert.alert('입력 확인', '팀의 주 활동 지역을 선택하거나 직접 입력해 주세요.');
    }

    if (newTeamType === 'school') {
      const matchedSchool = dbSchools.find(s => 
        s.name === finalTeamName || 
        s.formatted === finalTeamName || 
        s.name.replace(/초등학교$/, '초') === finalTeamName.replace(/초등학교$/, '초')
      );
      if (matchedSchool) {
        finalTeamName = matchedSchool.formatted;
        finalTeamRegion = normalizeRegionName(matchedSchool.region);
      }
    }

    setActionSubmitting(true);
    try {
      const { data: existing } = await supabase.from('teams').select('id').eq('name', finalTeamName).maybeSingle();
      if (existing) return Alert.alert('개설 중복', `'${finalTeamName}'팀은 이미 존재합니다. 기존 팀 가입 탭을 이용해 주세요.`);

      const finalPinCode = newTeamPin.trim() ? newTeamPin.trim() : null;

      const { data: createdTeam, error: createErr } = await supabase.from('teams').insert({
        name: finalTeamName,
        region: finalTeamRegion, 
        team_type: newTeamType,
        pin_code: finalPinCode,
        youtube_channel_url: newTeamYoutube.trim() || null,
        leader_id: userId,
      }).select().single();

      if (createErr) throw createErr;

      await supabase.from('team_members').insert({ user_id: userId, team_id: createdTeam.id, is_active: true, is_primary: myJoinedTeams.length === 0 });
      Alert.alert('팀 개설 완료! ✨', `'${finalTeamName}' [${finalTeamRegion}] 팀이 정식 창단되었습니다.`);
      setNewTeamName(''); setNewTeamPin(''); setNewTeamYoutube(''); setCustomCreateTeamRegionText('');
      fetchInitialData();
    } catch (err: any) { Alert.alert('오류', err.message); } 
    finally { setActionSubmitting(false); }
  };

  const getTeamIcon = (type?: string) => (type === 'club' ? '🛡️' : '🏫');

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} hitSlop={10}>
            <Text style={styles.backText}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>소속 팀 관리 및 가입</Text>
          <View style={{ width: 32 }} />
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {loading ? (
            <ActivityIndicator color={Colors.primary} size="large" style={{ marginTop: 40 }} />
          ) : (
            <>
              {/* 1. 현재 가입된 팀 목록 */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>👥 현재 소속된 팀 목록 ({myJoinedTeams.length}개)</Text>
                {myJoinedTeams.length > 0 ? (
                  <View style={{ gap: 8 }}>
                    {myJoinedTeams.map((t) => (
                      <View key={t.id || t.name} style={styles.joinedTeamItem}>
                        <Text style={styles.joinedTeamName}>
                          {t.is_primary ? '⭐ ' : ''}{getTeamIcon(t.team_type)} {t.name} ({t.team_type === 'club' ? '동호회' : '학교팀'})
                        </Text>
                        <TouchableOpacity onPress={() => router.push({ pathname: '/my-team-detail', params: { teamId: t.id } })}>
                          <Text style={{ fontSize: 12, color: Colors.primary, fontWeight: '700' }}>관리 ➔</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={{ color: Colors.textMuted, fontSize: 13 }}>아직 가입된 배구 팀이 없습니다.</Text>
                )}
              </View>

              {/* 2. 기존 팀 가입 / 신생 팀 개설 탭 */}
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
                  <View style={{ marginTop: 16 }}>
                    <Text style={styles.label}>1. 가입할 팀 검색</Text>
                    <TextInput 
                      style={styles.input} 
                      placeholder="예: 삼은초, 교사배구사랑 (입력 시 아래 추천 목록)" 
                      placeholderTextColor="#94A3B8"
                      value={joinTeamName} 
                      onChangeText={onJoinTeamChange} 
                    />

                    {showJoinTeamDropdown && filteredJoinTeams.length > 0 && (
                      <View style={styles.inlineSuggestionContainer}>
                        <Text style={styles.inlineSuggestionHeader}>💡 검색된 기존 팀 목록 (터치하여 선택)</Text>
                        {filteredJoinTeams.map((t) => (
                          <TouchableOpacity key={t.id} style={styles.inlineSuggestionItem} onPress={() => selectJoinTeam(t)}>
                            <Text style={styles.inlineSuggestionText}>🛡️ {t.name}</Text>
                            <Text style={styles.inlineSuggestionBadge}>{t.region}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}

                    <Text style={[styles.label, { marginTop: 14 }]}>2. 팀 가입 비밀번호 입력 (보호된 팀인 경우)</Text>
                    <TextInput style={styles.input} placeholder="공유받은 비밀번호 4자리 (공개팀은 미입력 가능)" placeholderTextColor="#94A3B8" value={joinPinCode} onChangeText={setJoinPinCode} keyboardType="number-pad" />
                    
                    <TouchableOpacity style={styles.actionBtn} onPress={handleJoinTeamByPin} disabled={submitting}>
                      {submitting ? <ActivityIndicator color="#1D4ED8" /> : <Text style={styles.actionBtnText}>+ 기존 팀 합류하기</Text>}
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={{ marginTop: 16 }}>
                    <Text style={styles.label}>1. 신생 팀 분류 선택</Text>
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 4, marginBottom: 12 }}>
                      <TouchableOpacity style={[styles.chip, newTeamType === 'school' && styles.chipActive]} onPress={() => setNewTeamType('school')}>
                        <Text style={[styles.chipText, newTeamType === 'school' && styles.chipTextActive]}>🏫 학교 소속 팀</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.chip, newTeamType === 'club' && styles.chipActive]} onPress={() => setNewTeamType('club')}>
                        <Text style={[styles.chipText, newTeamType === 'club' && styles.chipTextActive]}>🛡️ 연합/동호회 팀</Text>
                      </TouchableOpacity>
                    </View>

                    <Text style={styles.label}>{newTeamType === 'school' ? '2. 학교명 검색 (파편화 방지)' : '2. 동호회 팀명 입력'}</Text>
                    <TextInput 
                      style={styles.input} 
                      placeholder={newTeamType === 'school' ? '예: 삼은초, 불당초 (입력 시 정식 학교 목록)' : '예: 천안배구사랑'} 
                      placeholderTextColor="#94A3B8"
                      value={newTeamName} 
                      onChangeText={onCreateTeamNameChange} 
                    />

                    {showCreateTeamDropdown && newTeamType === 'school' && filteredCreateSchools.length > 0 && (
                      <View style={styles.inlineSuggestionContainer}>
                        <Text style={styles.inlineSuggestionHeader}>💡 DB 공식 등록 학교 목록 (선택 시 정식 명칭/지역 자동 연동)</Text>
                        {filteredCreateSchools.map((sch) => (
                          <TouchableOpacity key={sch.id} style={styles.inlineSuggestionItem} onPress={() => selectCreateTeamSchool(sch)}>
                            <Text style={styles.inlineSuggestionText}>🏫 {sch.formatted}</Text>
                            <Text style={styles.inlineSuggestionBadge}>{sch.region}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}

                    <Text style={[styles.label, { marginTop: 14 }]}>3. 팀 주 활동 지역</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                      {[...availableRegions, '직접 입력'].map((r) => (
                        <TouchableOpacity 
                          key={r} 
                          style={[styles.chip, selectedCreateTeamRegion === r && styles.chipActive]} 
                          onPress={() => {
                            setSelectedCreateTeamRegion(r);
                            setShowRegionDropdown(false);
                          }}
                        >
                          <Text style={[styles.chipText, selectedCreateTeamRegion === r && styles.chipTextActive]}>
                            {selectedCreateTeamRegion === r ? '✓ ' : ''}{r}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    {selectedCreateTeamRegion === '직접 입력' && (
                      <View style={{ marginTop: 8 }}>
                        <TextInput
                          style={styles.input}
                          placeholder="신규 지역명 입력 (예: 공주, 세종, 대전)"
                          placeholderTextColor="#94A3B8"
                          value={customCreateTeamRegionText}
                          onChangeText={onCustomRegionChange}
                        />
                        {showRegionDropdown && filteredRegionSuggestions.length > 0 && (
                          <View style={styles.inlineSuggestionContainer}>
                            <Text style={styles.inlineSuggestionHeader}>💡 DB 정식 등록 지역 추천 (선택 시 오탈자 방지)</Text>
                            {filteredRegionSuggestions.map((reg, idx) => (
                              <TouchableOpacity key={idx} style={styles.inlineSuggestionItem} onPress={() => selectRegionSuggestion(reg)}>
                                <Text style={styles.inlineSuggestionText}>📍 {reg}</Text>
                                <Text style={styles.inlineSuggestionBadge}>정식 지역</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        )}
                      </View>
                    )}

                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, marginBottom: 4 }}>
                      <Text style={styles.label}>4. 팀원 가입 비밀번호 설정 (선택)</Text>
                      <Text style={{ fontSize: 11, color: '#059669', fontWeight: '700' }}>🔓 미입력 시 자유 가입 공개 팀</Text>
                    </View>
                    <TextInput style={styles.input} placeholder="4자리 숫자 (미입력 시 비밀번호 없는 공개 팀)" placeholderTextColor="#94A3B8" value={newTeamPin} onChangeText={setNewTeamPin} keyboardType="number-pad" maxLength={4} />
                    
                    <Text style={[styles.label, { marginTop: 14 }]}>5. 팀 공식 유튜브 채널 URL (선택)</Text>
                    <TextInput style={styles.input} placeholder="예: https://www.youtube.com/@팀채널" placeholderTextColor="#94A3B8" value={newTeamYoutube} onChangeText={setNewTeamYoutube} autoCapitalize="none" />

                    <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#10B981', borderColor: '#059669', marginTop: 16 }]} onPress={handleCreateNewTeam} disabled={submitting}>
                      {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={[styles.actionBtnText, { color: '#FFFFFF' }]}>✨ {newTeamType === 'school' ? '학교 팀 개설 완료' : '동호회 개설 완료'}</Text>}
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
      
      {/* 💡 스티커 광고 배너 부착 */}
      <StickyAdBanner />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backBtn: { width: 32, height: 32, justifyContent: 'center' },
  backText: { fontSize: 32, color: Colors.text, lineHeight: 32 },
  headerTitle: { fontSize: 16, fontWeight: '800', color: Colors.text },
  
  // 💡 광고 가림 방지 여백 추가
  content: { padding: 20, gap: 16, paddingBottom: 60 },
  
  section: { backgroundColor: Colors.surface, borderRadius: 16, padding: 18, borderWidth: 1, borderColor: Colors.border },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: Colors.text, marginBottom: 16 },
  
  label: { fontSize: 13, fontWeight: '700', color: '#475569', marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 10, padding: 12, fontSize: 14, backgroundColor: '#F8FAFC', color: Colors.text },

  inlineSuggestionContainer: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1.5,
    borderColor: '#3B82F6',
    borderRadius: 12,
    marginTop: 6,
    overflow: 'hidden',
  },
  inlineSuggestionHeader: {
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 12,
    paddingVertical: 6,
    fontSize: 11,
    fontWeight: '800',
    color: '#1D4ED8',
  },
  inlineSuggestionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#DBEAFE',
    backgroundColor: '#FFFFFF',
  },
  inlineSuggestionText: { fontSize: 14, fontWeight: '800', color: '#1E293B' },
  inlineSuggestionBadge: { fontSize: 11, fontWeight: '800', color: '#1D4ED8', backgroundColor: '#EFF6FF', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },

  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: '#F1F5F9' },
  chipActive: { backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#3B82F6' },
  chipText: { fontSize: 13, fontWeight: '600', color: '#64748B' },
  chipTextActive: { color: '#1D4ED8', fontWeight: '800' },

  joinedTeamItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F8FAFC', padding: 14, borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0' },
  joinedTeamName: { fontSize: 14, fontWeight: '800', color: Colors.text },

  tabToggleRow: { flexDirection: 'row', backgroundColor: '#F1F5F9', borderRadius: 10, padding: 4 },
  toggleBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  toggleBtnActive: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#CBD5E1', elevation: 1 },
  toggleBtnText: { fontSize: 13, fontWeight: '700', color: '#64748B' },
  toggleBtnTextActive: { color: Colors.primary, fontWeight: '900' },

  actionBtn: { backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 16 },
  actionBtnText: { color: '#1D4ED8', fontWeight: '800', fontSize: 14 },
});