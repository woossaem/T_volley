import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  ScrollView,
  Modal,
  Alert,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { supabase } from '../lib/supabase';
import { sendNotificationToTeam } from '../lib/notificationService';
import { Colors } from '../constants/Colors';

const MATCH_FORMATS = ['3세트 매치', '5세트 매치', '2시간 교류전', '미니 리그전', '기타'];

const parseTeamName = (rawName: any): string => {
  if (!rawName) return '';
  if (typeof rawName === 'string') {
    const trimmed = rawName.trim();
    if (!trimmed || trimmed === 'null' || trimmed === 'undefined') return '';
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try { return parseTeamName(JSON.parse(trimmed)); } catch (e) {}
    }
    return trimmed;
  }
  if (Array.isArray(rawName)) {
    for (const item of rawName) {
      const parsed = parseTeamName(item);
      if (parsed) return parsed;
    }
    return '';
  }
  if (typeof rawName === 'object') {
    const candidate = rawName.name || rawName.team_name || rawName.title || rawName.formatted;
    if (candidate && candidate !== rawName) {
      const parsedCand = parseTeamName(candidate);
      if (parsedCand) return parsedCand;
    }
  }
  return '';
};

interface BatchProposalModalProps {
  visible: boolean;
  onClose: () => void;
  selectedTeamIds: string[];
  allTeams: any[];
  myTeamNames: string[];
  currentUserId?: string;
  onSuccess: () => void;
}

