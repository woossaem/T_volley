import React, { useState } from 'react';
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
import { Colors } from '../constants/Colors';

interface DynamicSetScore {
  hostScore: number;
  awayScore: number;
}

interface PastMatchRegisterModalProps {
  visible: boolean;
  onClose: () => void;
  myTeams: string[];
  pastHostTeam: string;
  onSelectPastHostTeam: (team: string) => void;
  pastAwayTeam: string;
  onChangePastAwayTeam: (text: string) => void;
  showAwayDropdown: boolean;
  onShowAwayDropdown: (show: boolean) => void;
  filteredAwayTeams: string[];
  pastMatchDate: string;
  onSelectPastMatchDate: (dateStr: string) => void;
  pastHostYoutube: string;
  onChangePastHostYoutube: (text: string) => void;
  pastAwayYoutube: string;
  onChangePastAwayYoutube: (text: string) => void;
  pastDynamicScores: DynamicSetScore[];
  onAddPastSet: () => void;
  onRemovePastSet: (index: number) => void;
  onUpdatePastScore: (index: number, isHost: boolean, delta: number) => void;
  pastWinner: string;
  onSelectPastWinner: (winner: string) => void;
  onRegisterPastMatch: () => void;
  actionLoading: boolean;
}

export default function PastMatchRegisterModal({
  visible,
  onClose,
  myTeams,
  pastHostTeam,
  onSelectPastHostTeam,
  pastAwayTeam,
  onChangePastAwayTeam,
  showAwayDropdown,
  onShowAwayDropdown,
  filteredAwayTeams,
  pastMatchDate,
  onSelectPastMatchDate,
  pastHostYoutube,
  onChangePastHostYoutube,
  pastAwayYoutube,
  onChangePastAwayYoutube,
  pastDynamicScores,
  onAddPastSet,
  onRemovePastSet,
  onUpdatePastScore,
  pastWinner,
  onSelectPastWinner,
  onRegisterPastMatch,
  actionLoading,
}: PastMatchRegisterModalProps) {
  const [showCalendar, setShowCalendar] = useState(false);
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth() + 1);

  const changeMonthCalendar = (delta: number) => {
    let newM = calMonth + delta;
    let newY = calYear;
    if (newM > 12) { newM = 1; newY += 1; }
    if (newM < 1) { newM = 12; newY -= 1; }
    setCalYear(newY);
    setCalMonth(newM);
  };

  const renderCalendarGrid = () => {
    const daysInMonth = new Date(calYear, calMonth, 0).getDate();
    const firstDayIndex = new Date(calYear, calMonth - 1, 1).getDay();
    const days = [];
    for (let i = 0; i < firstDayIndex; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(i);

    return (
      <View style={styles.calendarContainer}>
        <View style={styles.calHeader}>
          <TouchableOpacity onPress={() => changeMonthCalendar(-1)} style={styles.calNavBtn}>
            <Text style={styles.calNavText}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.calTitleText}>{calYear}년 {calMonth}월</Text>
          <TouchableOpacity onPress={() => changeMonthCalendar(1)} style={styles.calNavBtn}>
            <Text style={styles.calNavText}>›</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.weekRow}>
          {['일', '월', '화', '수', '목', '금', '토'].map((day, idx) => (
            <Text key={idx} style={[styles.weekText, idx === 0 && { color: '#EF4444' }, idx === 6 && { color: '#2563EB' }]}>
              {day}
            </Text>
          ))}
        </View>
        <View style={styles.daysGrid}>
          {days.map((day, idx) => {
            if (day === null) return <View key={idx} style={styles.dayBox} />;
            const dateStr = `${calYear}-${String(calMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const isSelected = pastMatchDate === dateStr;
            return (
              <TouchableOpacity
                key={idx}
                style={[styles.dayBox, isSelected && styles.selectedDayBox]}
                onPress={() => {
                  onSelectPastMatchDate(dateStr);
                  setShowCalendar(false);
                }}
              >
                <Text style={[styles.dayText, isSelected && styles.selectedDayText]}>{day}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>📜 이전 경기 결과 수동 입력</Text>
          
          <View style={styles.infoNoticeBox}>
            <Text style={styles.infoNoticeTitle}>💡 미등록 경기 기록 안내</Text>
            <Text style={styles.infoNoticeText}>
              • 앱 출시 이전 경기나 미등록 팀과의 전적을 수동으로 기록합니다.{'\n'}
              • 미등록 팀은 친선 전적으로 저장되며 승인 시 공식 반영됩니다.
            </Text>
          </View>

          <ScrollView style={{ maxHeight: 360, marginVertical: 6 }} showsVerticalScrollIndicator={false} nestedScrollEnabled={true}>
            <Text style={styles.inputLabel}>1. 내 출전 팀 선택</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
              {myTeams.map((t) => {
                const isSelected = pastHostTeam === t;
                return (
                  <TouchableOpacity key={t} style={[styles.teamSelectChip, isSelected && styles.teamSelectChipActive]} onPress={() => onSelectPastHostTeam(t)}>
                    <Text style={[styles.teamSelectChipText, isSelected && styles.teamSelectChipTextActive]}>🏐 {t}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            
            <Text style={styles.inputLabel}>2. 상대 팀명</Text>
            <View style={{ position: 'relative', zIndex: 10, marginBottom: 10 }}>
              <TextInput style={styles.textInput} placeholder="상대 팀명 입력" value={pastAwayTeam} onChangeText={(txt) => { onChangePastAwayTeam(txt); onShowAwayDropdown(true); }} onFocus={() => onShowAwayDropdown(true)} />
              {showAwayDropdown && pastAwayTeam.length > 0 && filteredAwayTeams.length > 0 && (
                <View style={styles.dropdownBox}>
                  <ScrollView style={{ maxHeight: 100 }} nestedScrollEnabled={true}>
                    {filteredAwayTeams.map((t) => (
                      <TouchableOpacity key={t} style={styles.dropdownItem} onPress={() => { onChangePastAwayTeam(t); onShowAwayDropdown(false); }}>
                        <Text style={styles.dropdownItemText}>🏐 {t} (공식 등록팀)</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>

            <Text style={styles.inputLabel}>3. 경기 날짜</Text>
            <TouchableOpacity style={styles.datePickerBtn} onPress={() => setShowCalendar(!showCalendar)}>
              <Text style={styles.datePickerBtnText}>{pastMatchDate ? `📅 ${pastMatchDate}` : '📅 날짜 선택 (달력 열기)'}</Text>
            </TouchableOpacity>
            {showCalendar && renderCalendarGrid()}

            <Text style={styles.inputLabel}>4. 영상 링크 (선택)</Text>
            <TextInput style={[styles.textInput, { marginBottom: 4 }]} placeholder="주최팀 영상 URL" placeholderTextColor="#94A3B8" value={pastHostYoutube} onChangeText={onChangePastHostYoutube} autoCapitalize="none" />
            <TextInput style={[styles.textInput, { marginBottom: 10 }]} placeholder="상대팀 영상 URL" placeholderTextColor="#94A3B8" value={pastAwayYoutube} onChangeText={onChangePastAwayYoutube} autoCapitalize="none" />

            <Text style={styles.inputLabel}>5. 세트 스코어 (선택)</Text>
            <View style={styles.scoreCalcBox}>
              {pastDynamicScores.map((ds, idx) => (
                <View key={idx} style={[styles.setRow, idx > 0 && { marginTop: 8 }]}>
                  <Text style={styles.setLabel}>{idx + 1}세트</Text>
                  <View style={styles.teamScoreCol}>
                    <div style={{ flex: 1 }}>
                      <View style={styles.stepperRow}>
                        <TouchableOpacity style={styles.stepBtn} onPress={() => onUpdatePastScore(idx, true, -1)}><Text style={styles.stepBtnText}>-1</Text></TouchableOpacity>
                        <Text style={styles.scoreValText}>{ds.hostScore}</Text>
                        <TouchableOpacity style={styles.stepBtn} onPress={() => onUpdatePastScore(idx, true, 1)}><Text style={styles.stepBtnText}>+1</Text></TouchableOpacity>
                      </View>
                    </div>
                  </View>
                  <Text style={styles.vsColon}>:</Text>
                  <View style={styles.teamScoreCol}>
                    <View style={styles.stepperRow}>
                      <TouchableOpacity style={styles.stepBtn} onPress={() => onUpdatePastScore(idx, false, -1)}><Text style={styles.stepBtnText}>-1</Text></TouchableOpacity>
                      <Text style={styles.scoreValText}>{ds.awayScore}</Text>
                      <TouchableOpacity style={styles.stepBtn} onPress={() => onUpdatePastScore(idx, false, 1)}><Text style={styles.stepBtnText}>+1</Text></TouchableOpacity>
                    </View>
                  </View>
                </View>
              ))}
              <TouchableOpacity style={styles.toggleSetBtn} onPress={onAddPastSet}>
                <Text style={styles.toggleSetText}>➕ 세트 추가</Text>
              </TouchableOpacity>
            </View>

            {pastHostTeam && pastAwayTeam ? (
              <>
                <Text style={styles.inputLabel}>6. 경기 승리 팀 선택</Text>
                <View style={{ gap: 6, marginBottom: 8 }}>
                  <TouchableOpacity style={[styles.winnerSelectBtn, pastWinner === pastHostTeam && styles.winnerSelectBtnActive]} onPress={() => onSelectPastWinner(pastHostTeam)}>
                    <Text style={[styles.winnerSelectText, pastWinner === pastHostTeam && styles.winnerSelectTextActive]}>🥇 {pastHostTeam} 승리</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.winnerSelectBtn, pastWinner === pastAwayTeam && styles.winnerSelectBtnActive]} onPress={() => onSelectPastWinner(pastAwayTeam)}>
                    <Text style={[styles.winnerSelectText, pastWinner === pastAwayTeam && styles.winnerSelectTextActive]}>🥇 {pastAwayTeam} 승리</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.winnerSelectBtn, { backgroundColor: '#F1F5F9' }, pastWinner === 'draw' && { backgroundColor: '#475569' }]} onPress={() => onSelectPastWinner('draw')}>
                    <Text style={[styles.winnerSelectText, { color: '#475569' }, pastWinner === 'draw' && { color: '#FFFFFF' }]}>🤝 무승부</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : null}
          </ScrollView>

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
            <TouchableOpacity style={[styles.closeBtn, { flex: 1 }]} onPress={onClose}><Text style={styles.closeBtnText}>취소</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.submitBtn, { flex: 2 }]} onPress={onRegisterPastMatch} disabled={actionLoading}>
              {actionLoading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.submitBtnText}>🏆 기록 저장</Text>}
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
  modalTitle: { fontSize: 16, fontWeight: '800', color: Colors.text, marginBottom: 4 },
  infoNoticeBox: { backgroundColor: '#FEFCE8', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#FDE68A', marginBottom: 8 },
  infoNoticeTitle: { fontSize: 12, fontWeight: '800', color: '#92400E', marginBottom: 2 },
  infoNoticeText: { fontSize: 11, color: '#B45309', lineHeight: 16, fontWeight: '500' },
  inputLabel: { fontSize: 12, fontWeight: '700', color: '#475569', marginBottom: 4, marginTop: 6 },
  textInput: { borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 8, padding: 10, fontSize: 13, backgroundColor: '#F8FAFC' },
  dropdownBox: { position: 'absolute', top: 46, left: 0, right: 0, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#BFDBFE', borderRadius: 8, zIndex: 1000 },
  dropdownItem: { paddingVertical: 8, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  dropdownItemText: { fontSize: 13, fontWeight: '700', color: '#1E40AF' },
  datePickerBtn: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 8, padding: 10, alignItems: 'center' },
  datePickerBtnText: { fontSize: 13, fontWeight: '700', color: '#1E293B' },
  
  calendarContainer: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, padding: 10, marginTop: 6, marginBottom: 8 },
  calHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  calTitleText: { fontSize: 14, fontWeight: '800', color: Colors.text },
  calNavBtn: { paddingHorizontal: 10, paddingVertical: 2 },
  calNavText: { fontSize: 18, fontWeight: '800', color: Colors.primary },
  weekRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 4 },
  weekText: { fontSize: 11, fontWeight: '700', width: 28, textAlign: 'center', color: '#64748B' },
  daysGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start' },
  dayBox: { width: '14.28%', height: 32, justifyContent: 'center', alignItems: 'center', marginVertical: 1 },
  selectedDayBox: { backgroundColor: Colors.primary, borderRadius: 16 },
  dayText: { fontSize: 12, fontWeight: '600', color: Colors.text },
  selectedDayText: { color: '#FFFFFF', fontWeight: '800' },

  scoreCalcBox: { backgroundColor: '#F8FAFC', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 6 },
  setRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  setLabel: { fontSize: 12, fontWeight: '800', color: '#1E293B' },
  teamScoreCol: { flex: 1, alignItems: 'center' },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stepBtn: { backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE', borderRadius: 6, width: 26, height: 26, justifyContent: 'center', alignItems: 'center' },
  stepBtnText: { fontSize: 11, fontWeight: '800', color: '#1D4ED8' },
  scoreValText: { fontSize: 16, fontWeight: '900', color: '#0F172A', minWidth: 20, textAlign: 'center' },
  vsColon: { fontSize: 16, fontWeight: '800', color: '#94A3B8' },
  toggleSetBtn: { backgroundColor: '#FFFFFF', borderStyle: 'dashed', borderWidth: 1, borderColor: '#93C5FD', borderRadius: 6, paddingVertical: 6, alignItems: 'center', marginTop: 6 },
  toggleSetText: { fontSize: 11, fontWeight: '800', color: '#2563EB' },
  teamSelectChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#CBD5E1' },
  teamSelectChipActive: { backgroundColor: '#2563EB', borderColor: '#1D4ED8' },
  teamSelectChipText: { fontSize: 12, fontWeight: '800', color: '#334155' },
  teamSelectChipTextActive: { color: '#FFFFFF' },
  winnerSelectBtn: { backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE', borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  winnerSelectBtnActive: { backgroundColor: '#3B82F6', borderColor: '#1D4ED8' },
  winnerSelectText: { fontSize: 13, fontWeight: '800', color: '#1D4ED8' },
  winnerSelectTextActive: { color: '#FFFFFF' },
  closeBtn: { backgroundColor: '#F1F5F9', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  closeBtnText: { color: Colors.text, fontSize: 14, fontWeight: '800' },
  submitBtn: { backgroundColor: Colors.primary, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  submitBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
});