import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView } from 'react-native';
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
  courtMembers: Member[];
  benchMembers: Member[];
  opponentCourtMembers?: Member[];
  courtLayout?: CourtLayout;
  opponentCourtLayout?: CourtLayout;
  onClose: () => void;
  onScoreConfirm: (member: Member | null, kind?: ScoreKind) => void;
  onSubConfirm: (outMember: Member, inMember: Member) => void;
}

function padCourt(members: Member[], layout?: CourtLayout): CourtSlotPlayer[] {
  const total =
    (layout?.frontCount ?? DEFAULT_LINE_COUNT) +
    (layout?.middleCount ?? DEFAULT_LINE_COUNT) +
    (layout?.backCount ?? DEFAULT_LINE_COUNT);
  const next = [...members];
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
  courtMembers,
  benchMembers,
  opponentCourtMembers = [],
  courtLayout,
  opponentCourtLayout,
  onClose,
  onScoreConfirm,
  onSubConfirm,
}: Props) {
  const [step, setStep] = useState(1);
  const [outMember, setOutMember] = useState<Member | null>(null);

  useEffect(() => {
    if (visible) {
      setStep(1);
      setOutMember(null);
    }
  }, [visible]);

  const isScoreMode = mode === 'score' || mode === 'edit';
  const oppName = opponentTeamName || '상대';

  let title = '';
  if (mode === 'score') title = `📍 ${teamName} +1점 · 코트 위치 선택`;
  else if (mode === 'edit') title = `✏️ 기록 선수 수정 · ${teamName} 득점 귀속`;
  else title = `🔄 ${teamName} 선수 교체`;

  let subHint = '';
  if (mode === 'sub') {
    subHint = step === 1 ? '🔵 코트에서 [나올] 선수를 터치하세요.' : '⚪ 코트로 [들어갈] 대기 선수를 선택하세요.';
  } else {
    subHint = `${teamName} 코트 = 개인 득점 · ${oppName} 코트 = 상대 범실 · 빈칸 = 무기명 득점`;
  }

  const ownCourt = useMemo(() => padCourt(courtMembers, courtLayout), [courtMembers, courtLayout]);
  const oppCourt = useMemo(() => padCourt(opponentCourtMembers, opponentCourtLayout), [opponentCourtMembers, opponentCourtLayout]);

  const confirmOwnCourt = (player: CourtSlotPlayer) => {
    const anon = isAnonymousPlayer(player);
    onScoreConfirm(anon ? { user_id: player.user_id, full_name: ANONYMOUS_PLAYER_NAME } : player, 'kill');
  };

  const confirmOppCourt = (player: CourtSlotPlayer) => {
    const anon = isAnonymousPlayer(player);
    if (anon) {
      onScoreConfirm(null, 'kill');
      return;
    }
    onScoreConfirm(player, 'fault');
  };

  const benchForSub = (benchMembers.length > 0 ? benchMembers : courtMembers.filter((m) => m.user_id !== outMember?.user_id))
    .filter((m) => !isAnonymousPlayer(m));

  return (
    <Modal visible={visible} transparent animationType="fade">
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={styles.content}>
          <Text style={styles.title}>{title}</Text>
          {subHint ? <Text style={styles.subHint}>{subHint}</Text> : null}

          {isScoreMode ? (
            <View style={styles.dualCourt}>
              <View style={styles.courtPane}>
                <CourtGrid
                  court={ownCourt}
                  teamLabel={`${teamName} · 득점`}
                  compact
                  accent="#38BDF8"
                  frontCount={courtLayout?.frontCount}
                  middleCount={courtLayout?.middleCount}
                  backCount={courtLayout?.backCount}
                  onSlotPress={confirmOwnCourt}
                />
              </View>
              <View style={styles.courtPane}>
                <CourtGrid
                  court={oppCourt}
                  teamLabel={`${oppName} · 범실`}
                  compact
                  accent="#FB7185"
                  frontCount={opponentCourtLayout?.frontCount}
                  middleCount={opponentCourtLayout?.middleCount}
                  backCount={opponentCourtLayout?.backCount}
                  onSlotPress={confirmOppCourt}
                />
              </View>
            </View>
          ) : step === 1 ? (
            <CourtGrid
              court={ownCourt}
              teamLabel={`${teamName} · 나올 선수`}
              compact
              accent="#38BDF8"
              frontCount={courtLayout?.frontCount}
              middleCount={courtLayout?.middleCount}
              backCount={courtLayout?.backCount}
              selectedId={outMember?.user_id}
              onSlotPress={(player) => {
                if (isAnonymousPlayer(player)) return;
                setOutMember(player);
                setStep(2);
              }}
            />
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
                      <Text style={styles.playerText}>👤 {m.full_name}</Text>
                    </TouchableOpacity>
                  ))
                )}
              </View>
            </ScrollView>
          )}

          {isScoreMode && (
            <TouchableOpacity style={styles.skipBtn} onPress={() => onScoreConfirm(null, 'kill')}>
              <Text style={styles.skipBtnText}>⚡ 건너뛰기 (무기명 팀 득점)</Text>
            </TouchableOpacity>
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center', padding: 8 },
  content: { backgroundColor: '#1E293B', borderRadius: 16, padding: 10, width: 640, maxWidth: '100%', borderWidth: 1, borderColor: '#334155' },
  title: { fontSize: 15, fontWeight: '900', color: '#FFFFFF', marginBottom: 2, textAlign: 'center' },
  subHint: { fontSize: 11, color: '#38BDF8', textAlign: 'center', marginBottom: 8, fontWeight: '800' },
  dualCourt: { flexDirection: 'row', gap: 6 },
  courtPane: { flex: 1, minWidth: 0 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  playerBtn: { backgroundColor: '#334155', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: '#475569', minWidth: 96, alignItems: 'center' },
  playerText: { color: '#F8FAFC', fontSize: 13, fontWeight: '800' },
  skipBtn: { marginTop: 8, paddingVertical: 10, backgroundColor: '#334155', borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: '#475569' },
  skipBtnText: { color: '#38BDF8', fontSize: 13, fontWeight: '800' },
  emptyText: { color: '#94A3B8', padding: 16, textAlign: 'center' },
});
