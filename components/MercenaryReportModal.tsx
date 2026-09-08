import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import StickyAdBanner from './StickyAdBanner';
import ProStatPanel from './ProStatPanel';
import type { ProStatReport } from '../lib/proStats';

interface MercenaryReportModalProps {
  visible: boolean;
  onClose: () => void;
  analytics: {
    totalGames: number;
    wins: number;
    draws: number;
    losses: number;
    winRate: number;
    recent5: string[];
    setsWon: number;
    setsLost: number;
    bestHiredTeam: string;
    maxHiredCount: number;
    proStats?: ProStatReport | null;
  } | null;
  selectedSeason: string;
}

export default function MercenaryReportModal({
  visible,
  onClose,
  analytics,
  selectedSeason,
}: MercenaryReportModalProps) {
  const insets = useSafeAreaInsets();
  if (!analytics) return null;

  const setsPlayed = analytics.setsWon + analytics.setsLost;
  const setWinRate = setsPlayed > 0 ? Math.round((analytics.setsWon / setsPlayed) * 100) : 0;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={[styles.modalOverlay, { paddingTop: Math.max(insets.top, 16), paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: '#92400E' }]}>🙋‍♂️ 용병(게스트) 출전 성적표</Text>
            <Text style={[styles.modalSubTag, { color: '#D97706' }]}>
              {selectedSeason === 'all' ? '통산 전체' : `${selectedSeason} 시즌`}
            </Text>
          </View>

          <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
            <View style={[styles.reportBox, styles.amberBox]}>
              <Text style={[styles.reportLabel, { color: '#B45309' }]}>🔥 최근 5경기 게스트 출전 폼</Text>
              {analytics.recent5.length === 0 ? (
                <Text style={styles.reportSubText}>최근 용병 출전 기록이 없습니다.</Text>
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

            <View style={[styles.reportBox, styles.amberBox]}>
              <Text style={[styles.reportLabel, { color: '#B45309' }]}>
                📈 세트 승률 ({setWinRate}%)
              </Text>
              <Text style={[styles.reportValue, { color: '#92400E' }]}>
                {analytics.setsWon}세트 승 ({setsPlayed}세트 출전)
              </Text>
            </View>

            {analytics.proStats ? <ProStatPanel player={analytics.proStats} accent="amber" /> : null}

            <View style={[styles.reportBox, styles.amberBox]}>
              <Text style={[styles.reportLabel, { color: '#B45309' }]}>🤝 나를 많이 초청해 준 팀</Text>
              <Text style={[styles.reportValue, { color: '#92400E', fontSize: 16, lineHeight: 22 }]}>
                {analytics.bestHiredTeam}
              </Text>
              <Text style={[styles.reportSubText, { color: '#D97706' }]}>
                {analytics.maxHiredCount > 0
                  ? `해당 팀에 용병으로 총 ${analytics.maxHiredCount}회 참가했습니다! 🎉`
                  : '아직 기록된 용병 참가 팀이 없습니다.'}
              </Text>
            </View>
          </ScrollView>

          <View style={styles.adWrapper}>
            <StickyAdBanner />
          </View>

          <TouchableOpacity style={styles.modalCloseBtn} onPress={onClose} hitSlop={8}>
            <Text style={styles.modalCloseBtnText}>닫기</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16 },
  modalContent: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 14, width: '100%', maxHeight: '90%', elevation: 5 },
  modalHeader: { borderBottomWidth: 1, borderBottomColor: '#FEF3C7', paddingBottom: 8, marginBottom: 8 },
  modalTitle: { fontSize: 16, lineHeight: 22, fontWeight: '900', includeFontPadding: false },
  modalSubTag: { fontSize: 11, lineHeight: 15, fontWeight: '700', marginTop: 2, includeFontPadding: false },
  scrollArea: { flexShrink: 1 },
  reportBox: { borderRadius: 10, padding: 10, borderWidth: 1, marginBottom: 6 },
  amberBox: { borderColor: '#FDE68A', backgroundColor: '#FFFBEB' },
  reportLabel: { fontSize: 12, lineHeight: 16, fontWeight: '800', marginBottom: 2, includeFontPadding: false },
  reportValue: { fontSize: 14, lineHeight: 20, fontWeight: '800', includeFontPadding: false },
  reportSubText: { fontSize: 11, lineHeight: 15, fontWeight: '600', marginTop: 2, includeFontPadding: false },
  formRow: { flexDirection: 'row', gap: 6, marginTop: 4 },
  formBadge: { width: 28, height: 28, borderRadius: 6, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  formWin: { backgroundColor: '#10B981' },
  formDraw: { backgroundColor: '#64748B' },
  formLoss: { backgroundColor: '#EF4444' },
  formBadgeText: { color: '#FFFFFF', fontWeight: '900', fontSize: 11, lineHeight: 14, includeFontPadding: false },
  adWrapper: { marginTop: 4, marginBottom: 4 },
  modalCloseBtn: { backgroundColor: '#F1F5F9', borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginTop: 4 },
  modalCloseBtnText: { color: '#0F172A', fontSize: 14, lineHeight: 20, fontWeight: '800', includeFontPadding: false },
});