export default function BatchProposalModal({
  visible,
  onClose,
  selectedTeamIds,
  allTeams,
  myTeamNames,
  currentUserId,
  onSuccess,
}: BatchProposalModalProps) {
  const cleanMyTeams = useMemo(() => {
    return myTeamNames.map((t: string) => parseTeamName(t)).filter(Boolean);
  }, [myTeamNames]);

  const [myProposingTeam, setMyProposingTeam] = useState<string>('');
  const [proposalDate, setProposalDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [proposalLocation, setProposalLocation] = useState('');
  const [proposalFormat, setProposalFormat] = useState('3세트 매치');
  const [proposalDescription, setProposalDescription] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const [lastLocation, setLastLocation] = useState('');
  const [lastDescription, setLastDescription] = useState('');

  useEffect(() => {
    if (cleanMyTeams.length > 0 && !myProposingTeam) {
      setMyProposingTeam(cleanMyTeams[0]);
    }
  }, [cleanMyTeams]);

  useEffect(() => {
    if (visible && currentUserId) {
      fetchRecentHistory();
    }
  }, [visible, currentUserId]);

  const fetchRecentHistory = async () => {
    if (!currentUserId) return;
    try {
      const { data } = await supabase
        .from('matches')
        .select('location, description')
        .eq('host_user_id', currentUserId)
        .order('created_at', { ascending: false })
        .limit(5);

      if (data && data.length > 0) {
        setLastLocation(data.find(m => m.location?.trim())?.location || '');
        setLastDescription(data.find(m => m.description?.trim())?.description || '');
      }
    } catch (e) {}
  };

  const handleSendBatchProposal = async () => {
    if (!myProposingTeam) return Alert.alert('알림', '제안을 보낼 내 소속 팀을 선택해 주세요.');
    if (!proposalLocation.trim()) return Alert.alert('알림', '경기 장소(체육관)를 입력해 주세요.');
    if (!currentUserId) return;

    const targetTeams = allTeams.filter(t => selectedTeamIds.includes(t.team_id));
    const validTargets = targetTeams.filter(t => parseTeamName(t.team_name) !== myProposingTeam);

    if (validTargets.length === 0) {
      return Alert.alert('알림', '주최 팀 외에 선택된 상대 팀이 없습니다.');
    }

    const formattedDate = `${proposalDate.getFullYear()}년 ${proposalDate.getMonth() + 1}월 ${proposalDate.getDate()}일`;
    const hours = proposalDate.getHours();
    const minutes = proposalDate.getMinutes();
    const ampm = hours >= 12 ? '오후' : '오전';
    const h = hours % 12 || 12;
    const m = minutes < 10 ? `0${minutes}` : minutes;
    const formattedTime = `${ampm} ${h}:${m}`;

    setActionLoading(true);
    try {
      let createdMatchCount = 0;

      for (const targetTeam of validTargets) {
        const cleanTargetName = parseTeamName(targetTeam.team_name);
        const isTargetMyOwnTeam = cleanMyTeams.includes(cleanTargetName);

        // 내 다른 소속팀과의 교류전일 경우 매칭 완료(matched)로 즉시 등록
        const matchStatus = isTargetMyOwnTeam ? 'matched' : 'open';

        await supabase.from('matches').insert({
          host_user_id: currentUserId,
          host_team_name: myProposingTeam,
          away_team_name: cleanTargetName,
          region: targetTeam.region || '천안',
          match_date: formattedDate,
          match_time: formattedTime,
          location: proposalLocation.trim(),
          format: proposalFormat,
          description: proposalDescription.trim() 
            ? `[교류전] ${proposalDescription.trim()}` 
            : `'${myProposingTeam}' VS '${cleanTargetName}' 정식 교류전`,
          status: matchStatus,
        });

        if (!isTargetMyOwnTeam) {
          await sendNotificationToTeam(
            cleanTargetName,
            '✉️ [교류전 매칭 제안 도착]',
            `'${myProposingTeam}' 팀이 교류전을 제안했습니다!\n📅 ${formattedDate} ${formattedTime} 📍 ${proposalLocation.trim()}`
          );
        }
        createdMatchCount++;
      }

      Alert.alert(
        '교류전 등록 완료! 🎉', 
        `${createdMatchCount}개 교류전 매치 생성이 완료되었습니다.\n(내 소속팀 간 교류전은 매칭 완료 상태로 바로 등록됩니다)`
      );
      onSuccess();
    } catch (err: any) {
      Alert.alert('오류', '제안 발송 중 문제가 발생했습니다: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const onChangeDate = (e: any, selectedDate?: Date) => {
    setShowDatePicker(false);
    if (selectedDate) setProposalDate(selectedDate);
  };
  const onChangeTime = (e: any, selectedDate?: Date) => {
    setShowTimePicker(false);
    if (selectedDate) setProposalDate(selectedDate);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>✉️ 교류전 매칭 제안 및 등록</Text>
          <Text style={styles.modalSub}>
            선택하신 <Text style={{ fontWeight: '800', color: Colors.primary }}>{selectedTeamIds.length}개 팀</Text>을 대상으로 교류전을 세팅합니다.
          </Text>

          <ScrollView style={{ maxHeight: 420, marginVertical: 8 }} showsVerticalScrollIndicator={false}>
            <Text style={styles.inputLabel}>1. 어느 팀 이름으로 주최하시나요?</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {cleanMyTeams.map((tName: string) => {
                const isSel = myProposingTeam === tName;
                return (
                  <TouchableOpacity
                    key={tName}
                    style={[styles.chipBtn, isSel && styles.chipBtnActive]}
                    onPress={() => setMyProposingTeam(tName)}
                  >
                    <Text style={[styles.chipBtnText, isSel && styles.chipBtnTextActive]}>🛡️ {tName}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>2. 날짜 선택</Text>
                <TouchableOpacity style={styles.compactPickerBtn} onPress={() => setShowDatePicker(true)}>
                  <Text style={styles.compactPickerText}>
                    📅 {`${proposalDate.getFullYear()}년 ${proposalDate.getMonth() + 1}월 ${proposalDate.getDate()}일`}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>3. 시간 선택</Text>
                <TouchableOpacity style={styles.compactPickerBtn} onPress={() => setShowTimePicker(true)}>
                  <Text style={styles.compactPickerText}>
                    ⏰ {`${proposalDate.getHours() >= 12 ? '오후' : '오전'} ${proposalDate.getHours() % 12 || 12}:${proposalDate.getMinutes() < 10 ? '0' : ''}${proposalDate.getMinutes()}`}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {showDatePicker && <DateTimePicker value={proposalDate} mode="date" display="default" onChange={onChangeDate} />}
            {showTimePicker && <DateTimePicker value={proposalDate} mode="time" display="default" onChange={onChangeTime} />}

            <View style={styles.labelRow}>
              <Text style={styles.inputLabel}>4. 경기 장소 (체육관)</Text>
              {lastLocation ? (
                <TouchableOpacity style={styles.quickFillBtn} onPress={() => setProposalLocation(lastLocation)}>
                  <Text style={styles.quickFillBtnText}>⚡ 최근 장소</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <TextInput
              style={[styles.textInput, { marginBottom: 12 }]}
              placeholder="예: 불당초등학교 체육관"
              placeholderTextColor="#94A3B8"
              value={proposalLocation}
              onChangeText={setProposalLocation}
            />

            <Text style={styles.inputLabel}>5. 경기 방식</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {MATCH_FORMATS.map((fmt) => (
                <TouchableOpacity
                  key={fmt}
                  style={[styles.chipBtn, proposalFormat === fmt && styles.chipBtnActive]}
                  onPress={() => setProposalFormat(fmt)}
                >
                  <Text style={[styles.chipBtnText, proposalFormat === fmt && styles.chipBtnTextActive]}>{fmt}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.labelRow}>
              <Text style={styles.inputLabel}>6. 제안 메시지 (선택)</Text>
              {lastDescription ? (
                <TouchableOpacity style={styles.quickFillBtn} onPress={() => setProposalDescription(lastDescription)}>
                  <Text style={styles.quickFillBtnText}>⚡ 최근 제안글</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <TextInput
              style={[styles.textInput, { height: 60, textAlignVertical: 'top' }]}
              placeholder="예: 정식 친선 교류전 진행하고 싶습니다!"
              placeholderTextColor="#94A3B8"
              value={proposalDescription}
              onChangeText={setProposalDescription}
              multiline
            />
          </ScrollView>

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            <TouchableOpacity style={[styles.closeBtn, { flex: 1, marginTop: 0 }]} onPress={onClose}>
              <Text style={styles.closeBtnText}>취소</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.submitBtn, { flex: 2 }]} onPress={handleSendBatchProposal} disabled={actionLoading}>
              {actionLoading ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.submitBtnText}>🚀 교류전 제안/등록하기</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: Colors.surface, borderRadius: 18, padding: 18, width: '100%', elevation: 5 },
  modalTitle: { fontSize: 16, fontWeight: '800', color: Colors.text, marginBottom: 2 },
  modalSub: { fontSize: 12, color: Colors.textMuted, marginBottom: 10 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, marginBottom: 4 },
  inputLabel: { fontSize: 12, fontWeight: '700', color: '#475569' },
  quickFillBtn: { backgroundColor: '#FEFCE8', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1, borderColor: '#FDE047' },
  quickFillBtnText: { fontSize: 10.5, color: '#A16207', fontWeight: '800' },
  textInput: { borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 8, padding: 10, fontSize: 13, backgroundColor: '#F8FAFC' },
  compactPickerBtn: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 10, alignItems: 'center' },
  compactPickerText: { fontSize: 12, color: Colors.primary, fontWeight: '700' },
  chipBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: 'transparent', alignItems: 'center' },
  chipBtnActive: { backgroundColor: '#EFF6FF', borderColor: '#3B82F6' },
  chipBtnText: { fontSize: 12, fontWeight: '600', color: '#64748B' },
  chipBtnTextActive: { color: '#1D4ED8', fontWeight: '800' },
  submitBtn: { backgroundColor: '#2563EB', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  submitBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  closeBtn: { backgroundColor: '#F1F5F9', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  closeBtnText: { color: Colors.text, fontSize: 13, fontWeight: '700' },
});