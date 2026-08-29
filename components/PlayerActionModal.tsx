import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView } from 'react-native';
import { ANONYMOUS_PLAYER_NAME, isAnonymousPlayer } from '../lib/roster';

export interface Member {
  user_id: string;
  full_name: string;
}

export type ScoreKind = 'kill' | 'fault';

interface Props {
  visible: boolean;
  mode: 'score' | 'sub' | 'edit';
  teamName: string;
  opponentTeamName?: string;
  courtMembers: Member[];
  benchMembers: Member[];
  opponentCourtMembers?: Member[];
  onClose: () => void;
  onScoreConfirm: (member: Member | null, kind?: ScoreKind) => void;
  onSubConfirm: (outMember: Member, inMember: Member) => void;
}

export default function PlayerActionModal({
  visible,
  mode,
  teamName,
  opponentTeamName,
  courtMembers,
  benchMembers,
  opponentCourtMembers = [],
  onClose,
  onScoreConfirm,
  onSubConfirm,
}: Props) {
  const [step, setStep] = useState(1);
  const [outMember, setOutMember] = useState<Member | null>(null);
  const [scoreKind, setScoreKind] = useState<ScoreKind>('kill');

  useEffect(() => {
    if (visible) {
      setStep(1);
      setOutMember(null);
      setScoreKind('kill');
    }
  }, [visible]);

  const isScoreMode = mode === 'score' || mode === 'edit';
  const oppName = opponentTeamName || '상대';

  let title = '';
  if (mode === 'score') title = scoreKind === 'kill' ? `🎉 ${teamName} 득점자 선택` : `💥 ${oppName} 범실자 선택`;
  else if (mode === 'edit') title = `✏️ 기록 선수 수정`;
  else title = `🔄 ${teamName} 선수 교체`;

  let subHint = '';
  if (mode === 'sub') {
    subHint = step === 1 ? '🔵 코트에서 [나올] 선수를 선택하세요.' : '⚪ 코트로 [들어갈] 벤치 선수를 선택하세요.';
  } else if (scoreKind === 'fault') {
    subHint = `🔴 상대(${oppName}) 코트 선수 범실 → ${teamName} +1점`;
  } else {
    subHint = `🔵 ${teamName} 코트 출전 선수 개인 득점`;
  }

  const activeMembers = mode === 'sub'
    ? (step === 1 ? courtMembers : (benchMembers.length > 0 ? benchMembers : courtMembers.filter((m) => m.user_id !== outMember?.user_id))).filter((m) => !isAnonymousPlayer(m))
    : (scoreKind === 'fault'
      ? (opponentCourtMembers.length > 0 ? opponentCourtMembers : [])
      : (courtMembers.length > 0 ? courtMembers : benchMembers));

  return (
    <Modal visible={visible} transparent animationType="fade">
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={styles.content}>
          <Text style={styles.title}>{title}</Text>
          {subHint ? <Text style={styles.subHint}>{subHint}</Text> : null}

          {isScoreMode ? (
            <View style={styles.kindRow}>
              <TouchableOpacity
                style={[styles.kindBtn, scoreKind === 'kill' && styles.kindBtnKill]}
                onPress={() => setScoreKind('kill')}
              >
                <Text style={[styles.kindText, scoreKind === 'kill' && styles.kindTextActive]}>
                  득점자 선택{'\n'}+1점 & 개인 득점
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.kindBtn, scoreKind === 'fault' && styles.kindBtnFault]}
                onPress={() => setScoreKind('fault')}
              >
                <Text style={[styles.kindText, scoreKind === 'fault' && styles.kindTextActive]}>
                  상대 범실자 선택{'\n'}+1점 & 상대 범실
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <ScrollView style={{ maxHeight: 200 }} showsVerticalScrollIndicator={false}>
            <View style={styles.grid}>
              {activeMembers.length === 0 ? (
                <Text style={styles.emptyText}>
                  {scoreKind === 'fault' && isScoreMode ? '상대 코트 출전 명단이 없습니다.' : '선택 가능한 선수 명단이 없습니다.'}
                </Text>
              ) : (
                activeMembers.map((m) => {
                  const anon = isAnonymousPlayer(m);
                  return (
                  <TouchableOpacity
                    key={m.user_id}
                    style={[styles.playerBtn, anon && styles.playerBtnAnon, outMember?.user_id === m.user_id && styles.playerBtnActive]}
                    onPress={() => {
                      if (isScoreMode) {
                        onScoreConfirm(anon ? null : m, scoreKind);
                      } else if (anon) {
                        return;
                      } else if (step === 1) {
                        setOutMember(m);
                        setStep(2);
                      } else {
                        onSubConfirm(outMember!, m);
                      }
                    }}
                  >
                    <Text style={[styles.playerText, outMember?.user_id === m.user_id && styles.playerTextActive]}>
                      {anon ? `👤 ${ANONYMOUS_PLAYER_NAME}` : `👤 ${m.full_name}`}
                    </Text>
                  </TouchableOpacity>
                  );
                })
              )}
            </View>
          </ScrollView>

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
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  content: { backgroundColor: '#1E293B', borderRadius: 18, padding: 20, width: 500, maxWidth: '100%', borderWidth: 1, borderColor: '#334155' },
  title: { fontSize: 17, fontWeight: '900', color: '#FFFFFF', marginBottom: 4, textAlign: 'center' },
  subHint: { fontSize: 12.5, color: '#38BDF8', textAlign: 'center', marginBottom: 10, fontWeight: '800' },
  kindRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  kindBtn: { flex: 1, backgroundColor: '#334155', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 8, borderWidth: 1, borderColor: '#475569', alignItems: 'center' },
  kindBtnKill: { backgroundColor: '#0C4A6E', borderColor: '#38BDF8' },
  kindBtnFault: { backgroundColor: '#4C0519', borderColor: '#FB7185' },
  kindText: { color: '#CBD5E1', fontSize: 12, fontWeight: '800', textAlign: 'center', lineHeight: 16 },
  kindTextActive: { color: '#FFFFFF' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  playerBtn: { backgroundColor: '#334155', paddingHorizontal: 18, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: '#475569', minWidth: 100, alignItems: 'center' },
  playerBtnActive: { backgroundColor: '#0284C7', borderColor: '#38BDF8' },
  playerBtnAnon: { backgroundColor: '#1E293B', borderColor: '#FDE68A', borderStyle: 'dashed' },
  playerText: { color: '#F8FAFC', fontSize: 14.5, fontWeight: '800' },
  playerTextActive: { color: '#FFFFFF' },
  skipBtn: { marginTop: 14, paddingVertical: 12, backgroundColor: '#334155', borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: '#475569' },
  skipBtnText: { color: '#38BDF8', fontSize: 13.5, fontWeight: '800' },
  emptyText: { color: '#94A3B8', padding: 20, textAlign: 'center' },
});
