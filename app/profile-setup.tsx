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
  Image,
  KeyboardAvoidingView,
  Platform,
  BackHandler,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Colors } from '../constants/Colors';

// 🇰🇷 대한민국 표준 지역 프리셋 (충남 15개 시/군 전역 + 전국 광역시/도)
const KOREA_REGIONS_PRESET = [
  // 충청남도 15개 시/군
  '천안', '아산', '공주', '보령', '서산', '논산', '계룡', '당진',
  '금산', '부여', '서천', '청양', '홍성', '예산', '태안',
  // 광역시 및 주요 지역
  '세종', '대전', '서울', '인천', '광주', '대구', '부산', '울산',
  '경기', '강원', '충북', '전북', '전남', '경북', '경남', '제주'
];

// 화면 하단에 퀵 선택용으로 띄워둘 주요 6개 대표 지역 (UI 슬림화)
const QUICK_TOP_REGIONS = ['천안', '아산', '공주', '대전', '세종', '홍성'];

const VOLLEYBALL_POSITIONS = [
  '레프트',
  '라이트',
  '센터(중앙블로커)',
  '세터',
  '리베로',
  '백수비(수비전문)',
  '올라운더',
  '직접 입력',
];

const DOMINANT_HANDS = ['오른손', '왼손', '양손'];
const AVATAR_ICONS = ['🏐', '🦊', '🐻', '🦅', '🦁', '⚡', '👑', '🎯'];

interface OfficialSchool { id: string; region: string; name: string; formatted: string; }

// 🧹 지역명 표준화 정규화 함수 (충남 공주시 / 공주시 / 공주 -> 모두 '공주'로 통일)
const normalizeRegionName = (rawInput: string): string => {
  let clean = rawInput.trim();
  if (!clean) return '';

  // 1. 도/광역시 접두사 제거 (예: '충남 공주' -> '공주', '대전광역시' -> '대전')
  clean = clean.replace(/^(충남|충북|충청남도|충청북도|전남|전북|경남|경북|경기|경기도|강원|강원도|제주|제주도|서울|서울특별시|인천|인천광역시|대전|대전광역시|대구|대구광역시|광주|광주광역시|부산|부산광역시|울산|울산광역시|세종|세종특별자치시)\s*/, '');

  // 2. 시/군/구 접미사 제거 (예: '공주시' -> '공주', '예산군' -> '예산')
  if (clean.length >= 2 && (clean.endsWith('시') || clean.endsWith('군'))) {
    clean = clean.slice(0, -1);
  }

  return clean || rawInput.trim();
};

