import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
  Modal,
  TextInput,
  Alert,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Colors } from '../constants/Colors';
import StickyAdBanner from '../components/StickyAdBanner'; // 💡 스티커 광고 배너 Import

interface PollOption {
  id: string;
  poll_id: string;
  option_text: string;
  voteCount?: number;
  isMyVote?: boolean;
}

interface PollData {
  id: string;
  scope: 'official' | 'public' | 'team';
  team_id?: string;
  title: string;
  description?: string;
  poll_type: 'text' | 'calendar' | 'attendance';
  allow_anonymous: boolean;
  allow_multiple: boolean;
  allow_user_options: boolean;
  status: 'active' | 'closed';
  created_by: string;
  created_at: string;
  creator_name?: string;
  team_name?: string;
  options: PollOption[];
  totalVotes: number;
  hasVoted: boolean;
}

export default function PollsScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const currentUserId = session?.user?.id;
  const currentUserEmail = session?.user?.email;

  const isAdmin = currentUserEmail === 'wpro902@gmail.com';

  const [polls, setPolls] = useState<PollData[]>([]);
  const [myTeams, setMyTeams] = useState<{ id: string; name: string }[]>([]);
  const [userEligibility, setUserEligibility] = useState({ temp: 36.5, matches: 0 });

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const [activeTab, setActiveTab] = useState<'official' | 'public' | 'team'>('official');

  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newScope, setNewScope] = useState<'public' | 'team'>('team');
  const [newTeamId, setNewTeamId] = useState('');
  const [newType, setNewType] = useState<'text' | 'calendar' | 'attendance'>('text');
  const [newOptions, setNewOptions] = useState<string[]>(['', '']);
  const [allowAnon, setAllowAnon] = useState(false);
  const [allowMulti, setAllowMulti] = useState(false);
  const [allowUserOpts, setAllowUserOpts] = useState(false);

  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedPoll, setSelectedPoll] = useState<PollData | null>(null);
  const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>([]);
  const [customOptionText, setCustomOptionText] = useState('');

  useFocusEffect(
    useCallback(() => {
      fetchInitialData();
    }, [currentUserId, activeTab])
  );

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      if (currentUserId) {
        const { data: tmData } = await supabase
          .from('team_members')
          .select('team_id, teams(name)')
          .eq('user_id', currentUserId)
          .eq('is_active', true);

        const teams = (tmData || []).map((tm: any) => {
          const tName = Array.isArray(tm.teams) ? tm.teams[0]?.name : tm.teams?.name;
          return { id: tm.team_id, name: tName || '소속팀' };
        });
        setMyTeams(teams);
        if (teams.length > 0 && !newTeamId) setNewTeamId(teams[0].id);

        const { data: pData } = await supabase.from('profiles').select('manner_temp').eq('id', currentUserId).maybeSingle();
        const { data: mData } = await supabase.from('matches').select('id').or(`host_user_id.eq.${currentUserId},host_roster.like.%${currentUserId}%,away_roster.like.%${currentUserId}%`).eq('status', 'completed');
        
        setUserEligibility({
          temp: pData?.manner_temp || 36.5,
          matches: mData?.length || 0,
        });
      }
      await fetchPolls();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchPolls = async () => {
    try {
      let query = supabase.from('polls').select(`
        *,
        profiles(full_name),
        teams(name),
        poll_options(*, poll_votes(user_id))
      `).order('created_at', { ascending: false });

      if (activeTab === 'official') query = query.eq('scope', 'official');
      else if (activeTab === 'public') query = query.eq('scope', 'public');
      else {
        const teamIds = myTeams.map(t => t.id);
        if (teamIds.length > 0) {
          query = query.eq('scope', 'team').in('team_id', teamIds);
        } else {
          setPolls([]);
          return;
        }
      }

      const { data, error } = await query;
      if (error) throw error;

      const formattedPolls: PollData[] = (data || []).map((p: any) => {
        const creatorName = Array.isArray(p.profiles) ? p.profiles[0]?.full_name : p.profiles?.full_name;
        const teamName = Array.isArray(p.teams) ? p.teams[0]?.name : p.teams?.name;

        let totalVotes = 0;
        let hasVoted = false;

        const options: PollOption[] = (p.poll_options || []).map((opt: any) => {
          const votes = opt.poll_votes || [];
          totalVotes += votes.length;
          const isMyVote = votes.some((v: any) => v.user_id === currentUserId);
          if (isMyVote) hasVoted = true;

          return {
            id: opt.id,
            poll_id: opt.poll_id,
            option_text: opt.option_text,
            voteCount: votes.length,
            isMyVote,
          };
        });

        options.sort((a, b) => (b.voteCount || 0) - (a.voteCount || 0));

        return {
          id: p.id,
          scope: p.scope,
          team_id: p.team_id,
          title: p.title,
          description: p.description,
          poll_type: p.poll_type,
          allow_anonymous: p.allow_anonymous,
          allow_multiple: p.allow_multiple,
          allow_user_options: p.allow_user_options,
          status: p.status,
          created_by: p.created_by,
          created_at: p.created_at,
          creator_name: creatorName || '익명',
          team_name: teamName,
          options,
          totalVotes,
          hasVoted,
        };
      });

      setPolls(formattedPolls);
    } catch (err) {
      console.error(err);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchInitialData();
  };

  const checkPublicEligibility = () => {
    if (isAdmin) return true;
    if (userEligibility.temp < 37.0 || userEligibility.matches < 1) {
      Alert.alert(
        '작성 권한 제한 🛑',
        `클린한 커뮤니티 유지를 위해 [공개 투표]는 다음 조건을 만족한 유저만 작성할 수 있습니다.\n\n• 매너 온도 37.0°C 이상 (현재 ${userEligibility.temp.toFixed(1)}°C)\n• 공식 경기 1회 이상 출전 (현재 ${userEligibility.matches}회)\n\n※ 팀 내 투표는 제한 없이 작성 가능합니다.`
      );
      return false;
    }
    return true;
  };

  const handleCreatePoll = async () => {
    if (!newTitle.trim()) return Alert.alert('알림', '투표 제목을 입력해 주세요.');
    if (newScope === 'public' && !checkPublicEligibility()) return;

    let finalOptions = [...newOptions];
    if (newType === 'attendance') {
      finalOptions = ['참석 🙆‍♂️', '불참 🙅‍♂️', '미정 🤔'];
    } else {
      finalOptions = finalOptions.filter(o => o.trim() !== '');
      if (finalOptions.length < 2) return Alert.alert('알림', '최소 2개의 투표 항목을 입력해 주세요.');
    }

    setActionLoading(true);
    try {
      const { data: pollData, error: pollErr } = await supabase.from('polls').insert({
        scope: newScope,
        team_id: newScope === 'team' ? newTeamId : null,
        title: newTitle.trim(),
        description: newDesc.trim() || null,
        poll_type: newType,
        allow_anonymous: allowAnon,
        allow_multiple: allowMulti,
        allow_user_options: allowUserOpts,
        created_by: currentUserId,
      }).select().single();

      if (pollErr) throw pollErr;

      const optionsPayload = finalOptions.map(opt => ({
        poll_id: pollData.id,
        option_text: opt.trim(),
        created_by: currentUserId,
      }));

      await supabase.from('poll_options').insert(optionsPayload);

      Alert.alert('투표 등록 완료! 🎉', '새로운 투표가 생성되었습니다.');
      setCreateModalVisible(false);
      
      setNewTitle(''); setNewDesc(''); setNewOptions(['', '']); 
      setAllowAnon(false); setAllowMulti(false); setAllowUserOpts(false);
      fetchInitialData();
    } catch (err: any) {
      Alert.alert('오류', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const openPollDetail = (poll: PollData) => {
    setSelectedPoll(poll);
    const myVotedIds = poll.options.filter(o => o.isMyVote).map(o => o.id);
    setSelectedOptionIds(myVotedIds);
    setCustomOptionText('');
    setDetailModalVisible(true);
  };

  const handleToggleVote = (optId: string) => {
    if (!selectedPoll) return;
    if (selectedPoll.allow_multiple) {
      setSelectedOptionIds(prev => prev.includes(optId) ? prev.filter(id => id !== optId) : [...prev, optId]);
    } else {
      setSelectedOptionIds([optId]);
    }
  };

  const handleSubmitVote = async () => {
    if (!selectedPoll || !currentUserId) return;
    if (selectedOptionIds.length === 0) return Alert.alert('알림', '항목을 선택해 주세요.');

    setActionLoading(true);
    try {
      await supabase.from('poll_votes').delete().eq('poll_id', selectedPoll.id).eq('user_id', currentUserId);

      const votePayload = selectedOptionIds.map(optId => ({
        poll_id: selectedPoll.id,
        option_id: optId,
        user_id: currentUserId,
      }));

      await supabase.from('poll_votes').insert(votePayload);
      Alert.alert('투표 완료 ✅', '소중한 한 표가 반영되었습니다.');
      setDetailModalVisible(false);
      fetchInitialData();
    } catch (err: any) {
      Alert.alert('오류', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddCustomOption = async () => {
    if (!selectedPoll || !currentUserId || !customOptionText.trim()) return;
    setActionLoading(true);
    try {
      const { data, error } = await supabase.from('poll_options').insert({
        poll_id: selectedPoll.id,
        option_text: customOptionText.trim(),
        created_by: currentUserId,
      }).select().single();
      
      if (error) throw error;
      
      Alert.alert('항목 추가됨', '새로운 투표 항목이 추가되었습니다.');
      setCustomOptionText('');
      
      const newOpt: PollOption = { id: data.id, poll_id: data.poll_id, option_text: data.option_text, voteCount: 0, isMyVote: false };
      setSelectedPoll({ ...selectedPoll, options: [...selectedPoll.options, newOpt] });
      
    } catch (err: any) {
      Alert.alert('오류', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleReportPoll = () => {
    Alert.alert('투표 신고', '부적절한 내용인가요? 개발자에게 신고 내역이 접수됩니다.', [
      { text: '취소', style: 'cancel' },
      {
        text: '신고 접수',
        style: 'destructive',
        onPress: async () => {
          if (!selectedPoll || !currentUserId) return;
          await supabase.from('feedbacks').insert({
            user_id: currentUserId,
            category: '신고',
            content: `[투표 신고] ID: ${selectedPoll.id} / 제목: ${selectedPoll.title}`,
          });
          Alert.alert('신고 완료', '신고 내용이 처리될 예정입니다.');
        }
      }
    ]);
  };

  const adminPromoteToOfficial = async (pollId: string) => {
    Alert.alert('공식 승격', '이 투표를 공식(Official) 투표로 승격하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      { text: '승격', onPress: async () => {
          await supabase.from('polls').update({ scope: 'official' }).eq('id', pollId);
          Alert.alert('승격 완료', '공식 투표로 등록되었습니다.');
          setDetailModalVisible(false); fetchInitialData();
      }}
    ]);
  };

  const adminDeletePoll = async (pollId: string) => {
    Alert.alert('강제 삭제', '이 투표를 완전히 삭제하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: async () => {
          await supabase.from('polls').delete().eq('id', pollId);
          setDetailModalVisible(false); fetchInitialData();
      }}
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} hitSlop={10}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>커뮤니티 설문·투표</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setCreateModalVisible(true)}>
          <Text style={styles.addBtnText}>+ 투표 만들기</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.segmentedContainer}>
        <TouchableOpacity style={[styles.segmentBtn, activeTab === 'official' && styles.segmentOfficial]} onPress={() => setActiveTab('official')}>
          <Text style={[styles.segmentText, activeTab === 'official' && styles.segmentTextOfficial]}>👑 공식 투표</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.segmentBtn, activeTab === 'public' && styles.segmentPublic]} onPress={() => setActiveTab('public')}>
          <Text style={[styles.segmentText, activeTab === 'public' && styles.segmentTextPublic]}>🌐 공개 투표</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.segmentBtn, activeTab === 'team' && styles.segmentTeam]} onPress={() => setActiveTab('team')}>
          <Text style={[styles.segmentText, activeTab === 'team' && styles.segmentTextTeam]}>💬 팀내 투표</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}>
        {loading ? (
          <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} />
        ) : polls.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyEmoji}>🗳️</Text>
            <Text style={styles.emptyText}>현재 등록된 투표가 없습니다.</Text>
            <Text style={styles.emptySub}>우측 상단 버튼을 눌러 첫 투표를 올려보세요!</Text>
          </View>
        ) : (
          polls.map((poll) => {
            const isOfficial = poll.scope === 'official';
            const isTeam = poll.scope === 'team';
            return (
              <TouchableOpacity
                key={poll.id}
                style={[
                  styles.pollCard,
                  isOfficial ? styles.pollCardOfficial : isTeam ? styles.pollCardTeam : styles.pollCardPublic
                ]}
                onPress={() => openPollDetail(poll)}
                activeOpacity={0.8}
              >
                <View style={styles.pollCardHeader}>
                  <View style={[styles.pollBadge, isOfficial ? styles.badgeOfficial : isTeam ? styles.badgeTeam : styles.badgePublic]}>
                    <Text style={[styles.pollBadgeText, isOfficial ? styles.badgeTextOfficial : isTeam ? styles.badgeTextTeam : styles.badgeTextPublic]}>
                      {isOfficial ? '👑 공식' : isTeam ? `💬 ${poll.team_name}` : '🌐 공개'}
                    </Text>
                  </View>
                  <Text style={styles.pollStatusText}>{poll.status === 'active' ? '🟢 진행중' : '🔴 종료됨'}</Text>
                </View>

                <Text style={styles.pollTitle}>{poll.title}</Text>
                {poll.description ? <Text style={styles.pollDesc} numberOfLines={2}>{poll.description}</Text> : null}

                <View style={styles.pollFooter}>
                  <Text style={styles.pollCreatorText}>작성: {poll.creator_name}</Text>
                  <View style={styles.voteCountPill}>
                    <Text style={styles.voteCountText}>🗳️ {poll.totalVotes}명 참여</Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {/* 💡 [추가] 모달 바깥 스크린 최하단 배너 이식 */}
      <StickyAdBanner />

      {/* 투표 생성 모달 */}
      <Modal visible={createModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>✨ 새로운 투표 만들기</Text>
            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: '80%' }}>
              
              <Text style={styles.inputLabel}>1. 투표 공개 범위</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                <TouchableOpacity style={[styles.chipBtn, newScope === 'team' && styles.chipBtnActiveTeam]} onPress={() => setNewScope('team')}>
                  <Text style={[styles.chipText, newScope === 'team' && { color: '#FFF' }]}>💬 소속 팀 전용</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.chipBtn, newScope === 'public' && styles.chipBtnActivePublic]} onPress={() => { setNewScope('public'); checkPublicEligibility(); }}>
                  <Text style={[styles.chipText, newScope === 'public' && { color: '#FFF' }]}>🌐 전국 공개 투표</Text>
                </TouchableOpacity>
              </View>

              {newScope === 'team' && myTeams.length > 0 && (
                <>
                  <Text style={styles.inputLabel}>어느 팀에 올릴까요?</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginBottom: 12 }}>
                    {myTeams.map(t => (
                      <TouchableOpacity key={t.id} style={[styles.chipBtn, newTeamId === t.id && styles.chipBtnActiveTeam]} onPress={() => setNewTeamId(t.id)}>
                        <Text style={[styles.chipText, newTeamId === t.id && { color: '#FFF' }]}>{t.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </>
              )}

              <Text style={styles.inputLabel}>2. 투표 주제 및 설명</Text>
              <TextInput style={[styles.textInput, { marginBottom: 8 }]} placeholder="투표 제목 (예: 이번 주 교류전 참석?)" value={newTitle} onChangeText={setNewTitle} />
              <TextInput style={[styles.textInput, { height: 60, marginBottom: 12 }]} placeholder="상세 설명 (선택 사항)" value={newDesc} onChangeText={setNewDesc} multiline />

              <Text style={styles.inputLabel}>3. 투표 유형</Text>
              <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
                <TouchableOpacity style={[styles.typeBtn, newType === 'text' && styles.typeBtnActive]} onPress={() => setNewType('text')}>
                  <Text style={[styles.typeBtnText, newType === 'text' && { color: '#FFF' }]}>📝 일반/텍스트</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.typeBtn, newType === 'calendar' && styles.typeBtnActive]} onPress={() => setNewType('calendar')}>
                  <Text style={[styles.typeBtnText, newType === 'calendar' && { color: '#FFF' }]}>📅 날짜 선택</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.typeBtn, newType === 'attendance' && styles.typeBtnActive]} onPress={() => setNewType('attendance')}>
                  <Text style={[styles.typeBtnText, newType === 'attendance' && { color: '#FFF' }]}>🙋‍♂️ 참석 여부</Text>
                </TouchableOpacity>
              </View>

              {newType !== 'attendance' && (
                <>
                  <Text style={styles.inputLabel}>항목 입력</Text>
                  {newOptions.map((opt, idx) => (
                    <View key={idx} style={{ flexDirection: 'row', gap: 6, marginBottom: 6 }}>
                      <TextInput 
                        style={[styles.textInput, { flex: 1, marginBottom: 0 }]} 
                        placeholder={newType === 'calendar' ? '예: 8/20 (금) 저녁 7시' : `항목 ${idx + 1}`}
                        value={opt} 
                        onChangeText={(txt) => {
                          const arr = [...newOptions]; arr[idx] = txt; setNewOptions(arr);
                        }} 
                      />
                      {newOptions.length > 2 && (
                        <TouchableOpacity style={styles.removeOptBtn} onPress={() => setNewOptions(prev => prev.filter((_, i) => i !== idx))}>
                          <Text style={{ color: '#EF4444', fontWeight: '800' }}>✕</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}
                  <TouchableOpacity style={styles.addOptBtn} onPress={() => setNewOptions(prev => [...prev, ''])}>
                    <Text style={styles.addOptBtnText}>+ 항목 추가</Text>
                  </TouchableOpacity>
                </>
              )}

              <Text style={[styles.inputLabel, { marginTop: 12 }]}>4. 부가 옵션</Text>
              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>👤 익명 투표 (누가 했는지 비공개)</Text>
                <Switch value={allowAnon} onValueChange={setAllowAnon} trackColor={{ true: Colors.primary }} />
              </View>
              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>☑️ 복수 선택 허용</Text>
                <Switch value={allowMulti} onValueChange={setAllowMulti} trackColor={{ true: Colors.primary }} />
              </View>
              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>💬 다른 유저가 새로운 항목 추가 허용</Text>
                <Switch value={allowUserOpts} onValueChange={setAllowUserOpts} trackColor={{ true: Colors.primary }} />
              </View>

              <Text style={{ fontSize: 10.5, color: '#94A3B8', marginTop: 8, textAlign: 'center' }}>
                ※ 타인 비방 및 부적절한 게시글 작성 시 서비스 이용이 제한될 수 있습니다.
              </Text>

            </ScrollView>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setCreateModalVisible(false)}>
                <Text style={styles.cancelBtnText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.submitBtn} onPress={handleCreatePoll} disabled={actionLoading}>
                {actionLoading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.submitBtnText}>등록하기</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 투표 상세 모달 */}
      <Modal visible={detailModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlayBottom}>
          <View style={styles.modalContentBottom}>
            {selectedPoll && (
              <>
                <View style={styles.detailHeader}>
                  <View style={[styles.pollBadge, selectedPoll.scope === 'official' ? styles.badgeOfficial : selectedPoll.scope === 'team' ? styles.badgeTeam : styles.badgePublic]}>
                    <Text style={[styles.pollBadgeText, selectedPoll.scope === 'official' ? styles.badgeTextOfficial : selectedPoll.scope === 'team' ? styles.badgeTextTeam : styles.badgeTextPublic]}>
                      {selectedPoll.scope === 'official' ? '👑 공식 투표' : selectedPoll.scope === 'team' ? `💬 ${selectedPoll.team_name}` : '🌐 공개 투표'}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Text style={styles.detailVoteCount}>총 {selectedPoll.totalVotes}표</Text>
                    <TouchableOpacity onPress={handleReportPoll} hitSlop={8}>
                      <Text style={{ fontSize: 11, color: '#EF4444', fontWeight: '800' }}>🚨 신고</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <Text style={styles.detailTitle}>{selectedPoll.title}</Text>
                {selectedPoll.description ? <Text style={styles.detailDesc}>{selectedPoll.description}</Text> : null}

                <View style={styles.detailOptionsWrap}>
                  <Text style={styles.detailOptionHint}>
                    {selectedPoll.allow_multiple ? '※ 여러 개 선택 가능합니다.' : '※ 1개만 선택 가능합니다.'}
                  </Text>
                  
                  <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
                    {selectedPoll.options.map(opt => {
                      const isSelected = selectedOptionIds.includes(opt.id);
                      const percent = selectedPoll.totalVotes > 0 ? Math.round((opt.voteCount! / selectedPoll.totalVotes) * 100) : 0;
                      
                      return (
                        <TouchableOpacity
                          key={opt.id}
                          style={[styles.voteOptionRow, isSelected && styles.voteOptionActive]}
                          onPress={() => handleToggleVote(opt.id)}
                          activeOpacity={0.8}
                        >
                          <View style={[styles.voteGaugeBg, { width: `${percent}%` }]} />
                          
                          <View style={styles.voteOptionInner}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                              <View style={[styles.radioCircle, isSelected && styles.radioCircleActive]}>
                                {isSelected && <View style={styles.radioInner} />}
                              </View>
                              <Text style={[styles.voteOptionText, isSelected && styles.voteOptionTextActive]}>{opt.option_text}</Text>
                            </View>
                            <Text style={styles.voteOptionCount}>{opt.voteCount}표 ({percent}%)</Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}

                    {selectedPoll.allow_user_options && (
                      <View style={styles.addCustomOptBox}>
                        <TextInput
                          style={[styles.textInput, { flex: 1, marginBottom: 0, height: 40 }]}
                          placeholder="새로운 의견 직접 추가하기"
                          value={customOptionText}
                          onChangeText={setCustomOptionText}
                        />
                        <TouchableOpacity style={styles.addCustomOptBtn} onPress={handleAddCustomOption} disabled={actionLoading}>
                          <Text style={styles.addCustomOptBtnText}>추가</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </ScrollView>
                </View>

                {isAdmin && (
                  <View style={styles.adminToolBox}>
                    <Text style={{ fontSize: 11, fontWeight: '800', color: '#DC2626', marginBottom: 4 }}>👑 관리자 전용 툴</Text>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {selectedPoll.scope !== 'official' && (
                        <TouchableOpacity style={[styles.adminBtn, { backgroundColor: '#F59E0B' }]} onPress={() => adminPromoteToOfficial(selectedPoll.id)}>
                          <Text style={styles.adminBtnText}>공식 승격</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity style={[styles.adminBtn, { backgroundColor: '#EF4444' }]} onPress={() => adminDeletePoll(selectedPoll.id)}>
                        <Text style={styles.adminBtnText}>강제 삭제</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                <View style={styles.modalBtnRow}>
                  <TouchableOpacity style={styles.cancelBtn} onPress={() => setDetailModalVisible(false)}>
                    <Text style={styles.cancelBtnText}>닫기</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.submitBtn} onPress={handleSubmitVote} disabled={actionLoading}>
                    {actionLoading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.submitBtnText}>투표하기</Text>}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  backBtn: { width: 30, height: 30, justifyContent: 'center', alignItems: 'center' },
  backText: { fontSize: 28, color: '#0F172A', lineHeight: 28 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#0F172A' },
  addBtn: { backgroundColor: Colors.primary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  addBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 12.5 },

  segmentedContainer: { flexDirection: 'row', backgroundColor: '#FFFFFF', padding: 8, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  segmentBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10, borderWidth: 1, borderColor: 'transparent' },
  segmentOfficial: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
  segmentPublic: { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' },
  segmentTeam: { backgroundColor: '#FFF7ED', borderColor: '#FFEDD5' },
  segmentText: { fontSize: 13, fontWeight: '700', color: '#64748B' },
  segmentTextOfficial: { color: '#D97706', fontWeight: '900' },
  segmentTextPublic: { color: '#1D4ED8', fontWeight: '900' },
  segmentTextTeam: { color: '#C2410C', fontWeight: '900' },

  // 💡 여백 확보 (광고 가림 방지)
  content: { padding: 16, gap: 12, paddingBottom: 60 },
  emptyBox: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 40, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0', marginTop: 20 },
  emptyEmoji: { fontSize: 40, marginBottom: 10 },
  emptyText: { fontSize: 14, fontWeight: '800', color: '#475569' },
  emptySub: { fontSize: 12, color: '#94A3B8', marginTop: 4 },

  pollCard: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, borderWidth: 1, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4 },
  pollCardOfficial: { borderColor: '#FDE68A' },
  pollCardPublic: { borderColor: '#E2E8F0' },
  pollCardTeam: { borderColor: '#FFEDD5' },

  pollCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  pollBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  badgeOfficial: { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' },
  badgeTextOfficial: { color: '#B45309', fontSize: 10.5, fontWeight: '900' },
  badgePublic: { backgroundColor: '#F1F5F9', borderColor: '#CBD5E1' },
  badgeTextPublic: { color: '#475569', fontSize: 10.5, fontWeight: '800' },
  badgeTeam: { backgroundColor: '#FFEDD5', borderColor: '#FDBA74' },
  badgeTextTeam: { color: '#C2410C', fontSize: 10.5, fontWeight: '900' },
  pollBadgeText: { fontSize: 10.5, fontWeight: '800' },

  pollStatusText: { fontSize: 11, fontWeight: '800', color: '#10B981' },
  pollTitle: { fontSize: 16, fontWeight: '800', color: '#0F172A', marginBottom: 4 },
  pollDesc: { fontSize: 12.5, color: '#64748B', lineHeight: 18, marginBottom: 12 },
  
  pollFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  pollCreatorText: { fontSize: 11, color: '#94A3B8', fontWeight: '600' },
  voteCountPill: { backgroundColor: '#F8FAFC', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0' },
  voteCountText: { fontSize: 11, fontWeight: '800', color: '#334155' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  modalContent: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 20, width: '100%', elevation: 5 },
  modalOverlayBottom: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContentBottom: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 40, maxHeight: '85%' },
  
  modalTitle: { fontSize: 17, fontWeight: '900', color: '#0F172A', marginBottom: 16 },
  inputLabel: { fontSize: 13, fontWeight: '800', color: '#334155', marginBottom: 8 },
  textInput: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 10, padding: 12, fontSize: 13, color: '#0F172A' },
  
  chipBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0' },
  chipBtnActiveTeam: { backgroundColor: '#F97316', borderColor: '#EA580C' },
  chipBtnActivePublic: { backgroundColor: '#3B82F6', borderColor: '#2563EB' },
  chipText: { fontSize: 12, fontWeight: '700', color: '#475569' },

  typeBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0' },
  typeBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  typeBtnText: { fontSize: 12, fontWeight: '800', color: '#475569' },

  removeOptBtn: { backgroundColor: '#FEF2F2', justifyContent: 'center', alignItems: 'center', width: 44, borderRadius: 10, borderWidth: 1, borderColor: '#FECACA' },
  addOptBtn: { backgroundColor: '#EFF6FF', paddingVertical: 10, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: '#BFDBFE', borderStyle: 'dashed' },
  addOptBtnText: { color: '#2563EB', fontWeight: '800', fontSize: 12 },

  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F8FAFC', padding: 12, borderRadius: 10, marginBottom: 8, borderWidth: 1, borderColor: '#E2E8F0' },
  toggleLabel: { fontSize: 12.5, fontWeight: '700', color: '#334155' },

  modalBtnRow: { flexDirection: 'row', gap: 8, marginTop: 16 },
  cancelBtn: { flex: 1, backgroundColor: '#F1F5F9', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  cancelBtnText: { color: '#64748B', fontWeight: '800', fontSize: 14 },
  submitBtn: { flex: 2, backgroundColor: Colors.primary, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  submitBtnText: { color: '#FFFFFF', fontWeight: '900', fontSize: 14 },

  detailHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  detailVoteCount: { fontSize: 13, fontWeight: '800', color: Colors.primary },
  detailTitle: { fontSize: 18, fontWeight: '900', color: '#0F172A', marginBottom: 6 },
  detailDesc: { fontSize: 13, color: '#475569', lineHeight: 20 },
  
  detailOptionsWrap: { marginTop: 16, borderTopWidth: 1, borderTopColor: '#E2E8F0', paddingTop: 16 },
  detailOptionHint: { fontSize: 11, color: '#94A3B8', fontWeight: '700', marginBottom: 10 },

  voteOptionRow: { position: 'relative', overflow: 'hidden', backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, marginBottom: 8 },
  voteOptionActive: { borderColor: Colors.primary, borderWidth: 1.5 },
  voteGaugeBg: { position: 'absolute', top: 0, left: 0, bottom: 0, backgroundColor: '#EFF6FF', opacity: 0.6 },
  voteOptionInner: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14 },
  radioCircle: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#CBD5E1', alignItems: 'center', justifyContent: 'center' },
  radioCircleActive: { borderColor: Colors.primary },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.primary },
  voteOptionText: { fontSize: 14, fontWeight: '700', color: '#334155' },
  voteOptionTextActive: { color: '#0F172A', fontWeight: '900' },
  voteOptionCount: { fontSize: 13, fontWeight: '800', color: '#64748B' },

  addCustomOptBox: { flexDirection: 'row', gap: 6, marginTop: 4, paddingBottom: 10 },
  addCustomOptBtn: { backgroundColor: '#10B981', justifyContent: 'center', paddingHorizontal: 16, borderRadius: 10 },
  addCustomOptBtnText: { color: '#FFF', fontWeight: '800', fontSize: 13 },

  adminToolBox: { backgroundColor: '#FEF2F2', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#FECACA', marginTop: 16 },
  adminBtn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, alignItems: 'center' },
  adminBtnText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
});