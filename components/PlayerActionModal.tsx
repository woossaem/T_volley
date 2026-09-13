import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CourtGrid, { CourtSlotPlayer } from './CourtGrid';
import { safeInset } from '../lib/nativeSafe';
import {
  ANONYMOUS_PLAYER_NAME,
  assignedUserId,
  DEFAULT_LINE_COUNT,
  displaySlotPlayerName,
  formatTempGuestLabel,
  formatTempPlayerLabel,
  isRegisteredUserId,
  isTempSlotId,
  nextTempGuestId,
} from '../lib/roster';
import { getSafeDisplayName, getSafeTeamName } from '../lib/utils';

export interface Member {
  user_id: string;
  full_name: string;
}

export type ScoreKind = 'kill' | 'fault';

export interface CourtLayout {
  frontCount?: number;
  middleCount?: number;
  backCount?: number;
}

export interface LineupApplyPayload {
  courtIds: Array<string | null>;
  benchIds: string[];
  sub?: { out: Member; in: Member };
}

interface Props {
  visible: boolean;
  mode: 'score' | 'sub' | 'edit';
  teamName: string;
  opponentTeamName?: string;
  boardSide?: 'left' | 'right';
  usedGuestIds?: Array<string | null | undefined>;
  courtMembers: Member[];
  benchMembers: Member[];
  opponentCourtMembers?: Member[];
  courtLayout?: CourtLayout;
  opponentCourtLayout?: CourtLayout;
  onClose: () => void;
  onScoreConfirm: (member: Member | null, kind?: ScoreKind) => void;
  onSubConfirm: (outMember: Member, inMember: Member) => void;
  onLineupApply?: (payload: LineupApplyPayload) => void;
}

function asMember(player: CourtSlotPlayer): Member {
  return {
    user_id: player.user_id || '',
    full_name: getSafeDisplayName(player),
  };
}

function padCourt(members: Member[] | null | undefined, layout?: CourtLayout, fillEmpty = true): CourtSlotPlayer[] {
  const total =
    (layout?.frontCount ?? DEFAULT_LINE_COUNT) +
    (layout?.middleCount ?? DEFAULT_LINE_COUNT) +
    (layout?.backCount ?? DEFAULT_LINE_COUNT);
  const next: CourtSlotPlayer[] = (members || []).map((m) => ({
    user_id: assignedUserId(m.user_id),
    full_name: getSafeDisplayName(m),
  }));
  while (next.length < total) {
    next.push({ user_id: fillEmpty ? '' : null, full_name: ANONYMOUS_PLAYER_NAME });
  }
  return next.slice(0, total);
}

