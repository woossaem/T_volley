import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
} from 'react-native';
import {
  ANONYMOUS_PLAYER_NAME,
  clampLineCount,
  isAnonymousSlotId,
  lineSlotLabels,
  LINE_MAX,
  LINE_MIN,
  listHasUser,
  makeAnonSlotId,
  type SetFormation,
} from '../lib/roster';

export interface FormationMember {
  user_id: string;
  full_name: string;
}

type Duty = 'court' | 'bench' | 'late';

interface Props {
  visible: boolean;
  teamName: string;
  members: FormationMember[];
  initial: SetFormation;
  onClose: () => void;
  onSave: (formation: SetFormation) => void;
}

const PRESETS = [
  { id: '3-3-3', label: '3-3-3', hint: '전위3·후위3 / 대기3', front: 3, back: 3, groups: [3, 3, 3] },
  { id: '3-2-4', label: '3-2-4', hint: '전위3·후위2 / 대기2·지각4', front: 3, back: 2, groups: [3, 2, 4] },
  { id: '4-2-3', label: '4-2-3', hint: '전위4·후위2 / 대기3', front: 4, back: 2, groups: [4, 2, 3] },
] as const;

function uniqueKeepOrder(ids: string[]) {
  const seen = new Set<string>();
  return ids.filter((id) => {
    if (!id || seen.has(id) || isAnonymousSlotId(id)) return false;
    seen.add(id);
    return true;
  });
}

function buildSlots(ids: string[], total: number): string[] {
  const real = ids.filter((id) => id && !isAnonymousSlotId(id));
  const next = real.slice(0, total);
  while (next.length < total) next.push(makeAnonSlotId(next.length));
  return next;
}

