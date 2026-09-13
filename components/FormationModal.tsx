import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView } from 'react-native';
import CourtGrid from './CourtGrid';
import {
  assignedUserId,
  clampLineCount,
  DEFAULT_LINE_COUNT,
  displaySlotPlayerName,
  fillEmptySlotsWithGuests,
  isAnonymousSlotId,
  isTempSlotId,
  LINE_MAX,
  LINE_MIN,
  lineSlotLabels,
  type SetFormation,
} from '../lib/roster';
import { getSafeDisplayName } from '../lib/utils';

export interface FormationMember {
  user_id: string;
  full_name: string;
}

export interface FormationSideInput {
  teamName: string;
  members: FormationMember[];
  initial: SetFormation;
  canEdit: boolean;
}

type Duty = 'court' | 'bench' | 'late';
type SideKey = 'host' | 'away';

/** 코트 슬롯 터치 후 분기: 빈자리 투입 / 1:1 교체 / 자리 비우기 메뉴 */
type SlotIntent =
  | { type: 'menu'; side: SideKey; index: number }
  | { type: 'fill'; side: SideKey; index: number }
  | { type: 'swap'; side: SideKey; index: number };

interface Props {
  visible: boolean;
  teamName: string;
  members: FormationMember[];
  initial: SetFormation;
  onClose: () => void;
  onSave: (formation: SetFormation) => void;
  isSingleRecorder?: boolean;
  hostSide?: FormationSideInput;
  awaySide?: FormationSideInput;
  onSaveDual?: (host: SetFormation, away: SetFormation) => void;
  /** 매치 전역에서 이미 쓰인 ID (게스트 채번 충돌 방지) */
  usedMatchIds?: Array<string | null | undefined>;
  /** 기록자 전광판의 현재 코트 방향. 있으면 해당 팀만 세로네트 뷰로 표시 */
  courtSide?: 'left' | 'right';
  /** 상대 팀 코트에 이미 배치된 ID. 대기 벤치 섞임 차단 */
  lockedOutIds?: Array<string | null | undefined>;
}

interface SideState {
  frontCount: number;
  middleCount: number;
  backCount: number;
  /** 각 포지션의 assignedUserId. null = 빈자리 */
  court: Array<string | null>;
  bench: string[];
  late: string[];
}

function uniqueKeepOrder(ids: Array<string | null | undefined>) {
  const seen = new Set<string>();
  return ids.filter((id): id is string => {
    const real = assignedUserId(id);
    if (!real || seen.has(real)) return false;
    seen.add(real);
    return true;
  });
}

/** 슬롯 인덱스를 유지한 채 빈자리를 null로 보존 (압축하지 않음) */
function padCourtSlots(ids: Array<string | null | undefined>, total: number): Array<string | null> {
  const next: Array<string | null> = [];
  for (let i = 0; i < total; i += 1) {
    next.push(assignedUserId(ids[i] ?? null));
  }
  return next;
}

function onCourtSet(court: Array<string | null>): Set<string> {
  return new Set(uniqueKeepOrder(court));
}

function syncDuties(st: SideState, members: FormationMember[]): SideState {
  const used = onCourtSet(st.court);
  const memberIds = uniqueKeepOrder(members.map((m) => m.user_id));
  const late = uniqueKeepOrder(st.late.filter((id) => !used.has(id)));
  const lateSet = new Set(late);
  const bench = memberIds.filter((id) => !used.has(id) && !lateSet.has(id));
  return { ...st, bench, late };
}

function hydrateSide(
  members: FormationMember[],
  initial: SetFormation,
  usedIds: Array<string | null | undefined> = [],
): SideState {
  const nextFront = clampLineCount(initial?.frontCount, DEFAULT_LINE_COUNT);
  const nextMiddle = clampLineCount(initial?.middleCount, DEFAULT_LINE_COUNT);
  const nextBack = clampLineCount(initial?.backCount, DEFAULT_LINE_COUNT);
  const padded = padCourtSlots(initial?.court || [], nextFront + nextMiddle + nextBack);
  const court = fillEmptySlotsWithGuests(
    padded,
    [...usedIds, ...(initial?.bench || []), ...(initial?.late || [])],
    nextFront + nextMiddle + nextBack,
  );
  return syncDuties(
    {
      frontCount: nextFront,
      middleCount: nextMiddle,
      backCount: nextBack,
      court,
      bench: uniqueKeepOrder(initial?.bench || []),
      late: uniqueKeepOrder(initial?.late || []),
    },
    members,
  );
}

