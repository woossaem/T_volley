import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
} from 'react-native';
import { Colors } from '../constants/Colors';
import StickyAdBanner from './StickyAdBanner';

interface PersonalReportModalProps {
  visible: boolean;
  onClose: () => void;
  analytics: {
    teamName: string;
    totalTeamGames: number;
    myGames: number;
    attendanceRate: number;
    recent5: string[];
    setsWon: number;
    setsDrawn?: number;
    setsLost: number;
    bestPartnerName: string;
    maxPartnerWins: number;
  } | null;
  selectedSeason: string;
}

export default function PersonalReportModal({
  visible,
  onClose,
  analytics,
  selectedSeason,
}: PersonalReportModalProps) {
  if (!analytics) return null;

  const setDraws = analytics.setsDrawn ?? 0;
  const setsPlayed = analytics.setsWon + setDraws + analytics.setsLost;
  const setWinRate = setsPlayed > 0 ? Math.round((analytics.setsWon / setsPlayed) * 100) : 0;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>📊 [{analytics.teamName}] 개인 출전 성적표</Text>
            <Text style={styles.modalSubTag}>
              {selectedSeason === 'all' ? '통산 전체' : `${selectedSeason} 시즌`}
            </Text>
          </View>

          <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
            {/* 팀 경기 참여율 */}
            <View style={styles.reportBox}>
              <Text style={styles.reportLabel}>📌 팀 경기 참여율</Text>
              <Text style={styles.reportValue}>
                {analytics.myGames}경기 / 팀 {analytics.totalTeamGames}경기 (
                <Text style={{ color: Colors.primary }}>{analytics.attendanceRate}%</Text>)
              </Text>
              <View style={styles.progressBarBg}>
                <View style={[styles.progressBarFill, { width: `${analytics.attendanceRate}%` }]} />
              </View>
            </View>

            {/* 최근 5경기 코트 감각 */}
            <View style={styles.reportBox}>
              <Text style={styles.reportLabel}>🔥 최근 5경기 코트 감각</Text>
              {analytics.recent5.length === 0 ? (
                <Text style={styles.reportSubText}>최근 출전 기록이 없습니다.</Text>
              ) : (
                <View style={styles.formRow}>
                  {analytics.recent5.map((res, idx) => (
                    <View
                      key={idx}
                      style={[
                        styles.formBadge,
                        res === 'WIN' ? styles.formWin : res === 'DRAW' ? styles.formDraw : styles.formLoss,
                      ]}
                    >
                      <Text style={styles.formBadgeText}>
                        {res === 'WIN' ? '승' : res === 'DRAW' ? '무' : '패'}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>

            <View style={styles.reportBox}>
              <Text style={styles.reportLabel}>📈 세트 성적 (승률 {setWinRate}%)</Text>
              <Text style={styles.reportValue}>
                {analytics.setsWon}승 {setDraws}무 {analytics.setsLost}패
              </Text>
              <Text style={styles.reportSubText}>
                출전 세트 점수로만 집계 (경기 무승부와 무관)
              </Text>
            </View>

            {/* 승리 짝꿍 (케미 파트너) */}
            <View style={[styles.reportBox, styles.partnerBox]}>
              <Text style={styles.partnerLabel}>🤝 환상의 케미 파트너 (승리 짝꿍)</Text>
              <Text style={styles.partnerValue}>{analytics.bestPartnerName}</Text>
              <Text style={styles.partnerSubText}>
                {analytics.maxPartnerWins > 0
                  ? `함께 출전하여 ${analytics.maxPartnerWins}승을 합작했습니다! 🎉`
                  : '아직 같이 승리한 팀원 데이터가 없습니다.'}
              </Text>
            </View>
          </ScrollView>

          <View style={styles.adWrapper}>
            <StickyAdBanner />
          </View>

          <TouchableOpacity style={styles.modalCloseBtn} onPress={onClose}>
            <Text style={styles.modalCloseBtnText}>닫기</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  modalContent: { backgroundColor: Colors.surface, borderRadius: 20, padding: 14, width: '100%', maxHeight: '90%', elevation: 5 },
  modalHeader: { borderBottomWidth: 1, borderBottomColor: '#E2E8F0', paddingBottom: 8, marginBottom: 8 },
  modalTitle: { fontSize: 16, fontWeight: '900', color: Colors.text },
  modalSubTag: { fontSize: 11, fontWeight: '700', color: Colors.primary, marginTop: 2 },
  scrollArea: { flexShrink: 1 },
  reportBox: { backgroundColor: '#F8FAFC', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 6 },
  reportLabel: { fontSize: 12, fontWeight: '800', color: '#475569', marginBottom: 2 },
  reportValue: { fontSize: 14, fontWeight: '800', color: Colors.text },
  reportSubText: { fontSize: 11, color: Colors.textMuted, fontWeight: '600', marginTop: 2 },
  progressBarBg: { height: 6, backgroundColor: '#E2E8F0', borderRadius: 3, marginTop: 4, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: Colors.primary, borderRadius: 3 },
  formRow: { flexDirection: 'row', gap: 6, marginTop: 4 },
  formBadge: { width: 28, height: 28, borderRadius: 6, justifyContent: 'center', alignItems: 'center' },
  formWin: { backgroundColor: '#10B981' },
  formDraw: { backgroundColor: '#64748B' },
  formLoss: { backgroundColor: '#EF4444' },
  formBadgeText: { color: '#FFFFFF', fontWeight: '900', fontSize: 11 },
  partnerBox: { backgroundColor: '#FEFCE8', borderColor: '#FDE68A' },
  partnerLabel: { fontSize: 12, fontWeight: '800', color: '#B45309', marginBottom: 2 },
  partnerValue: { fontSize: 15, fontWeight: '800', color: '#92400E' },
  partnerSubText: { fontSize: 11, color: '#B45309', marginTop: 2, fontWeight: '600' },
  adWrapper: { marginTop: 4, marginBottom: 4 },
  modalCloseBtn: { backgroundColor: '#F1F5F9', borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginTop: 4 },
  modalCloseBtnText: { color: Colors.text, fontSize: 14, fontWeight: '800' },
});