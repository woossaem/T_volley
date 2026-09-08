import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/Colors';
import StickyAdBanner from './StickyAdBanner';
import ProStatPanel from './ProStatPanel';
import ReportScopeTabs, { type ReportScopeTab } from './ReportScopeTabs';
import type { PersonalReportSlice } from '../lib/personalReportAnalytics';

export type { PersonalReportSlice };

interface PersonalReportModalProps {
  visible: boolean;
  onClose: () => void;
  analytics: {
    teamName: string;
    official: PersonalReportSlice | null;
    intramural: PersonalReportSlice | null;
  } | null;
  selectedSeason: string;
}

export default function PersonalReportModal({
  visible,
  onClose,
  analytics,
  selectedSeason,
}: PersonalReportModalProps) {
  const insets = useSafeAreaInsets();
  const [scope, setScope] = useState<ReportScopeTab>('official');

  useEffect(() => {
    if (visible) setScope('official');
  }, [visible, analytics?.teamName]);

  if (!analytics) return null;

  const showIntramural = !!(analytics.intramural && (
    analytics.intramural.myGames > 0
    || (analytics.intramural.setsWon + (analytics.intramural.setsDrawn ?? 0) + analytics.intramural.setsLost) > 0
  ));
  const slice = scope === 'intramural' && showIntramural
    ? analytics.intramural
    : analytics.official;
  const intramural = scope === 'intramural' && showIntramural;

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
            <Text style={styles.modalTitle}>📊 [{analytics.teamName}] 개인 출전 성적표</Text>
            <Text style={styles.modalSubTag}>
              {selectedSeason === 'all' ? '통산 전체' : `${selectedSeason} 시즌`} · 승부처·흐름차단·포지션은 여기서만 봅니다
            </Text>
            <ReportScopeTabs value={scope} onChange={setScope} showIntramural={showIntramural} />
          </View>

          <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
            <PersonalReportSection slice={slice} intramural={!!intramural} />
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

export function PersonalReportSection({
  slice,
  intramural,
  hideAttendance = false,
}: {
  slice: PersonalReportSlice | null | undefined;
  intramural: boolean;
  hideAttendance?: boolean;
}) {
  const setDraws = slice?.setsDrawn ?? 0;
  const setsPlayed = (slice?.setsWon ?? 0) + setDraws + (slice?.setsLost ?? 0);
  const setWinRate = setsPlayed > 0 ? Math.round(((slice?.setsWon ?? 0) / setsPlayed) * 100) : 0;
  const showAttendance = !hideAttendance && !intramural;

  if (!slice || (slice.myGames <= 0 && setsPlayed <= 0)) {
    return (
      <View style={styles.reportBox}>
        <Text style={styles.reportValue}>
          {intramural
            ? '이 시즌 청백전 출전 세트가 아직 없습니다.'
            : '다른 팀과의 교류전 출전 기록이 아직 없습니다.'}
        </Text>
        <Text style={styles.reportSubText}>
          {intramural
            ? '연습경기를 치르면 세트 승률이 여기에 쌓입니다.'
            : '청백전 기록이 있다면 위 청백전 탭에서 볼 수 있습니다.'}
        </Text>
      </View>
    );
  }

  return (
    <>
      {showAttendance ? (
        <View style={styles.reportBox}>
          <Text style={styles.reportLabel}>📌 팀 경기 참여율</Text>
          <Text style={styles.reportValue}>
            {slice.myGames}경기 / 팀 {slice.totalTeamGames}경기 (
            <Text style={{ color: Colors.primary }}>{slice.attendanceRate}%</Text>)
          </Text>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${slice.attendanceRate}%` }]} />
          </View>
        </View>
      ) : null}

      <View style={styles.reportBox}>
        <Text style={styles.reportLabel}>
          {intramural ? '🔥 최근 5세트 감각' : '🔥 최근 5경기 코트 감각'}
        </Text>
        {slice.recent5.length === 0 ? (
          <Text style={styles.reportSubText}>최근 출전 기록이 없습니다.</Text>
        ) : (
          <View style={styles.formRow}>
            {slice.recent5.map((res, idx) => (
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
          {slice.setsWon}세트 승 ({setsPlayed}세트 출전)
        </Text>
        <Text style={styles.reportSubText}>
          {slice.setsWon}승 {setDraws}무 {slice.setsLost}패
          {intramural ? ' · 청백전은 출전 세트 기준으로 봅니다' : ' · 출전한 세트 점수만 모았습니다'}
        </Text>
      </View>

      {slice.proStats ? <ProStatPanel player={slice.proStats} accent={intramural ? 'purple' : 'blue'} /> : null}

      <View style={[styles.reportBox, styles.partnerBox]}>
        <Text style={styles.partnerLabel}>
          {intramural ? '🤝 함께 세트를 가져간 짝꿍' : '🤝 환상의 케미 파트너 (승리 짝꿍)'}
        </Text>
        <Text style={styles.partnerValue}>{slice.bestPartnerName}</Text>
        <Text style={styles.partnerSubText}>
          {slice.maxPartnerWins > 0
            ? (intramural
              ? `같이 나와 ${slice.maxPartnerWins}세트를 가져왔습니다! 🎉`
              : `함께 출전하여 ${slice.maxPartnerWins}승을 합작했습니다! 🎉`)
            : '아직 같이 이긴 팀원 기록이 없습니다.'}
        </Text>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16 },
  modalContent: { backgroundColor: Colors.surface, borderRadius: 20, padding: 14, width: '100%', maxHeight: '90%', elevation: 5 },
  modalHeader: { borderBottomWidth: 1, borderBottomColor: '#E2E8F0', paddingBottom: 8, marginBottom: 8 },
  modalTitle: { fontSize: 16, lineHeight: 22, fontWeight: '900', color: Colors.text, includeFontPadding: false },
  modalSubTag: { fontSize: 11, lineHeight: 15, fontWeight: '700', color: Colors.primary, marginTop: 2, includeFontPadding: false },
  scrollArea: { flexShrink: 1 },
  reportBox: { backgroundColor: '#F8FAFC', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 6 },
  reportLabel: { fontSize: 12, lineHeight: 16, fontWeight: '800', color: '#475569', marginBottom: 2, includeFontPadding: false },
  reportValue: { fontSize: 14, lineHeight: 20, fontWeight: '800', color: Colors.text, includeFontPadding: false },
  reportSubText: { fontSize: 11, lineHeight: 15, color: Colors.textMuted, fontWeight: '600', marginTop: 2, includeFontPadding: false },
  progressBarBg: { height: 6, backgroundColor: '#E2E8F0', borderRadius: 3, marginTop: 4, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: Colors.primary, borderRadius: 3 },
  formRow: { flexDirection: 'row', gap: 6, marginTop: 4 },
  formBadge: { width: 28, height: 28, borderRadius: 6, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  formWin: { backgroundColor: '#10B981' },
  formDraw: { backgroundColor: '#64748B' },
  formLoss: { backgroundColor: '#EF4444' },
  formBadgeText: { color: '#FFFFFF', fontWeight: '900', fontSize: 11, lineHeight: 14, includeFontPadding: false },
  partnerBox: { backgroundColor: '#FEFCE8', borderColor: '#FDE68A' },
  partnerLabel: { fontSize: 12, lineHeight: 16, fontWeight: '800', color: '#B45309', marginBottom: 2, includeFontPadding: false },
  partnerValue: { fontSize: 15, lineHeight: 20, fontWeight: '800', color: '#92400E', includeFontPadding: false },
  partnerSubText: { fontSize: 11, lineHeight: 15, color: '#B45309', marginTop: 2, fontWeight: '600', includeFontPadding: false },
  adWrapper: { marginTop: 4, marginBottom: 4 },
  modalCloseBtn: { backgroundColor: '#F1F5F9', borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginTop: 4 },
  modalCloseBtnText: { color: Colors.text, fontSize: 14, lineHeight: 20, fontWeight: '800', includeFontPadding: false },
});
