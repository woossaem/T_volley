import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import CourtGrid from './CourtGrid';
import {
  ANONYMOUS_PLAYER_NAME,
  clampLineCount,
  DEFAULT_LINE_COUNT,
  isAnonymousSlotId,
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
  const [frontCount, setFrontCount] = useState(DEFAULT_LINE_COUNT);
  const [middleCount, setMiddleCount] = useState(DEFAULT_LINE_COUNT);
  const [backCount, setBackCount] = useState(DEFAULT_LINE_COUNT);
  const [court, setCourt] = useState<string[]>(buildSlots([], 9));
  const [bench, setBench] = useState<string[]>([]);
  const [late, setLate] = useState<string[]>([]);
  const [holdingId, setHoldingId] = useState<string | null>(null);

  const totalSlots = frontCount + middleCount + backCount;

  const memberMap = useMemo(() => {
    const map = new Map<string, FormationMember>();
    members.forEach((m) => map.set(m.user_id, m));
    return map;
  }, [members]);

  const nameOf = (id: string) => {
    if (!id || isAnonymousSlotId(id)) return ANONYMOUS_PLAYER_NAME;
    return memberMap.get(id)?.full_name || '선수';
  };

  const courtPlayers = court.map((id, idx) => ({
    user_id: id || makeAnonSlotId(idx),
    full_name: nameOf(id),
  }));

  useEffect(() => {
    if (!visible) return;
    const nextFront = clampLineCount(initial?.frontCount, DEFAULT_LINE_COUNT);
    const nextMiddle = clampLineCount(initial?.middleCount, DEFAULT_LINE_COUNT);
    const nextBack = clampLineCount(initial?.backCount, DEFAULT_LINE_COUNT);
    const courtIds = buildSlots(initial?.court || [], nextFront + nextMiddle + nextBack);
    const used = new Set(courtIds.filter((id) => id && !isAnonymousSlotId(id)));
    (initial?.bench || []).forEach((id) => used.add(id));
    (initial?.late || []).forEach((id) => used.add(id));

    const leftover = members.map((m) => m.user_id).filter((id) => !used.has(id));
    setFrontCount(nextFront);
    setMiddleCount(nextMiddle);
    setBackCount(nextBack);
    setCourt(courtIds);
    setBench(uniqueKeepOrder(initial?.bench || []));
    setLate(uniqueKeepOrder([...(initial?.late || []), ...leftover]));
    setHoldingId(null);
  }, [visible, members, initial]);

  const resizeCourt = (nextFront: number, nextMiddle: number, nextBack: number) => {
    const nextTotal = nextFront + nextMiddle + nextBack;
    const overflow = court.filter((id) => id && !isAnonymousSlotId(id)).slice(nextTotal);
    setCourt(buildSlots(court, nextTotal));
    if (overflow.length > 0) setBench((prev) => uniqueKeepOrder([...overflow, ...prev]));
    setFrontCount(nextFront);
    setMiddleCount(nextMiddle);
    setBackCount(nextBack);
    setHoldingId(null);
  };

  const changeLine = (row: 'front' | 'middle' | 'back', delta: number) => {
    if (row === 'front') {
      const next = clampLineCount(frontCount + delta, frontCount);
      if (next !== frontCount) resizeCourt(next, middleCount, backCount);
    } else if (row === 'middle') {
      const next = clampLineCount(middleCount + delta, middleCount);
      if (next !== middleCount) resizeCourt(frontCount, next, backCount);
    } else {
      const next = clampLineCount(backCount + delta, backCount);
      if (next !== backCount) resizeCourt(frontCount, middleCount, next);
    }
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

  const handleSlotPress = (_player: { user_id: string }, slotIndex: number) => {
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

  const unusedHint = holdingId
    ? `${nameOf(holdingId)} 선택됨 · 대기 선수를 터치하면 1:1 교체됩니다`
    : '코트 위 선수를 터치한 뒤 대기 선수를 터치하면 즉시 교체됩니다.';

  const realCourtCount = court.filter((id) => id && !isAnonymousSlotId(id)).length;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.title}>🏐 3줄 코트 포메이션</Text>
          <Text style={styles.sub}>{teamName} · 전위 3 / 중위 3 / 후위 3 · 출전 터치 ➔ 대기 터치</Text>

          <View style={styles.lineCtrlRow}>
            {([
              { key: 'front' as const, label: '전위', value: frontCount },
              { key: 'middle' as const, label: '중위', value: middleCount },
              { key: 'back' as const, label: '후위', value: backCount },
            ]).map((row) => (
              <View key={row.key} style={styles.lineCtrl}>
                <Text style={styles.lineCtrlLabel}>{row.label}</Text>
                <View style={styles.stepper}>
                  <TouchableOpacity style={styles.stepBtn} onPress={() => changeLine(row.key, -1)} disabled={row.value <= LINE_MIN}>
                    <Text style={styles.stepBtnText}>−</Text>
                  </TouchableOpacity>
                  <Text style={styles.stepVal}>{row.value}</Text>
                  <TouchableOpacity style={styles.stepBtn} onPress={() => changeLine(row.key, 1)} disabled={row.value >= LINE_MAX}>
                    <Text style={styles.stepBtnText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>

          <Text style={styles.holdHint}>{unusedHint}</Text>

          <View style={styles.courtWrap}>
            <CourtGrid
              court={courtPlayers}
              frontCount={frontCount}
              middleCount={middleCount}
              backCount={backCount}
              compact
              holding={!!holdingId}
              selectedId={holdingId}
              onSlotPress={handleSlotPress}
            />
            <Text style={styles.courtMeta}>출전 {realCourtCount}/{totalSlots} · 무기명 {totalSlots - realCourtCount}</Text>
          </View>

          <View style={styles.benchBlock}>
            <View style={styles.benchHead}>
              <Text style={styles.benchTitle}>⚪ 대기 ({bench.length})</Text>
              {holdingId ? (
                <TouchableOpacity onPress={() => assignDuty(holdingId, 'bench')}>
                  <Text style={styles.dutyAction}>대기로</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <View style={styles.benchChipWrap}>
              {bench.filter((id) => listHasUser(bench, id)).map((id) => renderPlayerChip(id, 'bench'))}
              {bench.length === 0 ? <Text style={styles.emptyDuty}>대기 선수 없음</Text> : null}
            </View>
            <View style={[styles.benchHead, { marginTop: 4 }]}>
              <Text style={[styles.benchTitle, { color: '#94A3B8' }]}>⏰ 지각 ({late.length})</Text>
              {holdingId ? (
                <TouchableOpacity onPress={() => assignDuty(holdingId, 'late')}>
                  <Text style={styles.dutyAction}>지각으로</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <View style={styles.benchChipWrap}>
              {late.map((id) => renderPlayerChip(id, 'late'))}
              {late.length === 0 ? <Text style={styles.emptyDuty}>지각 없음</Text> : null}
            </View>
          </View>

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
                middleCount,
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
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'center', alignItems: 'center', padding: 6 },
  sheet: { backgroundColor: '#0F172A', borderRadius: 14, padding: 6, width: 640, maxWidth: '100%', maxHeight: '96%', borderWidth: 1, borderColor: '#334155' },
  title: { fontSize: 14, fontWeight: '900', color: '#F8FAFC', textAlign: 'center' },
  sub: { fontSize: 10, color: '#94A3B8', textAlign: 'center', marginTop: 1, marginBottom: 4, fontWeight: '700' },
  lineCtrlRow: { flexDirection: 'row', gap: 4, marginBottom: 4 },
  lineCtrl: { flex: 1, backgroundColor: '#1E293B', borderRadius: 8, padding: 4, borderWidth: 1, borderColor: '#334155', alignItems: 'center' },
  lineCtrlLabel: { fontSize: 9, fontWeight: '800', color: '#CBD5E1', marginBottom: 2 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stepBtn: { width: 24, height: 24, borderRadius: 6, backgroundColor: '#334155', alignItems: 'center', justifyContent: 'center' },
  stepBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  stepVal: { minWidth: 16, textAlign: 'center', color: '#F8FAFC', fontSize: 12, fontWeight: '900' },
  holdHint: { fontSize: 10, color: '#38BDF8', fontWeight: '800', textAlign: 'center', marginBottom: 4 },
  courtWrap: { marginVertical: 2 },
  courtMeta: { fontSize: 9, fontWeight: '700', color: '#94A3B8', textAlign: 'center', marginTop: 2 },
  benchBlock: { backgroundColor: '#1E293B', borderRadius: 10, padding: 6, borderWidth: 1, borderColor: '#334155', marginTop: 2 },
  benchHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  benchTitle: { fontSize: 11, fontWeight: '900', color: '#FBBF24' },
  benchChipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  dutyAction: { fontSize: 10, fontWeight: '800', color: '#FDE68A' },
  playerChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
  chipCourt: { backgroundColor: '#0C4A6E', borderColor: '#38BDF8' },
  chipBench: { backgroundColor: '#78350F', borderColor: '#FBBF24' },
  chipLate: { backgroundColor: '#334155', borderColor: '#64748B' },
  chipAnon: { backgroundColor: '#1E293B', borderColor: '#FDE68A', borderStyle: 'dashed' },
  chipHolding: { borderColor: '#FDE68A', borderWidth: 2 },
  playerChipText: { color: '#F8FAFC', fontSize: 11, fontWeight: '800' },
  emptyDuty: { fontSize: 10, color: '#64748B', fontWeight: '700' },
  btnRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  cancelBtn: { flex: 1, backgroundColor: '#334155', paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  cancelText: { color: '#CBD5E1', fontWeight: '800', fontSize: 13 },
  saveBtn: { flex: 2, backgroundColor: '#2563EB', paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  saveText: { color: '#FFFFFF', fontWeight: '900', fontSize: 13 },
});
