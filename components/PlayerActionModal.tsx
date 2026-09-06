import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CourtGrid, { CourtSlotPlayer } from './CourtGrid';
import { ANONYMOUS_PLAYER_NAME, DEFAULT_LINE_COUNT, isAnonymousPlayer, makeAnonSlotId } from '../lib/roster';

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

interface Props {
  visible: boolean;
  mode: 'score' | 'sub' | 'edit';
  teamName: string;
  opponentTeamName?: string;
  boardSide?: 'left' | 'right';
  courtMembers: Member[];
  benchMembers: Member[];
  opponentCourtMembers?: Member[];
  courtLayout?: CourtLayout;
  opponentCourtLayout?: CourtLayout;
  onClose: () => void;
  onScoreConfirm: (member: Member | null, kind?: ScoreKind) => void;
  onSubConfirm: (outMember: Member, inMember: Member) => void;
}

function asMember(player: CourtSlotPlayer): Member {
  return { user_id: player.user_id || makeAnonSlotId(0), full_name: player.full_name };
}

function padCourt(members: Member[], layout?: CourtLayout): CourtSlotPlayer[] {
  const total =
    (layout?.frontCount ?? DEFAULT_LINE_COUNT) +
    (layout?.middleCount ?? DEFAULT_LINE_COUNT) +
    (layout?.backCount ?? DEFAULT_LINE_COUNT);
  const next: CourtSlotPlayer[] = [...members];
  while (next.length < total) {
    next.push({ user_id: makeAnonSlotId(next.length), full_name: ANONYMOUS_PLAYER_NAME });
  }
  return next.slice(0, total);
}

