import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../constants/Colors';

interface DynamicSetScore {
  hostScore: number;
  awayScore: number;
}

interface MemberInfo {
  user_id: string;
  full_name: string;
}

// 🔀 3-State 정의: 'court' (🔵 코트 스타팅) | 'bench' (⚪ 오늘의 벤치) | 'absent' (🪑 미참석)
export type PlayerStatus = 'court' | 'bench' | 'absent';
export type SetRosterStateMap = { [setIndex: number]: { [userId: string]: PlayerStatus } };

interface MatchResultModalProps {
  visible: boolean;
  onClose: () => void;
  match: any;
  isRosterOnlyMode?: boolean;
  hostYoutube: string;
  onChangeHostYoutube: (text: string) => void;
  awayYoutube: string;
  onChangeAwayYoutube: (text: string) => void;
  dynamicScores: DynamicSetScore[];
  onAddSet: () => void;
  onRemoveSet: (index: number) => void;
  onUpdateScore: (index: number, isHost: boolean, delta: number) => void;
  hostMembers: MemberInfo[];
  awayMembers: MemberInfo[];
  hostSetRosters: any;
  awaySetRosters: any;
  onToggleSetRoster?: any;
  selectedWinner: string;
  onSelectWinner: (winner: string) => void;
  onSaveResult: () => void;
  onSaveRosterOnly: () => void;
  actionLoading: boolean;
}

const getChosung = (str: string) => {
  const chosungList = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
  let result = '';
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i) - 44032;
    if (code >= 0 && code <= 11172) {
      result += chosungList[Math.floor(code / 588)];
    } else {
      result += str.charAt(i);
    }
  }
  return result;
};

