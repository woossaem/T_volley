import React, { useEffect, useState } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/Colors';
import { supabase } from '../lib/supabase';
import { bindTempPlayerIds, collectTempIdsFromValue, listTempSlotsFromLineup, type PlayerIdReplacement } from '../lib/retroactiveBinding';
import { formatTempPlayerLabel, TEMP_POSITION_ABBREV, parseTempPositionKey } from '../lib/tempPlayer';
import { resolveTeamName } from '../lib/nameUtils';

export interface RosterMember {
  user_id: string;
  full_name: string;
}

type SlotPick = {
  tempId: string;
  side: 'host' | 'away';
  setNumber: number;
  slotIndex: number;
  label: string;
};

interface Props {
  visible: boolean;
  matchId?: string | null;
  hostTeamName?: string;
  awayTeamName?: string;
  hostMembers: RosterMember[];
  awayMembers: RosterMember[];
  onClose: () => void;
  onSaved?: () => void;
}

const HIT_SLOP = { top: 10, bottom: 10, left: 10, right: 10 };

export default function MatchRosterModal({
  visible,
  matchId,
  hostTeamName,
  awayTeamName,
  hostMembers,
  awayMembers,
  onClose,
  onSaved,
}: Props) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [slots, setSlots] = useState<SlotPick[]>([]);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [activeTempId, setActiveTempId] = useState<string | null>(null);

  const hostName = resolveTeamName(hostTeamName, '주최팀');
  const awayName = resolveTeamName(awayTeamName, '상대팀');

  useEffect(() => {
    if (!visible || !matchId) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const { data: sets } = await supabase
          .from('match_sets')
          .select('set_number, host_lineup, away_lineup')
          .eq('match_id', matchId)
          .order('set_number', { ascending: true });
        const collected: SlotPick[] = [];
        (sets || []).forEach((row: any) => {
          const setNumber = Number(row.set_number) || 1;
          collected.push(...listTempSlotsFromLineup(row.host_lineup, 'host', setNumber));
          collected.push(...listTempSlotsFromLineup(row.away_lineup, 'away', setNumber));
        });
        const { data: match } = await supabase
          .from('matches')
          .select('host_roster, away_roster, score_logs')
          .eq('id', matchId)
          .maybeSingle();
        if (collected.length === 0) {
          collected.push(...listTempSlotsFromLineup(match?.host_roster, 'host', 1));
          collected.push(...listTempSlotsFromLineup(match?.away_roster, 'away', 1));
        }
        const extra = new Set<string>();
        collectTempIdsFromValue(match?.host_roster, extra);
        collectTempIdsFromValue(match?.away_roster, extra);
        collectTempIdsFromValue(match?.score_logs, extra);
        extra.forEach((tempId) => {
          if (collected.some((s) => s.tempId === tempId)) return;
          collected.push({
            side: tempId.includes('_a') ? 'away' : 'host',
            setNumber: 1,
            slotIndex: collected.length,
            tempId,
            label: formatTempPlayerLabel(tempId),
          });
        });
        const uniq = new Map<string, SlotPick>();
        collected.forEach((s) => {
          if (!uniq.has(s.tempId)) uniq.set(s.tempId, s);
        });
        if (!cancelled) {
          setSlots(Array.from(uniq.values()));
          setPicks({});
          setActiveTempId(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [visible, matchId]);

  const membersOf = (side: 'host' | 'away') => (side === 'host' ? hostMembers : awayMembers);
  const activeSlot = slots.find((s) => s.tempId === activeTempId) || null;

  const handleSave = async () => {
    if (!matchId) return;
    const replacements: PlayerIdReplacement[] = [];
    slots.forEach((slot) => {
      const toId = picks[slot.tempId];
      if (!toId) return;
      const member = membersOf(slot.side).find((m) => m.user_id === toId);
      replacements.push({ fromId: slot.tempId, toId, toName: member?.full_name || null });
    });
    if (replacements.length === 0) {
      Alert.alert('알림', '교체할 미가입 자리를 선택해 주세요.');
      return;
    }
    setSaving(true);
    try {
      await bindTempPlayerIds(matchId, replacements);
      Alert.alert('저장 완료', '미가입 선수 기록이 선택한 유저에게 소급 연동되었습니다.');
      onSaved?.();
      onClose();
    } catch (err: any) {
      Alert.alert('오류', err?.message || '명단 치환에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={[styles.overlay, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.card}>
          <Text style={styles.title}>선수 명단 수정</Text>
          <Text style={styles.sub} numberOfLines={2}>
            미가입 포지션 기록을 가입 유저 이름으로 연동합니다.
          </Text>

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={Colors.primary} />
            </View>
          ) : (
            <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
              <View style={styles.teamRow}>
                <Text style={styles.teamName} numberOfLines={1}>{hostName}</Text>
                <Text style={styles.vs}>VS</Text>
                <Text style={[styles.teamName, styles.teamNameRight]} numberOfLines={1}>{awayName}</Text>
              </View>

              {slots.length === 0 ? (
                <Text style={styles.empty}>소급할 미가입 자리가 없습니다.</Text>
              ) : (
                slots.map((slot) => {
                  const picked = picks[slot.tempId];
                  const pickedName = membersOf(slot.side).find((m) => m.user_id === picked)?.full_name;
                  const abbrev = parseTempPositionKey(slot.tempId);
                  return (
                    <TouchableOpacity
                      key={slot.tempId}
                      style={[styles.slotRow, activeTempId === slot.tempId && styles.slotRowActive]}
                      onPress={() => setActiveTempId(slot.tempId)}
                      activeOpacity={0.8}
                      hitSlop={HIT_SLOP}
                    >
                      <View style={styles.slotLeft}>
                        <Text style={styles.slotMeta} numberOfLines={1}>
                          {slot.side === 'host' ? hostName : awayName} · {slot.setNumber}세트
                        </Text>
                        <Text style={styles.slotLabel} numberOfLines={1}>
                          {abbrev ? `${TEMP_POSITION_ABBREV[abbrev]} ` : ''}{slot.label || formatTempPlayerLabel(slot.tempId)}
                        </Text>
                      </View>
                      <Text style={styles.slotPick} numberOfLines={1}>
                        {pickedName || '유저 선택'}
                      </Text>
                    </TouchableOpacity>
                  );
                })
              )}

              {activeSlot ? (
                <View style={styles.memberBox}>
                  <Text style={styles.memberTitle}>
                    {activeSlot.side === 'host' ? hostName : awayName} 명단
                  </Text>
                  <View style={styles.memberWrap}>
                    {membersOf(activeSlot.side).map((m) => {
                      const selected = picks[activeSlot.tempId] === m.user_id;
                      return (
                        <TouchableOpacity
                          key={m.user_id}
                          style={[styles.memberChip, selected && styles.memberChipOn]}
                          onPress={() => setPicks((prev) => ({ ...prev, [activeSlot.tempId]: m.user_id }))}
                          hitSlop={HIT_SLOP}
                          activeOpacity={0.8}
                        >
                          <Text style={[styles.memberChipText, selected && styles.memberChipTextOn]} numberOfLines={1}>
                            {m.full_name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                    {membersOf(activeSlot.side).length === 0 ? (
                      <Text style={styles.empty}>등록된 팀원이 없습니다.</Text>
                    ) : null}
                  </View>
                </View>
              ) : null}
            </ScrollView>
          )}

          <View style={styles.btnRow}>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={HIT_SLOP} activeOpacity={0.8}>
              <Text style={styles.closeBtnText}>취소</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.saveBtn}
              onPress={handleSave}
              disabled={saving}
              hitSlop={HIT_SLOP}
              activeOpacity={0.85}
            >
              {saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveBtnText}>저장</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'center', paddingHorizontal: 16 },
  card: { backgroundColor: Colors.surface, borderRadius: 20, padding: 16, maxHeight: '88%' },
  title: { fontSize: 18, fontWeight: '900', color: Colors.text, lineHeight: 24, includeFontPadding: false },
  sub: { fontSize: 12, fontWeight: '600', color: Colors.textMuted, lineHeight: 18, includeFontPadding: false, marginTop: 4, marginBottom: 10 },
  loadingBox: { paddingVertical: 32, alignItems: 'center' },
  scroll: { flexGrow: 0, flexShrink: 1 },
  teamRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  teamName: { flex: 1, flexShrink: 1, fontSize: 13, fontWeight: '800', color: '#1D4ED8', lineHeight: 18, includeFontPadding: false },
  teamNameRight: { color: '#BE123C', textAlign: 'right' },
  vs: { width: 36, textAlign: 'center', fontSize: 11, fontWeight: '900', color: '#94A3B8', lineHeight: 16, includeFontPadding: false },
  empty: { fontSize: 13, fontWeight: '600', color: Colors.textMuted, textAlign: 'center', paddingVertical: 16, lineHeight: 18, includeFontPadding: false },
  slotRow: {
    minHeight: 44,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 6,
    backgroundColor: '#F8FAFC',
  },
  slotRowActive: { borderColor: '#2563EB', backgroundColor: '#EFF6FF' },
  slotLeft: { flex: 1, flexShrink: 1, marginRight: 8 },
  slotMeta: { fontSize: 10, fontWeight: '700', color: '#64748B', lineHeight: 14, includeFontPadding: false },
  slotLabel: { fontSize: 13, fontWeight: '800', color: Colors.text, lineHeight: 18, includeFontPadding: false },
  slotPick: { maxWidth: '38%', flexShrink: 1, fontSize: 12, fontWeight: '800', color: '#2563EB', lineHeight: 16, includeFontPadding: false },
  memberBox: { marginTop: 8, backgroundColor: '#F8FAFC', borderRadius: 12, padding: 10, borderWidth: 1, borderColor: '#E2E8F0' },
  memberTitle: { fontSize: 12, fontWeight: '800', color: Colors.text, marginBottom: 8, lineHeight: 16, includeFontPadding: false },
  memberWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  memberChip: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
  },
  memberChipOn: { backgroundColor: '#2563EB', borderColor: '#1D4ED8' },
  memberChipText: { fontSize: 12, fontWeight: '700', color: '#334155', lineHeight: 16, includeFontPadding: false },
  memberChipTextOn: { color: '#FFFFFF' },
  btnRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginTop: 12 },
  closeBtn: { flex: 1, minHeight: 44, borderRadius: 10, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  closeBtnText: { fontSize: 14, fontWeight: '800', color: Colors.text, lineHeight: 20, includeFontPadding: false },
  saveBtn: { flex: 2, minHeight: 44, borderRadius: 10, backgroundColor: '#0284C7', alignItems: 'center', justifyContent: 'center' },
  saveBtnText: { fontSize: 14, fontWeight: '800', color: '#FFFFFF', lineHeight: 20, includeFontPadding: false },
});