export default function PlayerActionModal({
  visible,
  mode,
  teamName,
  opponentTeamName,
  boardSide = 'left',
  courtMembers,
  benchMembers,
  opponentCourtMembers = [],
  courtLayout,
  opponentCourtLayout,
  onClose,
  onScoreConfirm,
  onSubConfirm,
}: Props) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(1);
  const [outMember, setOutMember] = useState<Member | null>(null);

  useEffect(() => {
    if (visible) {
      setStep(1);
      setOutMember(null);
    }
  }, [visible]);

  const isScoreMode = mode === 'score' || mode === 'edit';
  const isSubMode = mode === 'sub';
  const isLeftTeam = boardSide === 'left';
  const oppName = opponentTeamName || '상대';
  const leftName = boardSide === 'left' ? teamName : oppName;
  const rightName = boardSide === 'left' ? oppName : teamName;
  const leftKind: ScoreKind = boardSide === 'left' ? 'kill' : 'fault';
  const rightKind: ScoreKind = boardSide === 'left' ? 'fault' : 'kill';

  let title = '';
  if (mode === 'score') title = `${teamName} +1점  원인 선택`;
  else if (mode === 'edit') title = `기록 선수 수정 · ${teamName}`;
  else title = `${teamName} 선수 교체`;

  const subHint = mode === 'sub'
    ? (step === 1 ? '코트에서 나올 선수를 선택하세요.' : '코트로 들어갈 대기 선수를 선택하세요.')
    : '';

  const ownCourt = useMemo(() => padCourt(courtMembers, courtLayout), [courtMembers, courtLayout]);
  const oppCourt = useMemo(() => padCourt(opponentCourtMembers, opponentCourtLayout), [opponentCourtMembers, opponentCourtLayout]);
  const leftCourt = boardSide === 'left' ? ownCourt : oppCourt;
  const rightCourt = boardSide === 'left' ? oppCourt : ownCourt;
  const leftLayout = boardSide === 'left' ? courtLayout : opponentCourtLayout;
  const rightLayout = boardSide === 'left' ? opponentCourtLayout : courtLayout;

  const confirmKind = (player: CourtSlotPlayer | null, kind: ScoreKind) => {
    if (!player || isAnonymousPlayer(player)) {
      onScoreConfirm(player ? { user_id: asMember(player).user_id, full_name: ANONYMOUS_PLAYER_NAME } : null, kind);
      return;
    }
    onScoreConfirm(asMember(player), kind);
  };

  const benchForSub = (benchMembers.length > 0 ? benchMembers : courtMembers.filter((m) => m.user_id !== outMember?.user_id))
    .filter((m) => !isAnonymousPlayer(m));

  const netGuide = (
    <View style={[styles.netGuide, isLeftTeam ? styles.netGuideA : styles.netGuideB]}>
      <Text style={styles.netGuideText}>N{'\n'}E{'\n'}T</Text>
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="fade">
      <TouchableOpacity
        style={[
          styles.overlay,
          isSubMode && (isLeftTeam ? styles.overlayLeft : styles.overlayRight),
          isSubMode && {
            paddingLeft: isLeftTeam ? Math.max(insets.left, 16) : 8,
            paddingRight: isLeftTeam ? 8 : Math.max(insets.right, 16),
          },
        ]}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={[
            styles.content,
            isSubMode && styles.contentSub,
            isSubMode && (isLeftTeam ? styles.contentSubLeft : styles.contentSubRight),
          ]}
        >
          <Text style={styles.title}>{title}</Text>
          {subHint ? <Text style={styles.subHint}>{subHint}</Text> : null}

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
                            <Text style={styles.teamChipText} numberOfLines={1}>{pane.name}</Text>
                          </View>
                          <View style={styles.actionCol}>
                            <Text style={[styles.actionLabel, !isKill && styles.actionLabelFault]}>
                              {isKill ? '득점' : '범실'}
                            </Text>
                            <Text style={styles.kindCardSub}>
                              {isKill ? '(직접 득점 +1)' : `(상대 실수로 ${teamName} +1)`}
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
          ) : step === 1 ? (
            <View style={styles.courtWrap}>
              <View style={styles.subCourtRow}>
                {!isLeftTeam ? netGuide : null}
                <View style={styles.subCourtGrid}>
                  <CourtGrid
                    court={ownCourt}
                    teamLabel="나올 선수"
                    compact
                    tone="slate"
                    hideNet
                    layout="columns"
                    courtSide={boardSide}
                    accent={isLeftTeam ? '#0284C7' : '#E11D48'}
                    frontCount={courtLayout?.frontCount}
                    middleCount={courtLayout?.middleCount}
                    backCount={courtLayout?.backCount}
                    selectedId={outMember?.user_id}
                    onSlotPress={(player) => {
                      if (isAnonymousPlayer(player)) return;
                      setOutMember(asMember(player));
                      setStep(2);
                    }}
                  />
                </View>
                {isLeftTeam ? netGuide : null}
              </View>
            </View>
          ) : (
            <ScrollView style={{ maxHeight: 140 }} showsVerticalScrollIndicator={false}>
              <View style={styles.grid}>
                {benchForSub.length === 0 ? (
                  <Text style={styles.emptyText}>들어갈 대기 선수가 없습니다.</Text>
                ) : (
                  benchForSub.map((m) => (
                    <TouchableOpacity
                      key={m.user_id}
                      style={styles.playerBtn}
                      onPress={() => onSubConfirm(outMember!, m)}
                    >
                      <Text style={styles.playerText}>{m.full_name}</Text>
                    </TouchableOpacity>
                  ))
                )}
              </View>
            </ScrollView>
          )}

          {isScoreMode && (
            <TouchableOpacity style={styles.skipBtn} onPress={() => onScoreConfirm(null, 'kill')}>
              <Text style={styles.skipBtnText}>건너뛰기 · 무기명 득점</Text>
            </TouchableOpacity>
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center', padding: 8 },
  overlayLeft: { alignItems: 'flex-start' },
  overlayRight: { alignItems: 'flex-end' },
  content: { backgroundColor: '#1E293B', borderRadius: 16, padding: 10, width: 640, maxWidth: '100%', borderWidth: 1, borderColor: '#334155' },
  contentSub: { width: '55%', maxWidth: 420 },
  contentSubLeft: { alignSelf: 'flex-start', borderColor: '#0284C7', borderWidth: 1.5 },
  contentSubRight: { alignSelf: 'flex-end', borderColor: '#E11D48', borderWidth: 1.5 },
  subCourtRow: { flexDirection: 'row', alignItems: 'stretch', minHeight: 132 },
  subCourtGrid: { flex: 1, minWidth: 0 },
  netGuide: { width: 18, borderRadius: 4, alignItems: 'center', justifyContent: 'center', marginHorizontal: 3 },
  netGuideA: { backgroundColor: '#0284C7' },
  netGuideB: { backgroundColor: '#E11D48' },
  netGuideText: { color: '#F8FAFC', fontSize: 9, lineHeight: 11, fontWeight: '800', textAlign: 'center', includeFontPadding: false },
  title: { fontSize: 16, fontWeight: '700', color: '#F8FAFC', marginBottom: 10, textAlign: 'center' },
  subHint: { fontSize: 12, color: '#94A3B8', textAlign: 'center', marginBottom: 8, fontWeight: '600' },
  dualCourt: { flexDirection: 'row', alignItems: 'stretch', gap: 0 },
  courtPane: { flex: 1, minWidth: 0 },
  verticalNet: { width: 6, alignSelf: 'stretch', backgroundColor: '#3B82F6', borderRadius: 3, marginHorizontal: 6, marginTop: 52 },
  kindCard: { backgroundColor: '#0F172A', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 10, marginBottom: 8 },
  leftTeamCard: { borderWidth: 1.5, borderColor: '#0284C7' },
  rightTeamCard: { borderWidth: 1.5, borderColor: '#E11D48' },
  kindCardRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  kindCardRowReverse: { flexDirection: 'row-reverse' },
  teamChip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, maxWidth: '52%' },
  teamChipA: { backgroundColor: '#0284C7' },
  teamChipB: { backgroundColor: '#E11D48' },
  teamChipText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  actionCol: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { color: '#F8FAFC', fontSize: 18, fontWeight: '800' },
  actionLabelFault: { color: '#F59E0B' },
  kindCardSub: { color: '#64748B', fontSize: 11, fontWeight: '600', marginTop: 2 },
  courtWrap: { backgroundColor: '#1E293B', borderRadius: 12, borderWidth: 1, borderColor: '#334155', overflow: 'hidden', padding: 4, paddingBottom: 12, minHeight: 148 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  playerBtn: { backgroundColor: '#334155', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 8, minWidth: 96, alignItems: 'center' },
  playerText: { color: '#F8FAFC', fontSize: 13, fontWeight: '700' },
  skipBtn: { marginTop: 10, paddingVertical: 10, backgroundColor: '#334155', borderRadius: 8, alignItems: 'center' },
  skipBtnText: { color: '#94A3B8', fontSize: 13, fontWeight: '600' },
  emptyText: { color: '#94A3B8', padding: 16, textAlign: 'center' },
});