export default function MatchResultModal({
  visible,
  onClose,
  match,
  isRosterOnlyMode = false,
  hostYoutube,
  onChangeHostYoutube,
  awayYoutube,
  onChangeAwayYoutube,
  dynamicScores,
  onAddSet,
  onRemoveSet,
  onUpdateScore,
  hostMembers,
  awayMembers,
  selectedWinner,
  onSelectWinner,
  onSaveResult,
  onSaveRosterOnly,
  actionLoading,
}: MatchResultModalProps) {
  const [activeSetTab, setActiveSetTab] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState('');

  const [hostStatusMap, setHostStatusMap] = useState<SetRosterStateMap>({});
  const [awayStatusMap, setAwayStatusMap] = useState<SetRosterStateMap>({});

  useEffect(() => {
    if (activeSetTab >= dynamicScores.length) {
      setActiveSetTab(Math.max(0, dynamicScores.length - 1));
    }
  }, [dynamicScores.length]);

  // 오프라인 안심 백업
  useEffect(() => {
    if (match?.id && dynamicScores.length > 0) {
      try {
        AsyncStorage.setItem(`temp_scores_${match.id}`, JSON.stringify(dynamicScores)).catch(() => {});
      } catch (e) {}
    }
  }, [dynamicScores, match?.id]);

  // 🔀 3-State 순환 터치: 'absent' -> 'court' -> 'bench' -> 'absent'
  const handleCycleStatus = (userId: string, isHost: boolean) => {
    const targetMap = isHost ? { ...hostStatusMap } : { ...awayStatusMap };
    const currentSetMap = targetMap[activeSetTab] || {};
    const currentStatus: PlayerStatus = currentSetMap[userId] || 'absent';

    let nextStatus: PlayerStatus = 'court';
    if (currentStatus === 'absent') nextStatus = 'court';
    else if (currentStatus === 'court') nextStatus = 'bench';
    else if (currentStatus === 'bench') nextStatus = 'absent';

    targetMap[activeSetTab] = {
      ...currentSetMap,
      [userId]: nextStatus,
    };

    if (activeSetTab === 0) {
      dynamicScores.forEach((_, idx) => {
        if (idx > 0) {
          if (!targetMap[idx]) targetMap[idx] = {};
          if (!targetMap[idx][userId]) {
            targetMap[idx][userId] = nextStatus;
          }
        }
      });
    }

    if (isHost) setHostStatusMap(targetMap);
    else setAwayStatusMap(targetMap);
  };

  if (!match) return null;

  // 📦 2세트 이후 자동 압축 로직
  const getCompressedMembers = (members: MemberInfo[], isHost: boolean) => {
    const statusMap = isHost ? hostStatusMap : awayStatusMap;
    const set1Map = statusMap[0] || {};

    if (activeSetTab === 0) {
      return { compressed: members, others: [] };
    }

    const set1AttendedUserIds = Object.keys(set1Map).filter(
      id => set1Map[id] === 'court' || set1Map[id] === 'bench'
    );

    const compressed = members.filter(m => set1AttendedUserIds.includes(m.user_id));
    const others = members.filter(m => !set1AttendedUserIds.includes(m.user_id));

    return { compressed, others };
  };

  const hostRosterGroup = getCompressedMembers(hostMembers, true);
  const awayRosterGroup = getCompressedMembers(awayMembers, false);

  const filterMembersBySearch = (members: MemberInfo[]) => {
    if (!searchQuery.trim()) return members;
    const query = searchQuery.trim().toLowerCase();
    const queryChosung = getChosung(query);

    return members.filter(m => {
      const name = m.full_name.toLowerCase();
      const chosung = getChosung(name);
      return name.includes(query) || chosung.includes(queryChosung);
    });
  };

  const renderRosterSection = (membersGroup: { compressed: MemberInfo[]; others: MemberInfo[] }, isHost: boolean, teamName: string) => {
    const statusMap = isHost ? hostStatusMap : awayStatusMap;
    const currentSetMap = statusMap[activeSetTab] || {};
    const filteredOthers = filterMembersBySearch(membersGroup.others);

    return (
      <View style={{ marginBottom: 12 }}>
        <Text style={styles.subInputLabel}>
          👥 [{teamName}] {activeSetTab > 0 ? '오늘 참석 멤버 (자동 압축)' : '전체 멤버'}
        </Text>

        <View style={styles.rosterContainer}>
          {membersGroup.compressed.map(m => {
            const status: PlayerStatus = currentSetMap[m.user_id] || 'absent';
            return (
              <TouchableOpacity
                key={m.user_id}
                style={[
                  styles.rosterChip,
                  status === 'court' && styles.chipCourt,
                  status === 'bench' && styles.chipBench,
                ]}
                onPress={() => handleCycleStatus(m.user_id, isHost)}
              >
                <Text
                  style={[
                    styles.rosterChipText,
                    status === 'court' && styles.chipTextCourt,
                    status === 'bench' && styles.chipTextBench,
                  ]}
                >
                  {status === 'court' ? '🔵 코트 ' : status === 'bench' ? '⚪ 벤치 ' : '🪑 '}{m.full_name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {activeSetTab > 0 && membersGroup.others.length > 0 && (
          <View style={styles.lateArrivalBox}>
            <Text style={styles.lateArrivalTitle}>🙋‍♂️ 지각생 빠른 합류 (초성 검색)</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="이름/초성 검색 (예: ㅎ, 홍길동)"
              placeholderTextColor="#94A3B8"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            <View style={styles.rosterContainer}>
              {filteredOthers.map(m => {
                const status: PlayerStatus = currentSetMap[m.user_id] || 'absent';
                return (
                  <TouchableOpacity
                    key={m.user_id}
                    style={[
                      styles.rosterChip,
                      status === 'court' && styles.chipCourt,
                      status === 'bench' && styles.chipBench,
                    ]}
                    onPress={() => handleCycleStatus(m.user_id, isHost)}
                  >
                    <Text
                      style={[
                        styles.rosterChipText,
                        status === 'court' && styles.chipTextCourt,
                        status === 'bench' && styles.chipTextBench,
                      ]}
                    >
                      {status === 'court' ? '🔵 코트 ' : status === 'bench' ? '⚪ 벤치 ' : '🪑 '}{m.full_name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>
            {isRosterOnlyMode ? '👥 세트별 출전 라인업 수정' : '🏆 경기 결과 & 세트 라인업 기록'}
          </Text>
          <Text style={styles.modalSub}>
            터치 1번(🔵 코트) ➔ 터치 2번(⚪ 벤치) ➔ 터치 3번(🪑 미참석) 순으로 전환됩니다.
          </Text>

          <ScrollView style={{ maxHeight: 440, marginVertical: 8 }} showsVerticalScrollIndicator={false}>
            {!isRosterOnlyMode && (
              <>
                <Text style={styles.inputLabel}>🎥 경기 중계/하이라이트 영상 (선택)</Text>
                <TextInput
                  style={[styles.textInput, { marginBottom: 6 }]}
                  placeholder={`[주최팀] ${match.host_team_name} 영상 URL`}
                  placeholderTextColor="#94A3B8"
                  value={hostYoutube}
                  onChangeText={onChangeHostYoutube}
                  autoCapitalize="none"
                />
                {match.away_team_name ? (
                  <TextInput
                    style={[styles.textInput, { marginBottom: 10 }]}
                    placeholder={`[상대팀] ${match.away_team_name} 영상 URL`}
                    placeholderTextColor="#94A3B8"
                    value={awayYoutube}
                    onChangeText={onChangeAwayYoutube}
                    autoCapitalize="none"
                  />
                ) : null}

                <Text style={styles.inputLabel}>📊 세트별 스코어 기록</Text>
                <View style={styles.scoreCalcBox}>
                  {dynamicScores.map((ds, idx) => (
                    <View key={idx} style={[styles.setRow, idx > 0 && { marginTop: 10 }]}>
                      <View style={{ alignItems: 'center' }}>
                        <Text style={styles.setLabel}>{idx + 1}세트</Text>
                        {dynamicScores.length > 1 && (
                          <TouchableOpacity style={{ marginTop: 2 }} onPress={() => onRemoveSet(idx)}>
                            <Text style={{ fontSize: 10, color: '#EF4444', fontWeight: '800' }}>[삭제]</Text>
                          </TouchableOpacity>
                        )}
                      </View>

                      <View style={styles.teamScoreCol}>
                        <Text style={styles.teamScoreLabel} numberOfLines={1}>{match.host_team_name}</Text>
                        <View style={styles.stepperRow}>
                          <TouchableOpacity style={styles.stepBtn} onPress={() => onUpdateScore(idx, true, -1)}>
                            <Text style={styles.stepBtnText}>-1</Text>
                          </TouchableOpacity>
                          <Text style={styles.scoreValText}>{ds.hostScore}</Text>
                          <TouchableOpacity style={styles.stepBtn} onPress={() => onUpdateScore(idx, true, 1)}>
                            <Text style={styles.stepBtnText}>+1</Text>
                          </TouchableOpacity>
                        </View>
                      </View>

                      <Text style={styles.vsColon}>:</Text>

                      <View style={styles.teamScoreCol}>
                        <Text style={styles.teamScoreLabel} numberOfLines={1}>{match.away_team_name || '상대팀'}</Text>
                        <View style={styles.stepperRow}>
                          <TouchableOpacity style={styles.stepBtn} onPress={() => onUpdateScore(idx, false, -1)}>
                            <Text style={styles.stepBtnText}>-1</Text>
                          </TouchableOpacity>
                          <Text style={styles.scoreValText}>{ds.awayScore}</Text>
                          <TouchableOpacity style={styles.stepBtn} onPress={() => onUpdateScore(idx, false, 1)}>
                            <Text style={styles.stepBtnText}>+1</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  ))}

                  <TouchableOpacity style={styles.toggleSetBtn} onPress={onAddSet}>
                    <Text style={styles.toggleSetText}>➕ 세트 추가하기</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            <Text style={styles.inputLabel}>🏐 세트별 코트 출전 라인업 ({activeSetTab + 1}세트)</Text>
            
            <View style={styles.setTabContainer}>
              {dynamicScores.map((_, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={[styles.setTab, activeSetTab === idx && styles.setTabActive]}
                  onPress={() => setActiveSetTab(idx)}
                >
                  <Text style={[styles.setTabText, activeSetTab === idx && styles.setTabTextActive]}>
                    {idx + 1}세트
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {renderRosterSection(hostRosterGroup, true, match.host_team_name)}
            {match.away_team_name ? renderRosterSection(awayRosterGroup, false, match.away_team_name) : null}

            {!isRosterOnlyMode && (
              <>
                <Text style={[styles.inputLabel, { marginTop: 10 }]}>🥇 최종 승리 팀 선택</Text>
                <View style={{ gap: 6, marginBottom: 10 }}>
                  <TouchableOpacity 
                    style={[styles.winnerSelectBtn, selectedWinner === match.host_team_name && styles.winnerSelectBtnActive]} 
                    onPress={() => onSelectWinner(match.host_team_name)}
                  >
                    <Text style={[styles.winnerSelectText, selectedWinner === match.host_team_name && styles.winnerSelectTextActive]}>
                      🥇 {match.host_team_name} 승리
                    </Text>
                  </TouchableOpacity>

                  {match.away_team_name ? (
                    <TouchableOpacity 
                      style={[styles.winnerSelectBtn, selectedWinner === match.away_team_name && styles.winnerSelectBtnActive]} 
                      onPress={() => onSelectWinner(match.away_team_name)}
                    >
                      <Text style={[styles.winnerSelectText, selectedWinner === match.away_team_name && styles.winnerSelectTextActive]}>
                        🥇 {match.away_team_name} 승리
                      </Text>
                    </TouchableOpacity>
                  ) : null}

                  <TouchableOpacity 
                    style={[styles.winnerSelectBtn, { backgroundColor: '#F1F5F9' }, selectedWinner === 'draw' && { backgroundColor: '#475569' }]} 
                    onPress={() => onSelectWinner('draw')}
                  >
                    <Text style={[styles.winnerSelectText, { color: '#475569' }, selectedWinner === 'draw' && { color: '#FFFFFF' }]}>
                      🤝 무승부
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </ScrollView>

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
            <TouchableOpacity style={[styles.closeBtn, { flex: 1 }]} onPress={onClose}>
              <Text style={styles.closeBtnText}>취소</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.submitBtn, { flex: 2, backgroundColor: isRosterOnlyMode ? '#0284C7' : Colors.primary }]} 
              onPress={isRosterOnlyMode ? onSaveRosterOnly : onSaveResult}
              disabled={actionLoading}
            >
              {actionLoading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.submitBtnText}>{isRosterOnlyMode ? '✅ 라인업 즉시 저장' : '🏆 결과 제출'}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  modalContent: { backgroundColor: Colors.surface, borderRadius: 20, padding: 16, width: '100%', elevation: 5 },
  modalTitle: { fontSize: 16, fontWeight: '800', color: Colors.text, marginBottom: 2 },
  modalSub: { fontSize: 11, color: Colors.textMuted, marginBottom: 8, lineHeight: 16 },
  inputLabel: { fontSize: 13, fontWeight: '800', color: '#1E293B', marginBottom: 6, marginTop: 8 },
  subInputLabel: { fontSize: 11, fontWeight: '800', color: '#1E40AF', marginTop: 6, marginBottom: 4 },
  textInput: { borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 8, padding: 10, fontSize: 13, backgroundColor: '#F8FAFC' },
  
  scoreCalcBox: { backgroundColor: '#F8FAFC', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 6 },
  setRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  setLabel: { fontSize: 12, fontWeight: '800', color: '#1E293B', width: 40 },
  teamScoreCol: { flex: 1, alignItems: 'center' },
  teamScoreLabel: { fontSize: 11, fontWeight: '700', color: '#475569', marginBottom: 2 },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stepBtn: { backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE', borderRadius: 6, width: 26, height: 26, justifyContent: 'center', alignItems: 'center' },
  stepBtnText: { fontSize: 11, fontWeight: '800', color: '#1D4ED8' },
  scoreValText: { fontSize: 16, fontWeight: '900', color: '#0F172A', minWidth: 22, textAlign: 'center' },
  vsColon: { fontSize: 16, fontWeight: '800', color: '#94A3B8', marginHorizontal: 2 },
  toggleSetBtn: { backgroundColor: '#FFFFFF', borderStyle: 'dashed', borderWidth: 1, borderColor: '#93C5FD', borderRadius: 6, paddingVertical: 6, alignItems: 'center', marginTop: 8 },
  toggleSetText: { fontSize: 12, fontWeight: '800', color: '#2563EB' },
  
  setTabContainer: { flexDirection: 'row', gap: 6, marginBottom: 6 },
  setTab: { flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: '#F1F5F9', alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
  setTabActive: { backgroundColor: '#2563EB', borderColor: '#1D4ED8' },
  setTabText: { fontSize: 12, fontWeight: '700', color: '#64748B' },
  setTabTextActive: { color: '#FFFFFF', fontWeight: '800' },

  rosterContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 4 },
  rosterChip: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 8, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#CBD5E1' },
  chipCourt: { backgroundColor: '#EFF6FF', borderColor: '#3B82F6' },
  chipBench: { backgroundColor: '#F1F5F9', borderColor: '#94A3B8' },
  rosterChipText: { fontSize: 11, fontWeight: '600', color: '#94A3B8' },
  chipTextCourt: { color: '#1D4ED8', fontWeight: '800' },
  chipTextBench: { color: '#475569', fontWeight: '800' },

  lateArrivalBox: { backgroundColor: '#FEFCE8', borderRadius: 8, padding: 8, borderWidth: 1, borderColor: '#FDE68A', marginTop: 6 },
  lateArrivalTitle: { fontSize: 10, fontWeight: '800', color: '#B45309', marginBottom: 4 },
  searchInput: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#FCD34D', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, fontSize: 11, marginBottom: 6 },

  winnerSelectBtn: { backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  winnerSelectBtnActive: { backgroundColor: '#3B82F6', borderColor: '#1D4ED8' },
  winnerSelectText: { fontSize: 13, fontWeight: '800', color: '#1D4ED8' },
  winnerSelectTextActive: { color: '#FFFFFF' },

  closeBtn: { backgroundColor: '#F1F5F9', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  closeBtnText: { color: Colors.text, fontSize: 14, fontWeight: '800' },
  submitBtn: { borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  submitBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
});