export default function ProfileSetupScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user?.id;

  const [loading, setLoading] = useState(true);
  const [submitting, setActionSubmitting] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  const [dbSchools, setDbSchools] = useState<OfficialSchool[]>([]);
  const [allSelectableRegions, setAllSelectableRegions] = useState<string[]>(KOREA_REGIONS_PRESET);

  const [fullName, setFullName] = useState('');
  const [gender, setGender] = useState<'남성' | '여성'>('남성');
  const [avatarIcon, setAvatarIcon] = useState('🏐');
  const [avatarUrl, setAvatarUrl] = useState('');
  
  const [schoolName, setSchoolName] = useState('');
  const [filteredSchools, setFilteredSchools] = useState<OfficialSchool[]>([]);
  const [showSchoolDropdown, setShowSchoolDropdown] = useState(false);

  const [selectedRegions, setSelectedRegions] = useState<string[]>(['천안']);
  
  const [customRegionText, setCustomRegionText] = useState('');
  const [filteredRegions, setFilteredRegions] = useState<string[]>([]);
  const [showRegionDropdown, setShowRegionDropdown] = useState(false);

  const [selectedPos, setSelectedPos] = useState('레프트');
  const [customPosText, setCustomPosText] = useState('');
  const [selectedHand, setSelectedHand] = useState('오른손');

  const [inviteCodeInput, setInviteCodeInput] = useState('');
  const [hasInviter, setHasInviter] = useState(false);
  const [isInitialSetup, setIsInitialSetup] = useState(true);

  useEffect(() => {
    const onBackPress = () => {
      if (isInitialSetup) {
        handleSignOutAlert();
        return true;
      }
      return false; 
    };
    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => subscription.remove();
  }, [isInitialSetup]);

  useEffect(() => {
    fetchInitialData();
  }, [session]);

  const fetchInitialData = async () => {
    if (!userId) return;
    try {
      setLoading(true);

      const { data: sData } = await supabase.from('official_schools').select('*').eq('is_active', true);
      let fetchedRegions: string[] = [];
      if (sData) {
        const formattedSchools = sData.map(s => ({
          ...s,
          formatted: s.name.replace(/초등학교$/, '초')
        }));
        setDbSchools(formattedSchools);

        fetchedRegions = Array.from(new Set(sData.map(s => normalizeRegionName(s.region)).filter(Boolean)));
      }

      const { data: prof } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
      if (prof) {
        if (prof.full_name) {
          setFullName(prof.full_name);
          setIsInitialSetup(false);
        } else {
          setIsInitialSetup(true);
        }

        setSchoolName(prof.school_name || '');
        setGender(prof.gender === '여성' ? '여성' : '남성');
        setAvatarIcon(prof.avatar_icon || '🏐');
        setAvatarUrl(prof.avatar_url || '');

        let profRegArr: string[] = [];
        if (prof.region) {
          profRegArr = prof.region.split(',').map((r: string) => normalizeRegionName(r)).filter(Boolean);
          if (profRegArr.length > 0) setSelectedRegions(profRegArr);
        }

        const combined = Array.from(new Set([...KOREA_REGIONS_PRESET, ...fetchedRegions, ...profRegArr]));
        setAllSelectableRegions(combined);

        if (prof.position) {
          const parts = prof.position.split(' / ');
          if (parts[0]) {
            if (VOLLEYBALL_POSITIONS.includes(parts[0])) {
              setSelectedPos(parts[0]);
            } else {
              setSelectedPos('직접 입력');
              setCustomPosText(parts[0]);
            }
          }
          if (parts[1] && DOMINANT_HANDS.includes(parts[1])) {
            setSelectedHand(parts[1]);
          }
        }

        if (prof.invited_by) setHasInviter(true);
      } else {
        const rawName = session?.user?.user_metadata?.full_name || session?.user?.user_metadata?.name || '';
        const koreanOnlyName = rawName.replace(/[^가-힣]/g, '');
        setFullName(koreanOnlyName);
        setIsInitialSetup(true);
        setAllSelectableRegions(Array.from(new Set([...KOREA_REGIONS_PRESET, ...fetchedRegions])));
      }
    } catch (err) {
      console.error('초기 데이터 로드 실패:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOutAlert = () => {
    Alert.alert('가입 진행 취소', '프로필 설정을 중단하고 처음 화면으로 돌아가시겠습니까?', [
      { text: '계속 작성하기', style: 'cancel' },
      { text: '돌아가기 (로그아웃)', style: 'destructive', onPress: async () => { await supabase.auth.signOut(); router.replace('/login'); } },
    ]);
  };

  const handlePickAndUploadImage = async () => {
    if (!userId) return;
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) return Alert.alert('권한 필요', '사진 앨범 접근 권한을 허용해 주세요.');

      const pickerResult = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.5,
      });

      if (pickerResult.canceled || !pickerResult.assets[0]) return;

      setUploadingImage(true);
      const selectedAsset = pickerResult.assets[0];
      const response = await fetch(selectedAsset.uri);
      const blob = await response.blob();
      const arrayBuffer = await new Response(blob).arrayBuffer();

      const fileExt = selectedAsset.uri.split('.').pop()?.toLowerCase() || 'jpeg';
      const filePath = `${userId}_${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage.from('avatars').upload(filePath, arrayBuffer, {
        contentType: `image/${fileExt === 'jpg' ? 'jpeg' : fileExt}`, upsert: true,
      });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
      setAvatarUrl(urlData.publicUrl);
      Alert.alert('사진 업로드 완료! ✨');
    } catch (err: any) {
      Alert.alert('업로드 실패', err.message);
    } finally {
      setUploadingImage(false);
    }
  };

  const onProfileSchoolChange = (text: string) => {
    setSchoolName(text);
    if (text.trim().length >= 1) {
      const matches = dbSchools.filter(s => s.formatted.includes(text.trim()) || s.name.includes(text.trim()));
      setFilteredSchools(matches);
      setShowSchoolDropdown(matches.length > 0);
    } else {
      setShowSchoolDropdown(false);
    }
  };

  const selectProfileSchool = (school: OfficialSchool) => {
    setSchoolName(school.formatted);
    setShowSchoolDropdown(false);
  };

  // 🔍 지역 실시간 자동완성 검색 핸들러 (표준화 반영)
  const onRegionInputChange = (text: string) => {
    setCustomRegionText(text);
    const searchKey = normalizeRegionName(text);

    if (searchKey.length >= 1) {
      const matches = allSelectableRegions.filter(r => r.includes(searchKey) || normalizeRegionName(r).includes(searchKey));
      setFilteredRegions(matches);
      setShowRegionDropdown(true);
    } else {
      setShowRegionDropdown(false);
    }
  };

  // 📍 선택한 지역 표준 명칭으로 최종 추가
  const handleAddCustomRegion = (regionName: string) => {
    const standardized = normalizeRegionName(regionName);
    if (!standardized) return;

    if (selectedRegions.includes(standardized)) {
      Alert.alert('알림 💡', `'${standardized}'(은)는 이미 선택된 지역입니다.`);
      setCustomRegionText('');
      setShowRegionDropdown(false);
      return;
    }

    if (selectedRegions.length >= 3) {
      Alert.alert('알림 ⚠️', '주 활동 지역은 최대 3개까지만 선택 가능합니다.');
      return;
    }

    setSelectedRegions(prev => [...prev, standardized]);
    if (!allSelectableRegions.includes(standardized)) {
      setAllSelectableRegions(prev => [...prev, standardized]);
    }
    setCustomRegionText('');
    setShowRegionDropdown(false);
  };

  const handleToggleRegion = (region: string) => {
    const std = normalizeRegionName(region);
    if (selectedRegions.includes(std)) {
      if (selectedRegions.length === 1) return Alert.alert('알림 ⚠️', '최소 1개의 주 활동 지역을 선택해 주세요.');
      setSelectedRegions(prev => prev.filter(r => r !== std));
    } else {
      if (selectedRegions.length >= 3) return Alert.alert('알림 ⚠️', '주 활동 지역은 최대 3개까지만 선택 가능합니다.');
      setSelectedRegions(prev => [...prev, std]);
    }
  };

  const handleNameChange = (text: string) => {
    const koreanOnly = text.replace(/[^가-힣]/g, '');
    setFullName(koreanOnly);
  };

  const handleSaveProfile = async () => {
    const baseKoreanName = fullName.replace(/[^가-힣]/g, '').trim();

    if (!baseKoreanName || baseKoreanName.length < 2 || baseKoreanName.length > 8) {
      return Alert.alert('입력 확인 ⚠️', '선생님의 성함을 순수 한글 2~8자로 정확히 입력해 주세요.\n(영문, 숫자, 특수문자 불가)');
    }
    if (selectedRegions.length === 0) return Alert.alert('입력 확인 ⚠️', '주 활동 지역을 최소 1개 선택해 주세요.');

    let finalInvitedBy = null;
    if (isInitialSetup && !hasInviter) {
      const cleanCode = inviteCodeInput.trim().toUpperCase();
      if (!cleanCode) return Alert.alert('🔒 가입 승인 코드 필요', 'T-Volley는 초대 기반 네트워크입니다. 초대 코드를 입력해 주세요.');

      setActionSubmitting(true);
      const { data: inviterData } = await supabase.from('profiles').select('id').eq('invite_code', cleanCode).maybeSingle();
      if (!inviterData) { setActionSubmitting(false); return Alert.alert('코드 오류', '유효하지 않은 초대 코드입니다.'); }
      if (inviterData.id === userId) { setActionSubmitting(false); return Alert.alert('코드 오류', '본인의 초대 코드는 불가합니다.'); }
      finalInvitedBy = inviterData.id;
    }

    const posTitle = selectedPos === '직접 입력' ? customPosText.trim() : selectedPos;
    if (selectedPos === '직접 입력' && !posTitle) { setActionSubmitting(false); return Alert.alert('입력 확인', '선호 포지션을 입력해 주세요.'); }

    setActionSubmitting(true);
    try {
      let finalName = baseKoreanName;

      const { data: existingProfiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .neq('id', userId);

      if (existingProfiles && existingProfiles.length > 0) {
        const duplicateMatches = existingProfiles.filter(p => {
          if (!p.full_name) return false;
          if (p.full_name === baseKoreanName) return true;
          const regex = new RegExp(`^${baseKoreanName}\\d+$`);
          return regex.test(p.full_name);
        });

        if (duplicateMatches.length > 0) {
          let maxNum = 1;
          duplicateMatches.forEach(p => {
            if (p.full_name === baseKoreanName) {
              if (maxNum < 1) maxNum = 1;
            } else {
              const numPart = parseInt(p.full_name.replace(baseKoreanName, ''), 10);
              if (!isNaN(numPart) && numPart > maxNum) {
                maxNum = numPart;
              }
            }
          });

          const nextNum = maxNum + 1;
          finalName = `${baseKoreanName}${nextNum}`;

          Alert.alert(
            '동명이인 안내 💡',
            `'${baseKoreanName}' 성함을 사용하는 선생님이 이미 계셔서, 가입 순서에 따라 '${finalName}' 성함으로 등록됩니다.`
          );
        }
      }

      const updateData: any = {
        id: userId,
        full_name: finalName,
        school_name: schoolName.trim(), 
        gender,
        avatar_icon: avatarIcon,
        avatar_url: avatarUrl.trim() || null,
        region: selectedRegions.join(', '),
        position: `${posTitle} / ${selectedHand}`,
        updated_at: new Date().toISOString(),
      };
      if (finalInvitedBy) updateData.invited_by = finalInvitedBy;

      const { error } = await supabase.from('profiles').upsert(updateData);
      if (error) throw error;

      if (isInitialSetup) {
        Alert.alert('🎉 가입 승인 완료!', `'${finalName}' 선생님, 티볼리에 오신 것을 환영합니다.`, [{ text: '시작하기', onPress: () => router.replace('/home') }]);
      } else {
        Alert.alert('저장 완료 ✨', `개인 프로필 정보가 '${finalName}'(으)로 업데이트되었습니다.`);
        router.back();
      }
    } catch (err: any) { Alert.alert('저장 오류', err.message); } 
    finally { setActionSubmitting(false); }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        
        <View style={styles.header}>
          {isInitialSetup ? (
            <TouchableOpacity style={styles.exitBtn} onPress={handleSignOutAlert} hitSlop={10}>
              <Text style={styles.exitBtnText}>🚪 돌아가기</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} hitSlop={10}>
              <Text style={styles.backText}>‹</Text>
            </TouchableOpacity>
          )}
          <Text style={styles.headerTitle}>{isInitialSetup ? '신규 프로필 설정' : '개인 프로필 세부 설정'}</Text>
          <View style={{ width: 60 }} />
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {loading ? (
            <ActivityIndicator color={Colors.primary} size="large" style={{ marginTop: 40 }} />
          ) : (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>👤 개인 정보 및 코트 스타일 설정</Text>

              {isInitialSetup && !hasInviter && (
                <View style={styles.inviteBox}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <Text style={styles.inviteBoxTitle}>🔒 가입용 초대 코드 입력</Text>
                    <View style={styles.requiredBadge}><Text style={styles.requiredBadgeText}>필수</Text></View>
                  </View>
                  <Text style={styles.inviteBoxSub}>신뢰할 수 있는 교사 네트워크 유지를 위해 동료의 코드가 필요합니다.</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: '#FFFFFF', borderColor: '#3B82F6', fontWeight: '800' }]}
                    placeholder="예: TV-A1B2C3"
                    placeholderTextColor="#94A3B8"
                    value={inviteCodeInput}
                    onChangeText={setInviteCodeInput}
                    autoCapitalize="characters"
                  />
                </View>
              )}

              <Text style={styles.label}>1. 대표 캐릭터 선택 또는 내 사진 업로드</Text>
              <View style={styles.avatarPreviewRow}>
                <View style={styles.avatarPreviewCircle}>
                  {avatarUrl ? <Image source={{ uri: avatarUrl }} style={styles.avatarImage} /> : <Text style={{ fontSize: 36 }}>{avatarIcon}</Text>}
                </View>
                <View style={{ flex: 1, gap: 8 }}>
                  <TouchableOpacity style={styles.pickImageBtn} onPress={handlePickAndUploadImage} disabled={uploadingImage}>
                    {uploadingImage ? <ActivityIndicator color="#1D4ED8" size="small" /> : <Text style={styles.pickImageBtnText}>📸 앨범에서 내 사진 선택</Text>}
                  </TouchableOpacity>
                  {avatarUrl && (
                    <TouchableOpacity style={styles.removeImageBtn} onPress={() => setAvatarUrl('')}>
                      <Text style={styles.removeImageBtnText}>❌ 사진 삭제 (캐릭터 사용)</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              <View style={styles.avatarPickerRow}>
                {AVATAR_ICONS.map((ico) => {
                  const isSelected = avatarIcon === ico && !avatarUrl;
                  return (
                    <TouchableOpacity key={ico} style={[styles.avatarChip, isSelected && styles.avatarChipActive]} onPress={() => { setAvatarIcon(ico); setAvatarUrl(''); }}>
                      <Text style={{ fontSize: 24 }}>{ico}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.nameGuideBox}>
                <Text style={styles.nameGuideTitle}>💡 선생님 한글 성함 입력 안내</Text>
                <Text style={styles.nameGuideText}>
                  • 구글 계정 등으로 로그인하신 경우 <Text style={{ fontWeight: '800', color: '#1D4ED8' }}>한글 실명</Text>으로 직접 변경해 주세요.{'\n'}
                  • 영문, 숫자, 특수문자는 입력이 불가합니다.{'\n'}
                  • 동명이인 발생 시 가입 순서에 따라 <Text style={{ fontWeight: '800', color: '#1D4ED8' }}>'홍길동2'</Text>와 같이 자동 숫자가 부여됩니다.
                </Text>
              </View>

              <Text style={[styles.label, { marginTop: 10 }]}>2. 선생님 성함 (한글 전용 실명)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: '#FFFFFF', borderColor: Colors.primary }]}
                value={fullName}
                onChangeText={handleNameChange}
                placeholder="예: 우재웅 (한글만 가능)"
                maxLength={8}
              />

              <Text style={[styles.label, { marginTop: 14 }]}>3. 성별</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {(['남성', '여성'] as const).map((g) => {
                  const isSelected = gender === g;
                  return (
                    <TouchableOpacity key={g} style={[styles.chip, { flex: 1, alignItems: 'center', paddingVertical: 12 }, isSelected && styles.chipActive]} onPress={() => setGender(g)}>
                      <Text style={[styles.chipText, isSelected && styles.chipTextActive]}>{isSelected ? '✓ ' : ''}{g}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={[styles.label, { marginTop: 14 }]}>4. 근무하시는 소속 학교 (검색 또는 직접 입력)</Text>
              <View style={{ zIndex: 2000 }}>
                <TextInput
                  style={styles.input}
                  value={schoolName}
                  onChangeText={onProfileSchoolChange}
                  placeholder="예: 삼은초, 불당초"
                />
                {showSchoolDropdown && (
                  <View style={styles.dropdownContainer}>
                    <ScrollView style={{ maxHeight: 150 }} nestedScrollEnabled={true} keyboardShouldPersistTaps="handled">
                      {filteredSchools.map((sch) => (
                        <TouchableOpacity key={sch.id} style={styles.dropdownItem} onPress={() => selectProfileSchool(sch)}>
                          <Text style={styles.dropdownItemText} numberOfLines={1}>🏫 {sch.formatted}</Text>
                          <Text style={styles.dropdownItemSubText}>{sch.region}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </View>

              {/* 5. 주 활동 배구 지역 (UI 슬림화 + 선택 칩 고정 + 자동완성 검색) */}
              <Text style={[styles.label, { marginTop: 14 }]}>5. 내 주 활동 배구 지역 (최대 3개 선택)</Text>
              
              {/* 💡 선택된 지역 칩만 깔끔하게 상단 노출 (UI 슬림화) */}
              <View style={styles.selectedRegionsContainer}>
                {selectedRegions.length === 0 ? (
                  <Text style={styles.noRegionText}>선택된 활동 지역이 없습니다.</Text>
                ) : (
                  selectedRegions.map((r, idx) => (
                    <TouchableOpacity key={r} style={styles.selectedRegionChip} onPress={() => handleToggleRegion(r)}>
                      <Text style={styles.selectedRegionChipText}>
                        [{idx + 1}순위] {r}  <Text style={{ fontSize: 11, color: '#EF4444' }}>✕</Text>
                      </Text>
                    </TouchableOpacity>
                  ))
                )}
              </View>

              {/* 🔍 검색 및 자동완성 입력창 */}
              <View style={{ zIndex: 3000, marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TextInput
                    style={[styles.input, { flex: 1, backgroundColor: '#FFFFFF' }]}
                    value={customRegionText}
                    onChangeText={onRegionInputChange}
                    placeholder="지역 검색 (예: 공주, 공주시, 대전, 서울)"
                    placeholderTextColor="#94A3B8"
                  />
                  <TouchableOpacity
                    style={{ backgroundColor: Colors.primary, borderRadius: 10, paddingHorizontal: 16, justifyContent: 'center', alignItems: 'center' }}
                    onPress={() => handleAddCustomRegion(customRegionText)}
                  >
                    <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 13 }}>+ 추가</Text>
                  </TouchableOpacity>
                </View>

                {/* 📍 검색어 실시간 자동완성 드롭다운 */}
                {showRegionDropdown && (
                  <View style={styles.dropdownContainer}>
                    <ScrollView style={{ maxHeight: 160 }} nestedScrollEnabled={true} keyboardShouldPersistTaps="handled">
                      {filteredRegions.map((reg) => {
                        const std = normalizeRegionName(reg);
                        const isAlreadySelected = selectedRegions.includes(std);
                        return (
                          <TouchableOpacity 
                            key={reg} 
                            style={[styles.dropdownItem, isAlreadySelected && { backgroundColor: '#F1F5F9' }]} 
                            onPress={() => handleAddCustomRegion(reg)}
                          >
                            <Text style={styles.dropdownItemText} numberOfLines={1}>
                              📍 {std} {isAlreadySelected ? '(선택됨)' : ''}
                            </Text>
                            <Text style={styles.dropdownItemSubText}>
                              {isAlreadySelected ? '완료' : '선택하기'}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                      
                      {/* 검색 결과에 없을 때 신규 입력 지원 */}
                      {customRegionText.trim().length > 0 && !filteredRegions.includes(normalizeRegionName(customRegionText)) && (
                        <TouchableOpacity
                          style={[styles.dropdownItem, { backgroundColor: '#EFF6FF' }]}
                          onPress={() => handleAddCustomRegion(customRegionText)}
                        >
                          <Text style={[styles.dropdownItemText, { color: '#1D4ED8' }]} numberOfLines={1}>
                            ✨ '{normalizeRegionName(customRegionText)}' 지역 추가
                          </Text>
                          <Text style={[styles.dropdownItemSubText, { backgroundColor: '#2563EB', color: '#FFFFFF' }]}>신규 등록</Text>
                        </TouchableOpacity>
                      )}
                    </ScrollView>
                  </View>
                )}
              </View>

              {/* ⚡ 주요 대표 6개 퀵 추천 칩만 노출 (슬림형) */}
              <Text style={{ fontSize: 11, color: Colors.textMuted, marginBottom: 6 }}>
                💡 주요 추천 지역 (원터치 빠른 선택):
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {QUICK_TOP_REGIONS.map((r) => {
                  const isSelected = selectedRegions.includes(r);
                  return (
                    <TouchableOpacity 
                      key={r} 
                      style={[styles.quickChip, isSelected && styles.quickChipActive]} 
                      onPress={() => handleToggleRegion(r)}
                    >
                      <Text style={[styles.quickChipText, isSelected && styles.quickChipTextActive]}>
                        {isSelected ? '✓ ' : '+ '}{r}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={[styles.label, { marginTop: 16 }]}>6. 코트 내 주력 포지션</Text>
              <View style={styles.positionGrid}>
                {VOLLEYBALL_POSITIONS.map((pos) => {
                  const isSelected = selectedPos === pos;
                  return (
                    <TouchableOpacity key={pos} style={[styles.positionChip, isSelected && styles.positionChipActive]} onPress={() => setSelectedPos(pos)}>
                      <Text style={[styles.positionChipText, isSelected && styles.positionChipTextActive]}>{isSelected ? '✓ ' : ''}{pos}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {selectedPos === '직접 입력' && <TextInput style={[styles.input, { marginTop: 8 }]} placeholder="원하시는 포지션 명을 자유롭게 입력하세요" value={customPosText} onChangeText={setCustomPosText} />}

              <Text style={[styles.label, { marginTop: 16 }]}>7. 주사용 손 (스파이크/서브)</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                {DOMINANT_HANDS.map((hand) => {
                  const isSelected = selectedHand === hand;
                  return (
                    <TouchableOpacity key={hand} style={[styles.chip, { flex: 1, alignItems: 'center' }, isSelected && styles.chipActive]} onPress={() => setSelectedHand(hand)}>
                      <Text style={[styles.chipText, isSelected && styles.chipTextActive]}>{isSelected ? '✋ ' : ''}{hand}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveProfile} disabled={submitting}>
                {submitting ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveBtnText}>{isInitialSetup ? '가입 설정 완료하기' : '개인 프로필 저장'}</Text>}
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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backBtn: { width: 32, height: 32, justifyContent: 'center' },
  backText: { fontSize: 32, color: Colors.text, lineHeight: 32 },
  exitBtn: { backgroundColor: '#FEF2F2', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#FECACA' },
  exitBtnText: { fontSize: 13, fontWeight: '800', color: '#DC2626' },
  headerTitle: { fontSize: 16, fontWeight: '800', color: Colors.text },
  content: { padding: 20, paddingBottom: 60 },
  section: { backgroundColor: Colors.surface, borderRadius: 16, padding: 18, borderWidth: 1, borderColor: Colors.border },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: Colors.text, marginBottom: 16 },
  
  label: { fontSize: 13, fontWeight: '700', color: '#475569', marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 10, padding: 12, fontSize: 14, backgroundColor: '#F8FAFC', color: Colors.text },

  nameGuideBox: { backgroundColor: '#EFF6FF', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#BFDBFE', marginTop: 12, marginBottom: 4 },
  nameGuideTitle: { fontSize: 13, fontWeight: '800', color: '#1E40AF', marginBottom: 4 },
  nameGuideText: { fontSize: 12, color: '#1E3A8A', lineHeight: 18, fontWeight: '500' },

  inviteBox: { backgroundColor: '#EFF6FF', padding: 16, borderRadius: 14, borderWidth: 1.5, borderColor: '#3B82F6', marginBottom: 20 },
  inviteBoxTitle: { fontSize: 15, fontWeight: '900', color: '#1E40AF' },
  requiredBadge: { backgroundColor: '#EF4444', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  requiredBadgeText: { fontSize: 10, fontWeight: '800', color: '#FFFFFF' },
  inviteBoxSub: { fontSize: 12, color: '#1E40AF', marginBottom: 10, fontWeight: '600', lineHeight: 18 },

  // 📍 선택된 지역 전용 상단 콤팩트 컨테이너 (UI 슬림화)
  selectedRegionsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10, backgroundColor: '#F8FAFC', padding: 10, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0' },
  selectedRegionChip: { backgroundColor: '#EFF6FF', borderColor: '#3B82F6', borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  selectedRegionChipText: { fontSize: 13, fontWeight: '800', color: '#1D4ED8' },
  noRegionText: { fontSize: 12, color: '#94A3B8', fontStyle: 'italic' },

  // ⚡ 퀵 선택 슬림 칩
  quickChip: { backgroundColor: '#F1F5F9', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, borderWidth: 1, borderColor: '#CBD5E1' },
  quickChipActive: { backgroundColor: '#2563EB', borderColor: '#1D4ED8' },
  quickChipText: { fontSize: 12, fontWeight: '700', color: '#475569' },
  quickChipTextActive: { color: '#FFFFFF', fontWeight: '800' },

  dropdownContainer: { 
    position: 'absolute', 
    top: '100%', 
    left: 0, 
    right: 0, 
    backgroundColor: '#FFFFFF', 
    borderWidth: 1.5, 
    borderColor: '#3B82F6', 
    borderRadius: 12, 
    marginTop: 4, 
    elevation: 8, 
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 4 }, 
    shadowOpacity: 0.15, 
    shadowRadius: 8, 
    zIndex: 9999 
  },
  dropdownItem: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingVertical: 12, 
    paddingHorizontal: 14, 
    borderBottomWidth: 1, 
    borderBottomColor: '#F1F5F9' 
  },
  dropdownItemText: { 
    flex: 1, 
    fontSize: 14, 
    fontWeight: '800', 
    color: '#0F172A', 
    marginRight: 8 
  },
  dropdownItemSubText: { 
    fontSize: 11, 
    fontWeight: '700', 
    color: '#3B82F6', 
    backgroundColor: '#EFF6FF', 
    paddingHorizontal: 8, 
    paddingVertical: 3, 
    borderRadius: 6 
  },

  avatarPreviewRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 10, backgroundColor: '#F8FAFC', padding: 12, borderRadius: 14, borderWidth: 1, borderColor: '#E2E8F0' },
  avatarPreviewCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#BFDBFE', overflow: 'hidden' },
  avatarImage: { width: 64, height: 64, borderRadius: 32 },
  pickImageBtn: { backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, alignItems: 'center' },
  pickImageBtnText: { color: '#1D4ED8', fontWeight: '800', fontSize: 13 },
  removeImageBtn: { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', borderRadius: 10, paddingVertical: 6, paddingHorizontal: 12, alignItems: 'center' },
  removeImageBtnText: { color: '#DC2626', fontWeight: '700', fontSize: 11 },

  avatarPickerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 6 },
  avatarChip: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#CBD5E1' },
  avatarChipActive: { backgroundColor: '#EFF6FF', borderColor: '#3B82F6', borderWidth: 2 },

  chip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F1F5F9' },
  chipActive: { backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#3B82F6' },
  chipText: { fontSize: 13, fontWeight: '600', color: '#64748B' },
  chipTextActive: { color: '#1D4ED8', fontWeight: '800' },

  positionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  positionChip: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12 },
  positionChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  positionChipText: { fontSize: 13, fontWeight: '600', color: '#475569' },
  positionChipTextActive: { color: '#FFFFFF', fontWeight: '800' },

  saveBtn: { backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 24, elevation: 2 },
  saveBtnText: { color: '#FFFFFF', fontWeight: '900', fontSize: 15 },
});