export default function FormationModal({ visible, teamName, members, initial, onClose, onSave }: Props) {
  const [frontCount, setFrontCount] = useState(3);
  const [backCount, setBackCount] = useState(3);
  const [court, setCourt] = useState<string[]>(buildSlots([], 6));
  const [bench, setBench] = useState<string[]>([]);
  const [late, setLate] = useState<string[]>([]);
  const [holdingId, setHoldingId] = useState<string | null>(null);
  const [activePreset, setActivePreset] = useState<string | null>(null);

  const totalSlots = frontCount + backCount;

  const memberMap = useMemo(() => {
    const map = new Map<string, FormationMember>();
    members.forEach((m) => map.set(m.user_id, m));
    return map;
  }, [members]);

  const nameOf = (id: string) => {
    if (!id || isAnonymousSlotId(id)) return ANONYMOUS_PLAYER_NAME;
    return memberMap.get(id)?.full_name || '선수';
  };

  useEffect(() => {
    if (!visible) return;
    const nextFront = clampLineCount(initial?.frontCount, 3);
    const nextBack = clampLineCount(initial?.backCount, 3);
    const courtIds = buildSlots(initial?.court || [], nextFront + nextBack);
    const used = new Set(courtIds.filter((id) => id && !isAnonymousSlotId(id)));
    (initial?.bench || []).forEach((id) => used.add(id));
    (initial?.late || []).forEach((id) => used.add(id));

    const leftover = members.map((m) => m.user_id).filter((id) => !used.has(id));
    setFrontCount(nextFront);
    setBackCount(nextBack);
    setCourt(courtIds);
    setBench(uniqueKeepOrder(initial?.bench || []));
    setLate(uniqueKeepOrder([...(initial?.late || []), ...leftover]));
    setHoldingId(null);
    setActivePreset(null);
  }, [visible, members, initial]);

  const resizeCourt = (nextFront: number, nextBack: number) => {
    const nextTotal = nextFront + nextBack;
    const overflow = court.filter((id) => id && !isAnonymousSlotId(id)).slice(nextTotal);
    setCourt(buildSlots(court, nextTotal));
    if (overflow.length > 0) setBench((prev) => uniqueKeepOrder([...overflow, ...prev]));
    setFrontCount(nextFront);
    setBackCount(nextBack);
    setHoldingId(null);
  };

  const changeLine = (row: 'front' | 'back', delta: number) => {
    if (row === 'front') {
      const next = clampLineCount(frontCount + delta, frontCount);
      if (next !== frontCount) resizeCourt(next, backCount);
    } else {
      const next = clampLineCount(backCount + delta, backCount);
      if (next !== backCount) resizeCourt(frontCount, next);
    }
    setActivePreset(null);
  };

  const removeFromAll = (id: string) => {
    return {
      court: court.map((slot) => (slot === id ? makeAnonSlotId(court.indexOf(slot)) : slot)),
      bench: bench.filter((x) => x !== id),
      late: late.filter((x) => x !== id),
    };
  };

  const placeOnCourt = (slotIndex: number, playerId: string) => {
    const occupant = court[slotIndex];
    const stripped = removeFromAll(playerId);
    const nextCourt = [...stripped.court];
    if (occupant && !isAnonymousSlotId(occupant) && occupant !== playerId) {
      stripped.bench = uniqueKeepOrder([occupant, ...stripped.bench]);
    }
    nextCourt[slotIndex] = playerId;
    setCourt(nextCourt);
    setBench(stripped.bench);
    setLate(stripped.late);
    setHoldingId(null);
  };

  const assignDuty = (playerId: string, duty: Duty) => {
    if (isAnonymousSlotId(playerId)) return;
    const stripped = removeFromAll(playerId);
    if (duty === 'court') {
      const emptyIdx = stripped.court.findIndex((id) => !id || isAnonymousSlotId(id));
      if (emptyIdx >= 0) stripped.court[emptyIdx] = playerId;
      else stripped.bench = uniqueKeepOrder([playerId, ...stripped.bench]);
    } else if (duty === 'bench') {
      stripped.bench = uniqueKeepOrder([...stripped.bench, playerId]);
    } else {
      stripped.late = uniqueKeepOrder([...stripped.late, playerId]);
    }
    setCourt(stripped.court);
    setBench(stripped.bench);
    setLate(stripped.late);
    setHoldingId(null);
  };

  const handleSlotPress = (slotIndex: number) => {
    const occupant = court[slotIndex];
    if (holdingId && !isAnonymousSlotId(holdingId)) {
      placeOnCourt(slotIndex, holdingId);
      return;
    }
    if (occupant && !isAnonymousSlotId(occupant)) setHoldingId(occupant);
  };

  const handlePlayerPress = (id: string) => {
    if (isAnonymousSlotId(id)) {
      setHoldingId(null);
      return;
    }
    if (holdingId === id) {
      setHoldingId(null);
      return;
    }
    if (holdingId) {
      const fromIdx = court.findIndex((x) => x === holdingId);
      const toIdx = court.findIndex((x) => x === id);
      if (fromIdx >= 0 && toIdx >= 0) {
        const next = [...court];
        next[fromIdx] = id;
        next[toIdx] = holdingId;
        setCourt(next);
        setHoldingId(null);
        return;
      }
      if (fromIdx >= 0) {
        placeOnCourt(fromIdx, id);
        return;
      }
    }
    setHoldingId(id);
  };

  const applyPreset = (preset: (typeof PRESETS)[number]) => {
    const pool = members.map((m) => m.user_id);
    const g1 = pool.slice(0, preset.groups[0]);
    const g2 = pool.slice(preset.groups[0], preset.groups[0] + preset.groups[1]);
    const g3 = pool.slice(preset.groups[0] + preset.groups[1], preset.groups[0] + preset.groups[1] + preset.groups[2]);
    const rest = pool.slice(preset.groups[0] + preset.groups[1] + preset.groups[2]);

    const nextFront = preset.front;
    const nextBack = preset.back;
    const courtIds = buildSlots([...g1, ...g2], nextFront + nextBack);
    const used = new Set(courtIds.filter((id) => !isAnonymousSlotId(id)));
    const waitPool = [...g3, ...rest].filter((id) => !used.has(id));

    setFrontCount(nextFront);
    setBackCount(nextBack);
    setCourt(courtIds);
    if (preset.id === '3-2-4') {
      setBench(waitPool.slice(0, 2));
      setLate(uniqueKeepOrder(waitPool.slice(2)));
    } else {
      setBench(waitPool.slice(0, preset.groups[2] || 0));
      setLate(uniqueKeepOrder(waitPool.slice(preset.groups[2] || 0)));
    }
    setHoldingId(null);
    setActivePreset(preset.id);
  };

  const renderPlayerChip = (id: string, tone: Duty) => {
    const selected = holdingId === id;
    const anon = isAnonymousSlotId(id);
    return (
      <TouchableOpacity
        key={id}
        style={[
          styles.playerChip,
          tone === 'court' && styles.chipCourt,
          tone === 'bench' && styles.chipBench,
          tone === 'late' && styles.chipLate,
          anon && styles.chipAnon,
          selected && styles.chipHolding,
        ]}
        onPress={() => handlePlayerPress(id)}
        onLongPress={() => { if (!anon) assignDuty(id, tone === 'late' ? 'bench' : tone === 'bench' ? 'court' : 'bench'); }}
        delayLongPress={280}
      >
        <Text style={styles.playerChipText} numberOfLines={1}>
          {anon ? `👤 ${ANONYMOUS_PLAYER_NAME}` : nameOf(id)}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderSlotRow = (row: 'front' | 'back') => {
    const count = row === 'front' ? frontCount : backCount;
    const labels = lineSlotLabels(row, count);
    const offset = row === 'front' ? 0 : frontCount;
    return (
      <View style={styles.slotRow}>
        {labels.map((label, i) => {
          const idx = offset + i;
          const id = court[idx];
          const filled = !!id && !isAnonymousSlotId(id);
          return (
            <TouchableOpacity
              key={`${row}-${idx}`}
              style={[styles.slot, filled ? styles.slotFilled : styles.slotEmpty, holdingId && styles.slotDrop]}
              onPress={() => handleSlotPress(idx)}
            >
              <Text style={styles.slotPos}>{label}</Text>
              <Text style={styles.slotName} numberOfLines={1}>
                {filled ? nameOf(id) : ANONYMOUS_PLAYER_NAME}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  const unusedHint = holdingId
    ? `${nameOf(holdingId)} 선택됨 · 코트 칸 또는 대기/지각 영역을 누르세요`
    : '라인 인원(1~5)을 조절하세요. 빈 칸은 무기명 출전으로 득점/범실 귀속이 가능합니다.';

  const realCourtCount = court.filter((id) => id && !isAnonymousSlotId(id)).length;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.title}>🏐 코트 포메이션</Text>
          <Text style={styles.sub}>{teamName} · 라인별 1~5명 · 빈 칸은 무기명 출전</Text>

          <View style={styles.presetRow}>
            {PRESETS.map((p) => (
              <TouchableOpacity
                key={p.id}
                style={[styles.presetBtn, activePreset === p.id && styles.presetBtnActive]}
                onPress={() => applyPreset(p)}
              >
                <Text style={[styles.presetLabel, activePreset === p.id && styles.presetLabelActive]}>{p.label}</Text>
                <Text style={styles.presetHint}>{p.hint}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.lineCtrlRow}>
            <View style={styles.lineCtrl}>
              <Text style={styles.lineCtrlLabel}>전위 라인</Text>
              <View style={styles.stepper}>
                <TouchableOpacity style={styles.stepBtn} onPress={() => changeLine('front', -1)} disabled={frontCount <= LINE_MIN}>
                  <Text style={styles.stepBtnText}>−</Text>
                </TouchableOpacity>
                <Text style={styles.stepVal}>{frontCount}명</Text>
                <TouchableOpacity style={styles.stepBtn} onPress={() => changeLine('front', 1)} disabled={frontCount >= LINE_MAX}>
                  <Text style={styles.stepBtnText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.lineCtrl}>
              <Text style={styles.lineCtrlLabel}>후위 라인</Text>
              <View style={styles.stepper}>
                <TouchableOpacity style={styles.stepBtn} onPress={() => changeLine('back', -1)} disabled={backCount <= LINE_MIN}>
                  <Text style={styles.stepBtnText}>−</Text>
                </TouchableOpacity>
                <Text style={styles.stepVal}>{backCount}명</Text>
                <TouchableOpacity style={styles.stepBtn} onPress={() => changeLine('back', 1)} disabled={backCount >= LINE_MAX}>
                  <Text style={styles.stepBtnText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <Text style={styles.holdHint}>{unusedHint}</Text>

          <View style={styles.court}>
            <Text style={styles.netLabel}>━━━━ 네트 ━━━━</Text>
            {renderSlotRow('front')}
            {renderSlotRow('back')}
          </View>

          <ScrollView style={styles.lists} showsVerticalScrollIndicator={false}>
            <View style={styles.dutyBlock}>
              <View style={styles.dutyHeader}>
                <Text style={styles.dutyTitle}>🔵 출전 ({realCourtCount}/{totalSlots}) · 무기명 {totalSlots - realCourtCount}</Text>
                {holdingId ? (
                  <TouchableOpacity onPress={() => assignDuty(holdingId, 'court')}>
                    <Text style={styles.dutyAction}>여기로 배치</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              <View style={styles.chipWrap}>
                {court.map((id, idx) => renderPlayerChip(id || makeAnonSlotId(idx), 'court'))}
              </View>
            </View>

            <View style={styles.dutyBlock}>
              <View style={styles.dutyHeader}>
                <Text style={[styles.dutyTitle, { color: '#D97706' }]}>⚪ 대기 ({bench.length})</Text>
                {holdingId ? (
                  <TouchableOpacity onPress={() => assignDuty(holdingId, 'bench')}>
                    <Text style={styles.dutyAction}>대기로</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              <View style={styles.chipWrap}>
                {bench.filter((id) => listHasUser(bench, id)).map((id) => renderPlayerChip(id, 'bench'))}
                {bench.length === 0 ? <Text style={styles.emptyDuty}>대기 선수 없음</Text> : null}
              </View>
            </View>

            <View style={styles.dutyBlock}>
              <View style={styles.dutyHeader}>
                <Text style={[styles.dutyTitle, { color: '#64748B' }]}>⏰ 지각생 ({late.length})</Text>
                {holdingId ? (
                  <TouchableOpacity onPress={() => assignDuty(holdingId, 'late')}>
                    <Text style={styles.dutyAction}>지각으로</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              <View style={styles.chipWrap}>
                {late.map((id) => renderPlayerChip(id, 'late'))}
                {late.length === 0 ? <Text style={styles.emptyDuty}>지각 처리된 선수 없음</Text> : null}
              </View>
            </View>
          </ScrollView>

          <View style={styles.btnRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelText}>닫기</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.saveBtn}
              onPress={() => onSave({
                court: buildSlots(court, totalSlots),
                bench,
                late,
                frontCount,
                backCount,
              })}
            >
              <Text style={styles.saveText}>이 세트 포메이션 저장</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'center', alignItems: 'center', padding: 12 },
  sheet: { backgroundColor: '#0F172A', borderRadius: 18, padding: 14, width: 560, maxWidth: '100%', maxHeight: '96%', borderWidth: 1, borderColor: '#334155' },
  title: { fontSize: 16, fontWeight: '900', color: '#F8FAFC', textAlign: 'center' },
  sub: { fontSize: 11, color: '#94A3B8', textAlign: 'center', marginTop: 2, marginBottom: 8, fontWeight: '700' },
  presetRow: { flexDirection: 'row', gap: 6, marginBottom: 8 },
  presetBtn: { flex: 1, backgroundColor: '#1E293B', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 6, borderWidth: 1, borderColor: '#334155', alignItems: 'center' },
  presetBtnActive: { backgroundColor: '#1D4ED8', borderColor: '#60A5FA' },
  presetLabel: { fontSize: 13, fontWeight: '900', color: '#E2E8F0' },
  presetLabelActive: { color: '#FFFFFF' },
  presetHint: { fontSize: 8.5, color: '#94A3B8', fontWeight: '700', marginTop: 2, textAlign: 'center' },
  lineCtrlRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  lineCtrl: { flex: 1, backgroundColor: '#1E293B', borderRadius: 10, padding: 8, borderWidth: 1, borderColor: '#334155', alignItems: 'center' },
  lineCtrlLabel: { fontSize: 11, fontWeight: '800', color: '#CBD5E1', marginBottom: 6 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#334155', alignItems: 'center', justifyContent: 'center' },
  stepBtnText: { color: '#FFFFFF', fontSize: 18, fontWeight: '900' },
  stepVal: { minWidth: 36, textAlign: 'center', color: '#F8FAFC', fontSize: 14, fontWeight: '900' },
  holdHint: { fontSize: 11, color: '#38BDF8', fontWeight: '800', textAlign: 'center', marginBottom: 8 },
  court: { backgroundColor: '#14532D', borderRadius: 12, padding: 8, borderWidth: 2, borderColor: '#86EFAC', marginBottom: 8 },
  netLabel: { textAlign: 'center', color: '#FDE68A', fontWeight: '900', fontSize: 11, marginBottom: 6, letterSpacing: 1 },
  slotRow: { flexDirection: 'row', gap: 6, marginBottom: 6 },
  slot: { flex: 1, minHeight: 52, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  slotEmpty: { backgroundColor: 'rgba(15,23,42,0.35)', borderColor: 'rgba(253,230,138,0.55)', borderStyle: 'dashed' },
  slotFilled: { backgroundColor: '#0F172A', borderColor: '#F8FAFC' },
  slotDrop: { borderColor: '#FDE68A' },
  slotPos: { fontSize: 9, fontWeight: '800', color: '#BBF7D0', marginBottom: 2 },
  slotName: { fontSize: 11, fontWeight: '900', color: '#F8FAFC' },
  lists: { maxHeight: 150 },
  dutyBlock: { backgroundColor: '#1E293B', borderRadius: 10, padding: 8, marginBottom: 6, borderWidth: 1, borderColor: '#334155' },
  dutyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  dutyTitle: { fontSize: 12, fontWeight: '900', color: '#38BDF8' },
  dutyAction: { fontSize: 11, fontWeight: '800', color: '#FDE68A' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  playerChip: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, borderWidth: 1, minWidth: 72, alignItems: 'center' },
  chipCourt: { backgroundColor: '#0C4A6E', borderColor: '#38BDF8' },
  chipBench: { backgroundColor: '#78350F', borderColor: '#FBBF24' },
  chipLate: { backgroundColor: '#334155', borderColor: '#64748B' },
  chipAnon: { backgroundColor: '#1E293B', borderColor: '#FDE68A', borderStyle: 'dashed' },
  chipHolding: { borderColor: '#FDE68A', borderWidth: 2 },
  playerChipText: { color: '#F8FAFC', fontSize: 12, fontWeight: '800' },
  emptyDuty: { fontSize: 11, color: '#64748B', fontWeight: '700' },
  btnRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  cancelBtn: { flex: 1, backgroundColor: '#334155', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  cancelText: { color: '#CBD5E1', fontWeight: '800', fontSize: 13 },
  saveBtn: { flex: 2, backgroundColor: '#2563EB', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  saveText: { color: '#FFFFFF', fontWeight: '900', fontSize: 13 },
});
