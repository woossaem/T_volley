import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { Colors } from '../constants/Colors';
import StickyAdBanner from './StickyAdBanner';
import { getSafeDisplayName } from '../lib/utils';

interface MemberInfo {
  user_id: string;
  full_name: string;
}

interface UserEvalItem {
  score: number; // 0.3, 0.1, -0.1
  label: string;
}

interface MatchEvaluationModalProps {
  visible: boolean;
  onClose: () => void;
  matchId: string;
  evaluatorId: string;
  targetTeamName: string;
  matchMembers: MemberInfo[];
  onEvaluationComplete: () => void;
}

export default function MatchEvaluationModal({
  visible,
  onClose,
  matchId,
  evaluatorId,
  targetTeamName,
  matchMembers,
  onEvaluationComplete,
}: MatchEvaluationModalProps) {
  const [loading, setLoading] = useState(false);
  const [hasEvaluated, setHasEvaluated] = useState(false);

  // 1. 상대 팀 전체 매너 평가 (+0.3, +0.1, -0.1)
  const [teamEvalScore, setTeamEvalScore] = useState<number | null>(null);

  // 2. 상대 선수 개별 매너 평가 Map (userId -> { score, label })
  const [userEvalMap, setUserEvalMap] = useState<{ [userId: string]: UserEvalItem }>({});

  // 현재 집중 평가 중인 선수 인덱스
  const [activeUserIdx, setActiveUserIdx] = useState<number>(0);

  useEffect(() => {
    if (visible && matchId && evaluatorId) {
      checkEvaluationStatus();
    } else {
      setTeamEvalScore(null);
      setUserEvalMap({});
      setActiveUserIdx(0);
      setHasEvaluated(false);
    }
  }, [visible, matchId, evaluatorId]);

  const checkEvaluationStatus = async () => {
    try {
      const { data } = await supabase
        .from('match_evaluations')
        .select('id')
        .eq('match_id', matchId)
        .eq('evaluator_id', evaluatorId)
        .maybeSingle();

      if (data) setHasEvaluated(true);
    } catch (e) {
      console.error('평가 상태 확인 오류:', e);
    }
  };

  const activeUser = matchMembers[activeUserIdx] || null;
  const currentActiveUserEval = activeUser ? userEvalMap[activeUser.user_id] : null;

  const handleUserScoreSelect = (score: number, label: string) => {
    if (!activeUser) return;
    setUserEvalMap((prev) => ({
      ...prev,
      [activeUser.user_id]: { score, label },
    }));
  };

  const handleUserScoreClear = () => {
    if (!activeUser) return;
    setUserEvalMap((prev) => {
      const next = { ...prev };
      delete next[activeUser.user_id];
      return next;
    });
  };

  const navigateUser = (delta: number) => {
    if (matchMembers.length === 0) return;
    let nextIdx = activeUserIdx + delta;
    if (nextIdx < 0) nextIdx = matchMembers.length - 1;
    if (nextIdx >= matchMembers.length) nextIdx = 0;
    setActiveUserIdx(nextIdx);
  };

  const handleSubmit = () => {
    const evaluatedUserCount = Object.keys(userEvalMap).length;

    if (teamEvalScore === null && evaluatedUserCount === 0) {
      return Alert.alert('알림', '팀 매너를 평가하거나 상대 선수를 최소 1명 이상 평가해 주세요.');
    }

    let teamEvalLabel = '평가 안함';
    if (teamEvalScore === 0.3) teamEvalLabel = '매너 최고예요 (+0.3°C)';
    if (teamEvalScore === 0.1) teamEvalLabel = '좋았어요 (+0.1°C)';
    if (teamEvalScore === -0.1) teamEvalLabel = '아쉬웠어요 (-0.1°C)';

    const praisedUserCount = Object.values(userEvalMap).filter((item) => item.score > 0).length;

    Alert.alert(
      '이대로 매너 평가를 제출하시겠습니까?',
      `🛡️ 팀 매너: ${teamEvalLabel}\n🍇 칭찬 포도알 선물: ${praisedUserCount}명\n\n⚠️ 제출 완료 후에는 추가/수정이 불가능합니다.`,
      [
        { text: '다시 확인하기', style: 'cancel' },
        { text: '최종 제출하기 ⚡', onPress: confirmAndSaveEvaluation },
      ]
    );
  };

  const confirmAndSaveEvaluation = async () => {
    setLoading(true);
    try {
      // 1. 중복 평가 방지 기록
      const { error: evalError } = await supabase.from('match_evaluations').insert({
        match_id: matchId,
        evaluator_id: evaluatorId,
        target_team_name: targetTeamName,
        team_score_delta: teamEvalScore || 0,
      });

      if (evalError) throw evalError;

      // 2. 상대 팀 매너 온도 반영 (1경기 최대 변동폭 ±0.3°C Cap)
      if (teamEvalScore && teamEvalScore !== 0) {
        const { data: teamData } = await supabase.from('teams').select('manner_temp').eq('name', targetTeamName).single();
        const currentTemp = teamData?.manner_temp || 36.5;
        const cappedScore = Math.max(-0.3, Math.min(0.3, teamEvalScore));
        await supabase.from('teams').update({ manner_temp: Math.max(0, currentTemp + cappedScore) }).eq('name', targetTeamName);
      }

      // 3. 상대 선수 개별 평가 반영 & 🍇 칭찬받은 유저에게 익명 푸시 알림 보주기
      const userEvalEntries = Object.entries(userEvalMap);
      const notificationsToInsert: any[] = [];

      if (userEvalEntries.length > 0) {
        for (const [uId, evalItem] of userEvalEntries) {
          const { data: uData } = await supabase.from('profiles').select('grape_count, manner_temp').eq('id', uId).single();
          const currGrape = uData?.grape_count || 0;
          const currManner = uData?.manner_temp || 36.5;

          const isPraised = evalItem.score > 0;
          const newGrape = isPraised ? currGrape + 1 : currGrape;
          const cappedScore = Math.max(-0.3, Math.min(0.3, evalItem.score));
          const newManner = Math.max(0, currManner + cappedScore);

          await supabase.from('profiles').update({
            grape_count: newGrape,
            manner_temp: newManner,
          }).eq('id', uId);

          // 🍇 칭찬을 받은 경우(0.3 또는 0.1)에만 100% 익명 칭찬 알림 쌓기
          if (isPraised) {
            notificationsToInsert.push({
              user_id: uId,
              title: '🍇 [칭찬 포도알 선물 도착!]',
              message: '오늘 경기에서 상대팀 선수가 칭찬 포도알 1개를 선물했습니다!',
              is_read: false,
            });
          }
        }
      }

      // 상대팀원 전체에게 전달되는 100% 익명 팀 매너 감사 알림
      if (matchMembers.length > 0) {
        matchMembers.forEach((m) => {
          notificationsToInsert.push({
            user_id: m.user_id,
            title: '🤝 [코트 매너 소감 도착]',
            message: `오늘 경기를 함께한 상대팀이 매너 소감을 남겼습니다!`,
            is_read: false,
          });
        });
      }

      // 알림 DB 일괄 등록
      if (notificationsToInsert.length > 0) {
        await supabase.from('notifications').insert(notificationsToInsert);
      }

      // 4. 작성자(나) 보상 포도알 +1개 지급
      const { data: myData } = await supabase.from('profiles').select('grape_count').eq('id', evaluatorId).single();
      const myCurrGrape = myData?.grape_count || 0;
      await supabase.from('profiles').update({ grape_count: myCurrGrape + 1 }).eq('id', evaluatorId);

      Alert.alert('🎁 평가 완료!', '상대 팀에게 평가가 전달되고, 보상 포도알 1개가 수령되었습니다.');
      onEvaluationComplete();
      onClose();
    } catch (e: any) {
      if (e.code === '23505') {
        Alert.alert('알림', '이미 이 경기에 대한 평가를 완료하셨습니다.');
        onClose();
      } else {
        Alert.alert('오류', '평가 제출 중 문제가 발생했습니다.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {hasEvaluated ? (
            <View style={{ padding: 20, alignItems: 'center' }}>
              <Text style={{ fontSize: 40, marginBottom: 10 }}>✅</Text>
              <Text style={{ fontSize: 16, fontWeight: '800', color: Colors.text, marginBottom: 6 }}>평가 완료된 경기입니다</Text>
              <Text style={{ fontSize: 13, color: Colors.textMuted, textAlign: 'center', marginBottom: 20 }}>
                이미 이 경기의 매너 평가를 제출하여 보상 포도알 수령을 마쳤습니다.
              </Text>

              <View style={{ width: '100%', marginBottom: 10 }}>
                <StickyAdBanner />
              </View>

              <TouchableOpacity style={[styles.closeBtn, { width: '100%' }]} onPress={onClose}>
                <Text style={styles.closeBtnText}>닫기</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={styles.modalTitle}>🎁 상대팀 매너 평가 & 칭찬 포도알</Text>
              <Text style={styles.modalSub}>
                [{targetTeamName}] 팀과 선수들을 평가해주세요! (제출 시 포도알 +1개 수령)
              </Text>

              {/* 안내 박스 */}
              <View style={styles.noticeBox}>
                <Text style={styles.noticeTitle}>💡 매너 평가 정책 안내</Text>
                <Text style={styles.noticeText}>
                  • <Text style={{ color: '#EF4444', fontWeight: '800' }}>제출 완료 후에는 추가/수정이 불가능합니다.</Text>{'\n'}
                  • 🛡️ 보복 평가 방지를 위해 매너 온도는 <Text style={{ fontWeight: '800' }}>3회 이상 축적된 후 딜레이 업데이트</Text>됩니다.
                </Text>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 320, marginVertical: 6 }}>
                {/* 1. 상대 팀 전체 매너 평가 */}
                <View style={styles.sectionBox}>
                  <Text style={styles.sectionTitle}>1. [{targetTeamName}] 팀 전체 매너 평가</Text>
                  <View style={{ gap: 6 }}>
                    <TouchableOpacity
                      style={[styles.evalBtn, teamEvalScore === 0.3 && styles.evalBtnActive1]}
                      onPress={() => setTeamEvalScore(0.3)}
                    >
                      <Text style={[styles.evalBtnText, teamEvalScore === 0.3 && styles.evalBtnTextActive]}>
                        😍 매너가 최고였어요! (+0.3°C)
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.evalBtn, teamEvalScore === 0.1 && styles.evalBtnActive2]}
                      onPress={() => setTeamEvalScore(0.1)}
                    >
                      <Text style={[styles.evalBtnText, teamEvalScore === 0.1 && styles.evalBtnTextActive]}>
                        😊 좋았어요! (+0.1°C)
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.evalBtn, teamEvalScore === -0.1 && styles.evalBtnActive3]}
                      onPress={() => setTeamEvalScore(-0.1)}
                    >
                      <Text style={[styles.evalBtnText, teamEvalScore === -0.1 && styles.evalBtnTextActive]}>
                        🥲 아쉬웠어요 (-0.1°C)
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* 2. 상대 선수 개별 3단계 매너 평가 & 스위퍼 */}
                <View style={styles.sectionBox}>
                  <Text style={styles.sectionTitle}>2. 상대 출전 선수 개별 매너 평가 (선택)</Text>
                  
                  {matchMembers.length === 0 ? (
                    <Text style={{ fontSize: 12, color: '#94A3B8' }}>상대팀 출전 명단이 없습니다.</Text>
                  ) : (
                    <>
                      <View style={styles.memberGrid}>
                        {matchMembers.map((m, idx) => {
                          const userEval = userEvalMap[m.user_id];
                          const isFocused = idx === activeUserIdx;
                          
                          let badgeIco = '👤 ';
                          if (userEval) {
                            if (userEval.score === 0.3) badgeIco = '😍 ';
                            else if (userEval.score === 0.1) badgeIco = '😊 ';
                            else if (userEval.score === -0.1) badgeIco = '🥲 ';
                          }

                          return (
                            <TouchableOpacity
                              key={m.user_id}
                              style={[
                                styles.memberChip,
                                isFocused && styles.memberChipFocused,
                                userEval && userEval.score > 0 && styles.memberChipPraised,
                              ]}
                              onPress={() => setActiveUserIdx(idx)}
                            >
                              <Text style={[
                                styles.memberChipText,
                                isFocused && styles.memberChipTextFocused,
                                userEval && userEval.score > 0 && styles.memberChipTextPraised,
                              ]}>
                                {badgeIco}{getSafeDisplayName(m)}{userEval && userEval.score > 0 ? ' 🍇' : ''}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>

                      {activeUser && (
                        <View style={styles.focusedUserCard}>
                          <View style={styles.swiperHeader}>
                            <TouchableOpacity onPress={() => navigateUser(-1)} style={styles.swiperArrowBtn}>
                              <Text style={styles.swiperArrowText}>‹</Text>
                            </TouchableOpacity>
                            <Text style={styles.focusedUserNameText}>
                              👤 {getSafeDisplayName(activeUser)} 선생님 ({activeUserIdx + 1}/{matchMembers.length})
                            </Text>
                            <TouchableOpacity onPress={() => navigateUser(1)} style={styles.swiperArrowBtn}>
                              <Text style={styles.swiperArrowText}>›</Text>
                            </TouchableOpacity>
                          </View>

                          <View style={{ gap: 6, marginTop: 8 }}>
                            <TouchableOpacity
                              style={[styles.userOptionBtn, currentActiveUserEval?.score === 0.3 && styles.userOptionBtnActive1]}
                              onPress={() => handleUserScoreSelect(0.3, '최고였어요')}
                            >
                              <Text style={[styles.userOptionText, currentActiveUserEval?.score === 0.3 && styles.userOptionTextActive]}>
                                😍 매너 최고! (+0.3°C & 🍇 포도알 1개)
                              </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={[styles.userOptionBtn, currentActiveUserEval?.score === 0.1 && styles.userOptionBtnActive2]}
                              onPress={() => handleUserScoreSelect(0.1, '좋았어요')}
                            >
                              <Text style={[styles.userOptionText, currentActiveUserEval?.score === 0.1 && styles.userOptionTextActive]}>
                                😊 매너 좋음! (+0.1°C & 🍇 포도알 1개)
                              </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={[styles.userOptionBtn, currentActiveUserEval?.score === -0.1 && styles.userOptionBtnActive3]}
                              onPress={() => handleUserScoreSelect(-0.1, '아쉬웠어요')}
                            >
                              <Text style={[styles.userOptionText, currentActiveUserEval?.score === -0.1 && styles.userOptionTextActive]}>
                                🥲 매너 아쉬움 (-0.1°C & 포도알 없음)
                              </Text>
                            </TouchableOpacity>

                            {currentActiveUserEval && (
                              <TouchableOpacity style={styles.clearUserEvalBtn} onPress={handleUserScoreClear}>
                                <Text style={styles.clearUserEvalBtnText}>✕ 이 선수 평가 선택 해제</Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        </View>
                      )}
                    </>
                  )}
                </View>
              </ScrollView>

              <View style={styles.adWrapper}>
                <StickyAdBanner />
              </View>

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
                <TouchableOpacity style={[styles.closeBtn, { flex: 1, marginTop: 0 }]} onPress={onClose}>
                  <Text style={styles.closeBtnText}>나중에 하기</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.submitBtn, { flex: 2 }]} onPress={handleSubmit} disabled={loading}>
                  {loading ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <Text style={styles.submitBtnText}>⚡ 제출 완료 & 포도알 1개 받기</Text>
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  modalContent: { backgroundColor: Colors.surface, borderRadius: 20, padding: 16, width: '100%', elevation: 5 },
  modalTitle: { fontSize: 16.5, fontWeight: '900', color: '#6B21A8', marginBottom: 2 },
  modalSub: { fontSize: 11, color: '#7E22CE', marginBottom: 8, fontWeight: '600' },

  noticeBox: { backgroundColor: '#FEF2F2', padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#FECACA', marginBottom: 8 },
  noticeTitle: { fontSize: 11, fontWeight: '800', color: '#DC2626', marginBottom: 2 },
  noticeText: { fontSize: 10.5, color: '#991B1B', lineHeight: 15, fontWeight: '600' },

  sectionBox: { backgroundColor: '#F8FAFC', borderRadius: 12, padding: 10, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 8 },
  sectionTitle: { fontSize: 12, fontWeight: '800', color: '#1E293B', marginBottom: 6 },

  evalBtn: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#CBD5E1', paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  evalBtnActive1: { backgroundColor: '#10B981', borderColor: '#059669' },
  evalBtnActive2: { backgroundColor: '#3B82F6', borderColor: '#2563EB' },
  evalBtnActive3: { backgroundColor: '#64748B', borderColor: '#475569' },
  
  evalBtnText: { fontSize: 12.5, fontWeight: '700', color: '#475569' },
  evalBtnTextActive: { color: '#FFFFFF', fontWeight: '900' },

  memberGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
  memberChip: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#CBD5E1', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 8 },
  memberChipFocused: { borderColor: '#3B82F6', borderWidth: 2 },
  memberChipPraised: { backgroundColor: '#FAF5FF', borderColor: '#C084FC' },
  memberChipText: { fontSize: 11.5, fontWeight: '600', color: '#64748B' },
  memberChipTextFocused: { color: '#1D4ED8', fontWeight: '800' },
  memberChipTextPraised: { color: '#9333EA', fontWeight: '800' },

  focusedUserCard: { backgroundColor: '#FFFFFF', borderRadius: 10, padding: 8, borderWidth: 1.5, borderColor: '#BFDBFE', marginTop: 2 },
  swiperHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#EFF6FF', paddingVertical: 3, paddingHorizontal: 6, borderRadius: 6 },
  swiperArrowBtn: { paddingHorizontal: 8, paddingVertical: 2 },
  swiperArrowText: { fontSize: 16, fontWeight: '900', color: '#1D4ED8' },
  focusedUserNameText: { fontSize: 12, fontWeight: '800', color: '#1E40AF' },

  userOptionBtn: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', paddingVertical: 8, borderRadius: 6, alignItems: 'center' },
  userOptionBtnActive1: { backgroundColor: '#10B981', borderColor: '#059669' },
  userOptionBtnActive2: { backgroundColor: '#3B82F6', borderColor: '#2563EB' },
  userOptionBtnActive3: { backgroundColor: '#64748B', borderColor: '#475569' },
  
  userOptionText: { fontSize: 11.5, fontWeight: '700', color: '#475569' },
  userOptionTextActive: { color: '#FFFFFF', fontWeight: '900' },

  clearUserEvalBtn: { paddingVertical: 2, alignItems: 'center', marginTop: 2 },
  clearUserEvalBtnText: { fontSize: 10.5, color: '#EF4444', fontWeight: '700', textDecorationLine: 'underline' },

  adWrapper: { marginTop: 4, marginBottom: 2 },

  closeBtn: { backgroundColor: '#F1F5F9', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  closeBtnText: { color: Colors.text, fontSize: 13, fontWeight: '800' },
  submitBtn: { backgroundColor: '#9333EA', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  submitBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
});