export default function PlayerActionModal({
  visible,
  mode,
  teamName,
  opponentTeamName,
  boardSide = 'left',
  usedGuestIds = [],
  courtMembers,
  benchMembers,
  opponentCourtMembers = [],
  courtLayout,
  opponentCourtLayout,
  onClose,
  onScoreConfirm,
  onSubConfirm,
  onLineupApply,
}: Props) {
  const insets = useSafeAreaInsets();
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [courtSlots, setCourtSlots] = useState<CourtSlotPlayer[]>([]);
  const [benchList, setBenchList] = useState<Member[]>([]);
  const [benchWidth, setBenchWidth] = useState(0);
  const [benchContentWidth, setBenchContentWidth] = useState(0);

  useEffect(() => {
    if (!visible) return;
    setSelectedIndex(null);
    setCourtSlots(padCourt(courtMembers || [], courtLayout, mode !== 'sub'));
    setBenchList(benchMembers || []);
  }, [visible]);

  const isScoreMode = mode === 'score' || mode === 'edit';
  const isSubMode = mode === 'sub';
  const isLeftTeam = boardSide === 'left';
  const oppName = opponentTeamName || '상대';
  const safeTeamName = getSafeTeamName(teamName);
  const leftName = boardSide === 'left' ? safeTeamName : getSafeTeamName(oppName);
  const rightName = boardSide === 'left' ? getSafeTeamName(oppName) : safeTeamName;
  const leftKind: ScoreKind = boardSide === 'left' ? 'kill' : 'fault';
  const rightKind: ScoreKind = boardSide === 'left' ? 'fault' : 'kill';

  let title = '';
  if (mode === 'score') title = `${safeTeamName} +1점  원인 선택`;
  else if (mode === 'edit') title = `기록 선수 수정 · ${safeTeamName}`;
  else title = `${safeTeamName} 선수 교체`;

  const ownCourt = useMemo(() => padCourt(courtMembers, courtLayout, true), [courtMembers, courtLayout]);
  const oppCourt = useMemo(() => padCourt(opponentCourtMembers, opponentCourtLayout, true), [opponentCourtMembers, opponentCourtLayout]);
  const leftCourt = boardSide === 'left' ? ownCourt : oppCourt;
  const rightCourt = boardSide === 'left' ? oppCourt : ownCourt;
  const leftLayout = boardSide === 'left' ? courtLayout : opponentCourtLayout;
  const rightLayout = boardSide === 'left' ? opponentCourtLayout : courtLayout;

  const allUsedIds = useMemo(
    () => [
      ...usedGuestIds,
      ...courtSlots.map((s) => s.user_id),
      ...benchList.map((m) => m.user_id),
    ],
    [usedGuestIds, courtSlots, benchList],
  );

  const makeGuestMember = (): Member => {
    const id = nextTempGuestId(allUsedIds);
    return { user_id: id, full_name: formatTempGuestLabel(id) || formatTempPlayerLabel(id) };
  };

  const confirmKind = (player: CourtSlotPlayer | null, kind: ScoreKind) => {
    const id = assignedUserId(player?.user_id);
    if (!id) {
      onScoreConfirm(null, kind);
      return;
    }
    const name = isRegisteredUserId(id)
      ? getSafeDisplayName(player)
      : displaySlotPlayerName(id, getSafeDisplayName(player));
    onScoreConfirm({ user_id: id, full_name: name }, kind);
  };

  const commitLineup = (
    nextCourt: CourtSlotPlayer[],
    nextBench: Member[],
    sub?: { out: Member; in: Member },
  ) => {
    setCourtSlots(nextCourt);
    setBenchList(nextBench);
    const courtIds = nextCourt.map((s) => assignedUserId(s.user_id));
    const benchIds = nextBench.map((m) => m.user_id).filter(Boolean);
    if (onLineupApply) {
      onLineupApply({ courtIds, benchIds, sub });
      return;
    }
    if (sub) onSubConfirm(sub.out, sub.in);
  };

  const onSubSlotPress = (_player: CourtSlotPlayer, idx: number) => {
    if (selectedIndex == null) {
      setSelectedIndex(idx);
      return;
    }
    if (selectedIndex === idx) {
      setSelectedIndex(null);
      return;
    }
    const next = [...courtSlots];
    const a = next[selectedIndex];
    next[selectedIndex] = next[idx];
    next[idx] = a;
    commitLineup(next, benchList);
    setSelectedIndex(null);
  };

  const onBenchPress = (member: Member) => {
    if (selectedIndex == null) return;
    const slot = courtSlots[selectedIndex];
    const slotId = assignedUserId(slot?.user_id);
    const next = [...courtSlots];
    next[selectedIndex] = { user_id: member.user_id, full_name: member.full_name };
    let nextBench = benchList.filter((m) => m.user_id !== member.user_id);
    if (!slotId) {
      commitLineup(next, nextBench);
    } else {
      const out = asMember(slot);
      if (out.user_id) nextBench = [...nextBench, out];
      commitLineup(next, nextBench, { out, in: member });
    }
    setSelectedIndex(null);
  };

  const onSendToBench = () => {
    if (selectedIndex == null) return;
    const slot = courtSlots[selectedIndex];
    const slotId = assignedUserId(slot?.user_id);
    if (!slotId) return;
    const out = asMember(slot);
    const next = [...courtSlots];
    next[selectedIndex] = { user_id: null, full_name: '' };
    const alreadyOnBench = benchList.some((m) => m.user_id === out.user_id);
    const nextBench = alreadyOnBench ? benchList : [...benchList, out];
    commitLineup(next, nextBench);
  };

  const onAddNewGuest = () => {
    const guest = makeGuestMember();
    if (selectedIndex != null) {
      const slot = courtSlots[selectedIndex];
      const slotId = assignedUserId(slot?.user_id);
      const next = [...courtSlots];
      next[selectedIndex] = { user_id: guest.user_id, full_name: guest.full_name };
      if (!slotId) {
        commitLineup(next, benchList);
      } else {
        const out = asMember(slot);
        const nextBench = out.user_id && !benchList.some((m) => m.user_id === out.user_id)
          ? [...benchList, out]
          : benchList;
        commitLineup(next, nextBench, { out, in: guest });
      }
      setSelectedIndex(null);
      return;
    }
    commitLineup(courtSlots, [...benchList, guest]);
  };

  const netGuide = (
    <View style={[styles.netGuide, isLeftTeam ? styles.netGuideA : styles.netGuideB]}>
      <Text style={styles.netGuideText}>N{'\n'}E{'\n'}T</Text>
    </View>
  );

  const benchOverflow = benchContentWidth > benchWidth + 8;
  const selectedOccupied = selectedIndex != null && !!assignedUserId(courtSlots[selectedIndex]?.user_id);
  const subHint = selectedIndex == null
    ? '선수를 고른 뒤 다른 슬롯을 누르면 자리가 바뀝니다. 빈자리는 벤치에서 투입하세요.'
    : selectedOccupied
      ? '다른 슬롯을 누르면 스왑, 벤치를 누르면 교체됩니다. [퇴장]으로 벤치에 내릴 수 있습니다.'
      : '하단 벤치 또는 [+ 신규 게스트]를 누르면 이 자리에 투입됩니다.';

  return (
    <Modal visible={visible} transparent animationType="fade">
      <TouchableOpacity
        style={[
          styles.overlay,
          isSubMode && (isLeftTeam ? styles.overlayLeft : styles.overlayRight),
          isSubMode && {
            paddingTop: Math.max(safeInset(insets.top), 20),
            paddingBottom: Math.max(safeInset(insets.bottom), 8),
            paddingLeft: isLeftTeam ? Math.max(safeInset(insets.left), 8) : 4,
            paddingRight: isLeftTeam ? 4 : Math.max(safeInset(insets.right), 8),
          },
        ]}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => {}}
          style={[
            styles.content,
            isSubMode && styles.contentSub,
            isSubMode && (isLeftTeam ? styles.contentSubLeft : styles.contentSubRight),
          ]}
        >
          <View style={[styles.headerRow, isSubMode && styles.headerRowSub]}>
            <Text style={[styles.title, isSubMode && styles.titleSub]}>{title}</Text>
            {isSubMode ? (
              <TouchableOpacity
                style={styles.closeIconBtn}
                onPress={onClose}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="닫기"
              >
                <Text style={styles.closeIconText}>✕</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          {isSubMode ? <Text style={styles.subHint} numberOfLines={1}>{subHint}</Text> : null}

          {isScoreMode ? (
            <View style={styles.dualCourt}>
              {([
                { kind: leftKind, name: leftName, court: leftCourt, layout: leftLayout, side: 'left' as const },
                { kind: rightKind, name: rightName, court: rightCourt, layout: rightLayout, side: 'right' as const },
              ]).map((pane, idx, list) => {
                const isKill = pane.kind === 'kill';
                const isLeft = pane.side === 'left';
                return (
                  <React.Fragment key={pane.side}>
                    <View style={styles.courtPane}>
                      <TouchableOpacity
                        style={[styles.kindCard, isLeft ? styles.leftTeamCard : styles.rightTeamCard]}
                        onPress={() => confirmKind(null, pane.kind)}
                      >
                        <View style={[styles.kindCardRow, !isLeft && styles.kindCardRowReverse]}>
                          <View style={[styles.teamChip, isLeft ? styles.teamChipA : styles.teamChipB]}>
                            <Text style={styles.teamChipText} numberOfLines={1}>{getSafeTeamName(pane.name)}</Text>
                          </View>
                          <View style={styles.actionCol}>
                            <Text
                              style={[styles.actionLabel, !isKill && styles.actionLabelFault]}
                              numberOfLines={2}
                            >
                              {isKill ? '득점 (*해당 팀 익명 득점 +1)' : '범실 (*상대팀 익명 범실로 해당 팀 +1)'}
                            </Text>
                          </View>
                        </View>
                      </TouchableOpacity>
                      <View style={styles.courtWrap}>
                        <CourtGrid
                          court={pane.court}
                          compact
                          tone="slate"
                          hideNet
                          layout="columns"
                          courtSide={pane.side}
                          positionEmphasis
                          accent={isLeft ? '#0284C7' : '#E11D48'}
                          frontCount={pane.layout?.frontCount}
                          middleCount={pane.layout?.middleCount}
                          backCount={pane.layout?.backCount}
                          onSlotPress={(player) => confirmKind(player, pane.kind)}
                        />
                      </View>
                    </View>
                    {idx === 0 && list.length > 1 ? <View style={styles.verticalNet} /> : null}
                  </React.Fragment>
                );
              })}
            </View>
          ) : (
            <View style={styles.subBody}>
              <View style={[styles.courtWrap, styles.courtWrapSub]}>
                <View style={styles.subCourtRow}>
                  {!isLeftTeam ? netGuide : null}
                  <View style={styles.subCourtGrid}>
                    <CourtGrid
                      court={courtSlots}
                      compact={false}
                      enlarge
                      hideRowLabels
                      tone="slate"
                      hideNet
                      layout="columns"
                      courtSide={boardSide}
                      accent={isLeftTeam ? '#0284C7' : '#E11D48'}
                      frontCount={courtLayout?.frontCount}
                      middleCount={courtLayout?.middleCount}
                      backCount={courtLayout?.backCount}
                      selectedIndex={selectedIndex}
                      emptySlotLabel="+ 빈자리"
                      onSlotPress={onSubSlotPress}
                    />
                  </View>
                  {isLeftTeam ? netGuide : null}
                </View>
              </View>

              <View style={styles.benchWrap}>
                <View style={styles.benchHeader}>
                  <Text style={styles.benchLabel}>벤치 대기 명단</Text>
                  {selectedOccupied ? (
                    <TouchableOpacity style={styles.exitBtn} onPress={onSendToBench} hitSlop={8}>
                      <Text style={styles.exitBtnText} numberOfLines={1} ellipsizeMode="tail">퇴장 (벤치로 이동)</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
                <View
                  style={styles.benchScrollWrap}
                  onLayout={(e) => setBenchWidth(e.nativeEvent.layout.width)}
                >
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator
                    style={styles.benchScroll}
                    contentContainerStyle={styles.benchRow}
                    onContentSizeChange={(w) => setBenchContentWidth(w)}
                  >
                    {benchList.map((m) => (
                      <TouchableOpacity
                        key={m.user_id}
                        style={[styles.benchChip, selectedIndex == null && styles.benchChipDim]}
                        onPress={() => onBenchPress(m)}
                        hitSlop={8}
                      >
                        <Text style={styles.benchChipText} numberOfLines={1} ellipsizeMode="tail">
                          {isTempSlotId(m.user_id)
                            ? formatTempPlayerLabel(m.user_id, getSafeDisplayName(m))
                            : getSafeDisplayName(m)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity style={styles.benchChipAnon} onPress={onAddNewGuest} hitSlop={8}>
                      <Text style={styles.benchChipAnonText} numberOfLines={1} ellipsizeMode="tail">+ 신규 게스트</Text>
                    </TouchableOpacity>
                  </ScrollView>
                  {benchOverflow ? (
                    <View pointerEvents="none" style={styles.benchFade}>
                      <View style={styles.benchFadeSoft} />
                      <View style={styles.benchFadeHard}>
                        <Text style={styles.benchFadeArrow}>›</Text>
                      </View>
                    </View>
                  ) : null}
                </View>
              </View>
            </View>
          )}

        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center', padding: 8 },
  overlayLeft: { alignItems: 'flex-start', justifyContent: 'flex-start', paddingVertical: 0, paddingHorizontal: 4 },
  overlayRight: { alignItems: 'flex-end', justifyContent: 'flex-start', paddingVertical: 0, paddingHorizontal: 4 },
  content: { backgroundColor: '#1E293B', borderRadius: 16, padding: 10, width: 640, maxWidth: '100%', borderWidth: 1, borderColor: '#334155' },
  contentSub: { width: '68%', maxWidth: 560, padding: 6, paddingTop: 10, maxHeight: '92%' },
  contentSubLeft: { alignSelf: 'flex-start', borderColor: '#0284C7', borderWidth: 1.5 },
  contentSubRight: { alignSelf: 'flex-end', borderColor: '#E11D48', borderWidth: 1.5 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  headerRowSub: { justifyContent: 'space-between', marginBottom: 2, flexShrink: 0 },
  closeIconBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#334155', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  closeIconText: { color: '#F8FAFC', fontSize: 16, fontWeight: '900', lineHeight: 18, includeFontPadding: false },
  subBody: { flexShrink: 1, minHeight: 0 },
  subCourtRow: { flexDirection: 'row', alignItems: 'stretch', minHeight: 200, flexGrow: 1, flexShrink: 1 },
  subCourtGrid: { flex: 1, minWidth: 0, minHeight: 200, flexShrink: 1 },
  netGuide: { width: 18, borderRadius: 4, alignItems: 'center', justifyContent: 'center', marginHorizontal: 3, flexShrink: 0 },
  netGuideA: { backgroundColor: '#0284C7' },
  netGuideB: { backgroundColor: '#E11D48' },
  netGuideText: { color: '#F8FAFC', fontSize: 9, lineHeight: 11, fontWeight: '800', textAlign: 'center', includeFontPadding: false },
  title: { fontSize: 16, fontWeight: '700', color: '#F8FAFC', marginBottom: 10, textAlign: 'center' },
  titleSub: { fontSize: 15, marginBottom: 0, textAlign: 'left', paddingRight: 8, flex: 1 },
  subHint: { fontSize: 11, color: '#94A3B8', textAlign: 'center', marginBottom: 4, fontWeight: '600', lineHeight: 14, includeFontPadding: false },
  dualCourt: { flexDirection: 'row', alignItems: 'stretch', gap: 0 },
  courtPane: { flex: 1, minWidth: 0 },
  verticalNet: { width: 6, alignSelf: 'stretch', backgroundColor: '#3B82F6', borderRadius: 3, marginHorizontal: 6, marginTop: 52 },
  kindCard: { backgroundColor: '#0F172A', borderRadius: 10, paddingVertical: 6, paddingHorizontal: 8, marginBottom: 4 },
  leftTeamCard: { borderWidth: 1.5, borderColor: '#0284C7' },
  rightTeamCard: { borderWidth: 1.5, borderColor: '#E11D48' },
  kindCardRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  kindCardRowReverse: { flexDirection: 'row-reverse' },
  teamChip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, maxWidth: '52%' },
  teamChipA: { backgroundColor: '#0284C7' },
  teamChipB: { backgroundColor: '#E11D48' },
  teamChipText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  actionCol: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { color: '#F8FAFC', fontSize: 12, fontWeight: '800', textAlign: 'center' },
  actionLabelFault: { color: '#F59E0B' },
  courtWrap: { backgroundColor: '#1E293B', borderRadius: 12, borderWidth: 1, borderColor: '#334155', overflow: 'hidden', padding: 2, paddingBottom: 4, minHeight: 148, flexShrink: 0 },
  courtWrapSub: { minHeight: 200, padding: 2, paddingBottom: 2, flexGrow: 1, flexShrink: 1 },
  emptyText: { color: '#94A3B8', padding: 8, textAlign: 'center', fontSize: 12, fontWeight: '600' },
  tagPopover: {
    marginTop: 8,
    backgroundColor: '#0F172A',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FBBF24',
    padding: 8,
    flexShrink: 0,
    gap: 6,
  },
  tagPopoverTitle: { color: '#FDE68A', fontSize: 11, fontWeight: '800', textAlign: 'center', lineHeight: 16, includeFontPadding: false },
  tagNewBtn: { backgroundColor: '#334155', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10, alignItems: 'center' },
  tagNewBtnText: { color: '#F8FAFC', fontSize: 12, fontWeight: '800', lineHeight: 16, includeFontPadding: false },
  tagChipRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 2 },
  tagChip: { backgroundColor: '#1E293B', borderRadius: 999, borderWidth: 1, borderColor: '#FBBF24', paddingHorizontal: 10, paddingVertical: 6 },
  tagChipText: { color: '#FDE68A', fontSize: 12, fontWeight: '900', lineHeight: 16, includeFontPadding: false },
  tagClose: { color: '#94A3B8', fontSize: 11, fontWeight: '700', textAlign: 'center', lineHeight: 16, includeFontPadding: false },
  benchWrap: { marginTop: 4, flexShrink: 0 },
  benchHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4, flexShrink: 0 },
  benchLabel: { color: '#94A3B8', fontSize: 15, fontWeight: '800', lineHeight: 18, includeFontPadding: false, flexShrink: 1 },
  exitBtn: { backgroundColor: '#7F1D1D', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: '#F87171', flexShrink: 0 },
  exitBtnText: { color: '#FECACA', fontSize: 13, fontWeight: '900', lineHeight: 16, includeFontPadding: false },
  benchScrollWrap: { position: 'relative', flexShrink: 0 },
  benchScroll: { flexGrow: 0, flexShrink: 0, maxHeight: 80 },
  benchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 36, minHeight: 64 },
  benchFade: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 32, flexDirection: 'row', flexShrink: 0 },
  benchFadeSoft: { flex: 1, backgroundColor: 'rgba(30, 41, 59, 0.35)' },
  benchFadeHard: { width: 20, backgroundColor: 'rgba(30, 41, 59, 0.92)', alignItems: 'center', justifyContent: 'center' },
  benchFadeArrow: { color: '#FDE68A', fontSize: 18, fontWeight: '900', lineHeight: 20, includeFontPadding: false },
  benchChip: { backgroundColor: '#334155', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, minWidth: 96, minHeight: 56, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#64748B', flexShrink: 0 },
  benchChipDim: { opacity: 0.7 },
  benchChipText: { color: '#F8FAFC', fontSize: 16, fontWeight: '800', lineHeight: 18, includeFontPadding: false },
  benchChipAnon: { backgroundColor: '#422006', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, minWidth: 112, minHeight: 56, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#FBBF24', flexShrink: 0 },
  benchChipAnonText: { color: '#FDE68A', fontSize: 16, fontWeight: '900', lineHeight: 18, includeFontPadding: false },
});