const EMPTY_SIDE: SideState = {
  frontCount: DEFAULT_LINE_COUNT,
  middleCount: DEFAULT_LINE_COUNT,
  backCount: DEFAULT_LINE_COUNT,
  court: padCourtSlots([], 9),
  bench: [],
  late: [],
};

function slotLabelOf(st: SideState, index: number): string {
  const { frontCount, middleCount, backCount } = st;
  if (index < frontCount) return lineSlotLabels('front', frontCount)[index] || '전위';
  if (index < frontCount + middleCount) {
    return lineSlotLabels('middle', middleCount)[index - frontCount] || '중위';
  }
  return lineSlotLabels('back', backCount)[index - frontCount - middleCount] || '후위';
}

export default function FormationModal({
  visible,
  teamName,
  members,
  initial,
  onClose,
  onSave,
  isSingleRecorder = false,
  hostSide,
  awaySide,
  onSaveDual,
  usedMatchIds = [],
  courtSide,
  lockedOutIds = [],
}: Props) {
  const dual = !!(hostSide && awaySide) && !courtSide;
  const [hostState, setHostState] = useState<SideState>(EMPTY_SIDE);
  const [awayState, setAwayState] = useState<SideState>(EMPTY_SIDE);
  const [holding, setHolding] = useState<{ side: SideKey; id: string } | null>(null);
  const [intent, setIntent] = useState<SlotIntent | null>(null);

  const hostCanEdit = dual ? (isSingleRecorder || !!hostSide?.canEdit) : true;
  const awayCanEdit = dual ? (isSingleRecorder || !!awaySide?.canEdit) : true;

  const hostMembers = dual ? hostSide?.members || [] : members;
  const awayMembers = awaySide?.members || [];

  const hostMemberMap = useMemo(() => {
    const map = new Map<string, FormationMember>();
    hostMembers.forEach((m) => map.set(m.user_id, m));
    return map;
  }, [hostMembers]);

  const awayMemberMap = useMemo(() => {
    const map = new Map<string, FormationMember>();
    awayMembers.forEach((m) => map.set(m.user_id, m));
    return map;
  }, [awayMembers]);

  useEffect(() => {
    if (!visible) return;
    if (dual && hostSide && awaySide) {
      const hostHydrated = hydrateSide(hostSide.members, hostSide.initial, [
        ...usedMatchIds,
        ...(awaySide.initial?.court || []),
        ...(awaySide.initial?.bench || []),
        ...(awaySide.initial?.late || []),
      ]);
      const awayHydrated = hydrateSide(awaySide.members, awaySide.initial, [
        ...usedMatchIds,
        ...hostHydrated.court,
        ...(hostSide.initial?.bench || []),
        ...(hostSide.initial?.late || []),
      ]);
      setHostState(hostHydrated);
      setAwayState(awayHydrated);
    } else {
      setHostState(hydrateSide(members, initial, usedMatchIds));
      setAwayState(EMPTY_SIDE);
    }
    setHolding(null);
    setIntent(null);
  }, [visible]);

  const nameOf = (side: SideKey, id: string | null) => {
    const real = assignedUserId(id);
    if (!real) return '';
    if (isTempSlotId(real)) return displaySlotPlayerName(real);
    const map = side === 'host' ? hostMemberMap : awayMemberMap;
    return getSafeDisplayName(map.get(real) || hostMemberMap.get(real) || awayMemberMap.get(real));
  };

  const getState = (side: SideKey) => (side === 'host' ? hostState : awayState);
  const sideMembersOf = (side: SideKey) => (side === 'host' ? hostMembers : awayMembers);

  const setState = (side: SideKey, next: SideState | ((prev: SideState) => SideState)) => {
    const apply = (prev: SideState) => {
      const raw = typeof next === 'function' ? next(prev) : next;
      return syncDuties(raw, sideMembersOf(side));
    };
    if (side === 'host') setHostState(apply);
    else setAwayState(apply);
  };

  const canEditSide = (side: SideKey) => (side === 'host' ? hostCanEdit : awayCanEdit);

  /** 대기 로스터 SSOT: 전체 명단 − A/B 코트 9칸에 배치된(null이 아닌) 인원 */
  const lockedOutSet = useMemo(() => {
    const next = new Set<string>();
    lockedOutIds.forEach((id) => {
      const real = assignedUserId(id);
      if (real) next.add(real);
    });
    return next;
  }, [lockedOutIds]);

  const assignedUserIds = useMemo(() => {
    const teamACourtSlots = hostState.court.map((id) => assignedUserId(id));
    const teamBCourtSlots = awayState.court.map((id) => assignedUserId(id));
    return new Set([
      ...teamACourtSlots.filter((id): id is string => !!id),
      ...teamBCourtSlots.filter((id): id is string => !!id),
    ]);
  }, [hostState.court, awayState.court]);

  const allPlayers = useMemo(() => {
    const seen = new Set<string>();
    const list: FormationMember[] = [];
    [...hostMembers, ...awayMembers].forEach((p) => {
      if (!p?.user_id || seen.has(p.user_id)) return;
      seen.add(p.user_id);
      list.push(p);
    });
    return list;
  }, [hostMembers, awayMembers]);

  const availableBench = useMemo(
    () => allPlayers.filter((p) => !assignedUserIds.has(p.user_id)),
    [allPlayers, assignedUserIds],
  );

  const benchRoster = (side: SideKey) => {
    if (dual) {
      return uniqueKeepOrder(sideMembersOf(side).map((m) => m.user_id).filter((id) => !assignedUserIds.has(id) && !lockedOutSet.has(id)));
    }
    const used = onCourtSet(getState(side).court);
    return uniqueKeepOrder(sideMembersOf(side).map((m) => m.user_id).filter((id) => !used.has(id) && !lockedOutSet.has(id)));
  };

  const courtPlayers = (side: SideKey) =>
    getState(side).court.map((id) => {
      const real = assignedUserId(id);
      return {
        user_id: real,
        full_name: real ? nameOf(side, real) : '',
      };
    });

  const resizeCourt = (side: SideKey, nextFront: number, nextMiddle: number, nextBack: number) => {
    if (!canEditSide(side)) return;
    setState(side, (prev) => {
      const nextTotal = nextFront + nextMiddle + nextBack;
      return {
        ...prev,
        frontCount: nextFront,
        middleCount: nextMiddle,
        backCount: nextBack,
        court: padCourtSlots(prev.court, nextTotal),
      };
    });
    setHolding(null);
    setIntent(null);
  };

  const changeLine = (side: SideKey, row: 'front' | 'middle' | 'back', delta: number) => {
    const st = getState(side);
    if (row === 'front') {
      const next = clampLineCount(st.frontCount + delta, st.frontCount);
      if (next !== st.frontCount) resizeCourt(side, next, st.middleCount, st.backCount);
    } else if (row === 'middle') {
      const next = clampLineCount(st.middleCount + delta, st.middleCount);
      if (next !== st.middleCount) resizeCourt(side, st.frontCount, next, st.backCount);
    } else {
      const next = clampLineCount(st.backCount + delta, st.backCount);
      if (next !== st.backCount) resizeCourt(side, st.frontCount, st.middleCount, next);
    }
  };

  const removeFromAll = (st: SideState, id: string): Pick<SideState, 'court' | 'bench' | 'late'> => ({
    court: st.court.map((slot) => (slot === id ? null : slot)),
    bench: st.bench.filter((x) => x !== id),
    late: st.late.filter((x) => x !== id),
  });

  const placeOnCourt = (side: SideKey, slotIndex: number, playerId: string) => {
    if (!canEditSide(side)) return;
    const real = assignedUserId(playerId);
    if (!real) return;
    const applyPlace = (prev: SideState, isTarget: boolean, members: FormationMember[]) => {
      const stripped = removeFromAll(prev, real);
      if (isTarget) {
        const nextCourt = [...stripped.court];
        nextCourt[slotIndex] = real;
        stripped.court = nextCourt;
      }
      return syncDuties({ ...prev, court: stripped.court, bench: stripped.bench, late: stripped.late }, members);
    };
    setHostState((prev) => applyPlace(prev, side === 'host', hostMembers));
    setAwayState((prev) => applyPlace(prev, side === 'away', awayMembers));
    setHolding(null);
    setIntent(null);
  };

  const vacateSlot = (side: SideKey, slotIndex: number) => {
    if (!canEditSide(side)) return;
    setState(side, (prev) => {
      const nextCourt = [...prev.court];
      nextCourt[slotIndex] = null;
      return { ...prev, court: nextCourt };
    });
    setHolding(null);
    setIntent(null);
  };

  const assignDuty = (side: SideKey, playerId: string, duty: Duty) => {
    if (!canEditSide(side) || isAnonymousSlotId(playerId)) return;
    setState(side, (prev) => {
      const stripped = removeFromAll(prev, playerId);
      if (duty === 'court') {
        const emptyIdx = stripped.court.findIndex((id) => assignedUserId(id) === null);
        if (emptyIdx >= 0) stripped.court[emptyIdx] = playerId;
      } else if (duty === 'late') {
        stripped.late = uniqueKeepOrder([...stripped.late, playerId]);
      }
      return { ...prev, court: stripped.court, bench: stripped.bench, late: stripped.late };
    });
    setHolding(null);
    setIntent(null);
  };

  const handleSlotPress = (side: SideKey, _player: { user_id: string | null }, slotIndex: number) => {
    if (!canEditSide(side)) return;
    const occupant = assignedUserId(getState(side).court[slotIndex]);

    if (holding && assignedUserId(holding.id)) {
      placeOnCourt(side, slotIndex, holding.id);
      return;
    }

    if (!occupant) {
      setIntent({ type: 'fill', side, index: slotIndex });
      setHolding(null);
      return;
    }

    setIntent({ type: 'menu', side, index: slotIndex });
    setHolding(null);
  };

  const handlePlayerPress = (side: SideKey, id: string) => {
    if (!canEditSide(side) && !dual) return;
    const real = assignedUserId(id);
    if (!real) {
      setHolding(null);
      return;
    }
    if (intent && (intent.type === 'fill' || intent.type === 'swap')) {
      placeOnCourt(intent.side, intent.index, real);
      return;
    }
    if (holding && holding.id === real) {
      setHolding(null);
      return;
    }
    setHolding({ side, id: real });
    setIntent(null);
  };

  const handleSharedBenchPress = (id: string) => {
    const real = assignedUserId(id);
    if (!real) {
      setHolding(null);
      return;
    }
    if (intent && (intent.type === 'fill' || intent.type === 'swap')) {
      placeOnCourt(intent.side, intent.index, real);
      return;
    }
    if (holding && holding.id === real) {
      setHolding(null);
      return;
    }
    if (!hostCanEdit && !awayCanEdit) return;
    setHolding({ side: hostCanEdit ? 'host' : 'away', id: real });
    setIntent(null);
  };

  const renderPlayerChip = (side: SideKey, id: string, tone: Duty) => {
    const selected = holding?.side === side && holding.id === id;
    const fillReady = intent?.side === side && (intent.type === 'fill' || intent.type === 'swap');
    const locked = !canEditSide(side);
    return (
      <TouchableOpacity
        key={`${side}-${id}`}
        style={[
          styles.playerChip,
          tone === 'court' && styles.chipCourt,
          tone === 'bench' && styles.chipBench,
          tone === 'late' && styles.chipLate,
          selected && styles.chipHolding,
          fillReady && styles.chipFillReady,
          locked && styles.chipLocked,
        ]}
        onPress={() => handlePlayerPress(side, id)}
        onLongPress={() => {
          if (!locked) assignDuty(side, id, tone === 'late' ? 'bench' : 'late');
        }}
        delayLongPress={280}
        disabled={locked}
      >
        <Text style={styles.playerChipText} numberOfLines={1}>
          {nameOf(side, id)}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderLineCtrls = (side: SideKey, order: 'front-first' | 'back-first' = 'front-first') => {
    const st = getState(side);
    const locked = !canEditSide(side);
    const rows = [
      { key: 'front' as const, label: '전위', value: st.frontCount },
      { key: 'middle' as const, label: '중위', value: st.middleCount },
      { key: 'back' as const, label: '후위', value: st.backCount },
    ];
    const ordered = order === 'back-first' ? [...rows].reverse() : rows;
    return (
      <View style={styles.lineCtrlRow}>
        {ordered.map((row) => (
          <View key={row.key} style={styles.lineCtrl}>
            <Text style={styles.lineCtrlLabel}>{row.label}</Text>
            <View style={styles.stepper}>
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() => changeLine(side, row.key, -1)}
                disabled={locked || row.value <= LINE_MIN}
              >
                <Text style={styles.stepBtnText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.stepVal}>{row.value}</Text>
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() => changeLine(side, row.key, 1)}
                disabled={locked || row.value >= LINE_MAX}
              >
                <Text style={styles.stepBtnText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </View>
    );
  };

  const renderBenchScroll = (side: SideKey, label: string) => {
    const st = getState(side);
    const locked = !canEditSide(side);
    const roster = benchRoster(side);
    const lateSet = new Set(st.late);
    return (
      <View style={styles.benchPane}>
        <View style={styles.benchHead}>
          <Text style={styles.benchTitle}>⚪ {label} 대기 ({roster.length})</Text>
          {holding?.side === side && !locked ? (
            <TouchableOpacity onPress={() => assignDuty(side, holding.id, 'bench')}>
              <Text style={styles.dutyAction}>대기로</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        <ScrollView
          style={styles.benchScroll}
          contentContainerStyle={styles.benchChipWrap}
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator
        >
          {roster.map((id) => renderPlayerChip(side, id, lateSet.has(id) ? 'late' : 'bench'))}
          {roster.length === 0 ? <Text style={styles.emptyDuty}>대기 선수 없음</Text> : null}
        </ScrollView>
      </View>
    );
  };

  const renderSharedBench = () => {
    const lateSet = new Set([...hostState.late, ...awayState.late]);
    const fillReady = !!(intent && (intent.type === 'fill' || intent.type === 'swap'));
    const locked = !hostCanEdit && !awayCanEdit;
    return (
      <View style={styles.benchPane}>
        <View style={styles.benchHead}>
          <Text style={styles.benchTitle}>⚪ 대기 벤치 ({availableBench.length})</Text>
        </View>
        <ScrollView
          style={styles.benchScroll}
          contentContainerStyle={styles.benchChipWrap}
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator
        >
          {availableBench.map((p) => {
            const selected = holding?.id === p.user_id;
            return (
              <TouchableOpacity
                key={`shared-bench-${p.user_id}`}
                style={[
                  styles.playerChip,
                  lateSet.has(p.user_id) ? styles.chipLate : styles.chipBench,
                  selected && styles.chipHolding,
                  fillReady && styles.chipFillReady,
                  locked && styles.chipLocked,
                ]}
                onPress={() => handleSharedBenchPress(p.user_id)}
                disabled={locked}
              >
                <Text style={styles.playerChipText} numberOfLines={1}>
                  {getSafeDisplayName(p)}
                </Text>
              </TouchableOpacity>
            );
          })}
          {availableBench.length === 0 ? <Text style={styles.emptyDuty}>대기 선수 없음</Text> : null}
        </ScrollView>
      </View>
    );
  };

  const toFormation = (st: SideState, extraUsed: Array<string | null | undefined> = []): SetFormation => {
    const total = st.frontCount + st.middleCount + st.backCount;
    return {
      court: fillEmptySlotsWithGuests(padCourtSlots(st.court, total), extraUsed, total),
      bench: st.bench,
      late: st.late,
      frontCount: st.frontCount,
      middleCount: st.middleCount,
      backCount: st.backCount,
    };
  };

  const targeting = intent && (intent.type === 'fill' || intent.type === 'swap') ? intent : null;

  let unusedHint = '빈자리를 터치해 투입하거나, 출전 선수를 터치해 교체/퇴장하세요.';
  if (targeting?.type === 'fill') {
    unusedHint = `${slotLabelOf(getState(targeting.side), targeting.index)} 빈자리 선택 · 대기 선수를 터치하면 즉시 투입됩니다`;
  } else if (targeting?.type === 'swap') {
    unusedHint = `${nameOf(targeting.side, getState(targeting.side).court[targeting.index])} 교체 · 대기 선수를 터치하면 1:1 교체됩니다`;
  } else if (holding) {
    unusedHint = `${nameOf(holding.side, holding.id)} 선택됨 · 코트 빈자리 또는 출전 슬롯을 터치하면 배치/교체됩니다`;
  }

  const hostTotal = hostState.frontCount + hostState.middleCount + hostState.backCount;
  const awayTotal = awayState.frontCount + awayState.middleCount + awayState.backCount;
  const hostReal = onCourtSet(hostState.court).size;
  const awayReal = onCourtSet(awayState.court).size;

  const menuState = intent?.type === 'menu' ? intent : null;
  const menuOccupant = menuState ? assignedUserId(getState(menuState.side).court[menuState.index]) : null;

  const highlightFor = (side: SideKey) =>
    targeting && targeting.side === side ? targeting.index : null;

  const renderCourtGrid = (side: SideKey, opts: {
    layout?: 'rows' | 'columns';
    courtSide?: 'left' | 'right';
    hideNet?: boolean;
    teamLabel?: string;
    interactive: boolean;
  }) => {
    const st = getState(side);
    return (
      <CourtGrid
        court={courtPlayers(side)}
        frontCount={st.frontCount}
        middleCount={st.middleCount}
        backCount={st.backCount}
        compact
        tone="slate"
        layout={opts.layout}
        courtSide={opts.courtSide}
        hideNet={opts.hideNet}
        teamLabel={opts.teamLabel}
        holding={!!holding || targeting?.side === side}
        selectedId={holding?.id ?? null}
        highlightIndex={highlightFor(side)}
        interactive={opts.interactive}
        disabled={!opts.interactive}
        onSlotPress={(p, idx) => handleSlotPress(side, p, idx)}
      />
    );
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, dual && styles.sheetDual]}>
          <Text style={styles.title}>{dual ? '🏐 양팀 네트 포메이션' : `🏐 ${teamName} 포메이션`}</Text>
          <Text style={styles.sub}>
            {dual
              ? `${hostSide?.teamName}  vs  ${awaySide?.teamName} · 세로네트 점대칭 · 빈자리 투입 / 교체 / 퇴장`
              : `${teamName} · 해당 팀 코트와 대기 벤치만 표시 · 빈자리 투입 / 교체 / 퇴장`}
          </Text>

          {!dual ? renderLineCtrls('host') : null}

          <Text style={styles.holdHint}>{unusedHint}</Text>

          {dual ? (
            <View style={styles.dualCourtBlock}>
              <View style={styles.teamCourtPane}>
                {renderLineCtrls('host', 'back-first')}
                <View style={styles.teamCourtFill}>
                  {renderCourtGrid('host', {
                    layout: 'columns',
                    courtSide: 'left',
                    hideNet: true,
                    teamLabel: hostSide?.teamName,
                    interactive: hostCanEdit,
                  })}
                </View>
                <Text style={styles.courtMeta}>출전 {hostReal}/{hostTotal}{!hostCanEdit ? ' · 상대팀 보기 전용' : ''}</Text>
              </View>

              <View style={styles.verticalNet} />

              <View style={styles.teamCourtPane}>
                {renderLineCtrls('away', 'front-first')}
                <View style={styles.teamCourtFill}>
                  {renderCourtGrid('away', {
                    layout: 'columns',
                    courtSide: 'right',
                    hideNet: true,
                    teamLabel: awaySide?.teamName,
                    interactive: awayCanEdit,
                  })}
                </View>
                <Text style={styles.courtMeta}>출전 {awayReal}/{awayTotal}{!awayCanEdit ? ' · 상대팀 보기 전용' : ''}</Text>
              </View>
            </View>
          ) : (
            <View style={styles.courtWrap}>
              {renderCourtGrid('host', {
                layout: courtSide ? 'columns' : 'rows',
                courtSide: courtSide || 'left',
                hideNet: !!courtSide,
                teamLabel: teamName,
                interactive: true,
              })}
              <Text style={styles.courtMeta}>출전 {hostReal}/{hostTotal} · 빈자리 {hostTotal - hostReal}</Text>
            </View>
          )}

          <View style={[styles.benchBlock, dual && styles.benchBlockDual]}>
            {dual ? renderSharedBench() : renderBenchScroll('host', teamName)}
          </View>

          <View style={styles.btnRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelText}>닫기</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.saveBtn}
              onPress={() => {
                if (dual && onSaveDual) {
                  const hostForm = toFormation(hostState, [
                    ...usedMatchIds,
                    ...awayState.court,
                    ...awayState.bench,
                    ...awayState.late,
                    ...hostState.bench,
                    ...hostState.late,
                  ]);
                  const awayForm = toFormation(awayState, [
                    ...usedMatchIds,
                    ...hostForm.court,
                    ...hostState.bench,
                    ...hostState.late,
                    ...awayState.bench,
                    ...awayState.late,
                  ]);
                  onSaveDual(hostForm, awayForm);
                } else {
                  onSave(toFormation(hostState, [
                    ...usedMatchIds,
                    ...hostState.bench,
                    ...hostState.late,
                  ]));
                }
              }}
            >
              <Text style={styles.saveText}>이 세트 포메이션 저장</Text>
            </TouchableOpacity>
          </View>

          {menuState && menuOccupant ? (
            <View style={styles.actionOverlay}>
              <TouchableOpacity style={styles.actionBackdrop} activeOpacity={1} onPress={() => setIntent(null)} />
              <View style={styles.actionSheet}>
                <Text style={styles.actionTitle}>
                  {nameOf(menuState.side, menuOccupant)} · {slotLabelOf(getState(menuState.side), menuState.index)}
                </Text>
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => setIntent({ type: 'swap', side: menuState.side, index: menuState.index })}
                >
                  <Text style={styles.actionBtnText}>대기 선수와 교체</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.actionBtnDanger]}
                  onPress={() => vacateSlot(menuState.side, menuState.index)}
                >
                  <Text style={[styles.actionBtnText, styles.actionBtnDangerText]}>이 위치 자리 비우기 (퇴장)</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionCancel} onPress={() => setIntent(null)}>
                  <Text style={styles.actionCancelText}>취소</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'center', alignItems: 'center', padding: 4 },
  sheet: { backgroundColor: '#0F172A', borderRadius: 14, padding: 4, width: 640, maxWidth: '100%', maxHeight: '96%', borderWidth: 1, borderColor: '#334155' },
  sheetDual: { width: '98%', maxWidth: 980 },
  title: { fontSize: 13, fontWeight: '900', color: '#F8FAFC', textAlign: 'center' },
  sub: { fontSize: 10, color: '#94A3B8', textAlign: 'center', marginTop: 1, marginBottom: 2, fontWeight: '700' },
  lineCtrlRow: { flexDirection: 'row', gap: 4, marginBottom: 2, flexShrink: 0, width: '100%' },
  lineCtrl: { flex: 1, minWidth: 0, backgroundColor: '#1E293B', borderRadius: 6, padding: 2, borderWidth: 1, borderColor: '#334155', alignItems: 'center' },
  lineCtrlLabel: { fontSize: 8, fontWeight: '800', color: '#CBD5E1', marginBottom: 1 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stepBtn: { width: 22, height: 22, borderRadius: 6, backgroundColor: '#334155', alignItems: 'center', justifyContent: 'center' },
  stepBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  stepVal: { minWidth: 14, textAlign: 'center', color: '#F8FAFC', fontSize: 11, fontWeight: '900' },
  holdHint: { fontSize: 10, color: '#94A3B8', fontWeight: '700', textAlign: 'center', marginBottom: 2, flexShrink: 0 },
  courtWrap: {
    marginVertical: 1,
    flexGrow: 0,
    flexShrink: 0,
    minHeight: 0,
    backgroundColor: '#1E293B',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    overflow: 'hidden',
    padding: 4,
    paddingBottom: 12,
  },
  dualCourtBlock: { flexDirection: 'row', alignItems: 'stretch', flexGrow: 1, flexShrink: 1, minHeight: 168, marginBottom: 8 },
  teamCourtPane: { flex: 1, minWidth: 0, minHeight: 0, flexDirection: 'column', paddingBottom: 8 },
  teamCourtFill: { flex: 1, minHeight: 120, width: '100%', paddingBottom: 4 },
  verticalNet: {
    width: 6,
    alignSelf: 'stretch',
    backgroundColor: '#3B82F6',
    borderRadius: 3,
    marginHorizontal: 3,
    marginVertical: 2,
  },
  courtMeta: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '700',
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 4,
    paddingBottom: 8,
    flexShrink: 0,
    includeFontPadding: false,
  },
  benchBlock: { backgroundColor: '#1E293B', borderRadius: 10, padding: 4, borderWidth: 1, borderColor: '#334155', marginTop: 2, height: 70, maxHeight: 70, overflow: 'hidden', flexShrink: 0 },
  benchBlockDual: { height: 70, maxHeight: 70, flexShrink: 0 },
  benchDualRow: { flexDirection: 'row', gap: 8, height: 70, maxHeight: 70 },
  benchPane: { flex: 1, minWidth: 0, height: 70, maxHeight: 70 },
  benchScroll: { flex: 1, maxHeight: 70 },
  benchHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 1, flexShrink: 0 },
  benchTitle: { fontSize: 11, fontWeight: '800', color: '#F8FAFC' },
  benchChipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, paddingBottom: 2 },
  dutyAction: { fontSize: 10, fontWeight: '700', color: '#94A3B8' },
  playerChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 0, alignItems: 'center', backgroundColor: '#334155' },
  chipCourt: { backgroundColor: '#334155', borderColor: '#334155' },
  chipBench: { backgroundColor: '#334155', borderColor: '#334155' },
  chipLate: { backgroundColor: '#334155', borderColor: '#334155' },
  chipHolding: { borderColor: '#64748B', borderWidth: 1 },
  chipFillReady: { borderColor: '#475569', borderWidth: 1 },
  chipLocked: { opacity: 0.7 },
  playerChipText: { color: '#F8FAFC', fontSize: 12, fontWeight: '800' },
  emptyDuty: { fontSize: 10, color: '#64748B', fontWeight: '700' },
  btnRow: { flexDirection: 'row', gap: 8, marginTop: 4, flexShrink: 0 },
  cancelBtn: { flex: 1, backgroundColor: '#334155', paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  cancelText: { color: '#CBD5E1', fontWeight: '800', fontSize: 13 },
  saveBtn: { flex: 2, backgroundColor: '#2563EB', paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  saveText: { color: '#FFFFFF', fontWeight: '900', fontSize: 13 },
  actionOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    alignItems: 'center',
    zIndex: 20,
  },
  actionBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  actionSheet: {
    width: '92%',
    maxWidth: 420,
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 8,
  },
  actionTitle: { fontSize: 13, fontWeight: '900', color: '#F8FAFC', textAlign: 'center', marginBottom: 4 },
  actionBtn: { backgroundColor: '#334155', borderRadius: 10, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: '#475569' },
  actionBtnText: { color: '#F8FAFC', fontSize: 14, fontWeight: '800' },
  actionBtnDanger: { backgroundColor: '#3F1D1D', borderColor: '#FB7185' },
  actionBtnDangerText: { color: '#FECDD3' },
  actionCancel: { paddingVertical: 8, alignItems: 'center' },
  actionCancelText: { color: '#94A3B8', fontSize: 13, fontWeight: '800' },
});
