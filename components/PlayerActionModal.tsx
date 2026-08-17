import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView } from 'react-native';

export interface Member {
  user_id: string;
  full_name: string;
}

interface Props {
  visible: boolean;
  mode: 'score' | 'sub' | 'edit';
  teamName: string;
  courtMembers: Member[];
  benchMembers: Member[];
  onClose: () => void; 
  onScoreConfirm: (member: Member | null) => void;
  onSubConfirm: (outMember: Member, inMember: Member) => void;
}

export default function PlayerActionModal({ visible, mode, teamName, courtMembers, benchMembers, onClose, onScoreConfirm, onSubConfirm }: Props) {
  const [step, setStep] = useState(1);
  const [outMember, setOutMember] = useState<Member | null>(null);

  useEffect(() => {
    if (visible) { setStep(1); setOutMember(null); }
  }, [visible]);

  let title = '';
  if (mode === 'score') title = `🎉 ${teamName} 득점자 선택`;
  else if (mode === 'edit') title = `✏️ ${teamName} 득점자 수정`;
  else title = `🔄 ${teamName} 선수 교체`;

  let subHint = '';
  if (mode === 'sub') {
    subHint = step === 1 ? '🔵 코트에서 [나올] 선수를 선택하세요.' : '⚪ 코트로 [들어갈] 벤치 선수를 선택하세요.';
  } else {
    subHint = '🔵 현재 코트 출전 중인 선수 목록입니다.';
  }

  // 득점 모드에서는 코트 출전선수(Court)만 표시, 교체 2단계에서는 벤치선수(Bench) 표시
  const activeMembers = mode === 'sub'
    ? (step === 1 ? courtMembers : (benchMembers.length > 0 ? benchMembers : courtMembers.filter(m => m.user_id !== outMember?.user_id)))
    : (courtMembers.length > 0 ? courtMembers : benchMembers);

  return (
    <Modal visible={visible} transparent animationType="fade">
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={styles.content}>
          <Text style={styles.title}>{title}</Text>
          {subHint ? <Text style={styles.subHint}>{subHint}</Text> : null}

          <ScrollView style={{ maxHeight: 220 }} showsVerticalScrollIndicator={false}>
            <View style={styles.grid}>
              {activeMembers.length === 0 ? (
                <Text style={styles.emptyText}>선택 가능한 선수 명단이 없습니다.</Text>
              ) : (
                activeMembers.map(m => (
                  <TouchableOpacity 
                    key={m.user_id} 
                    style={[styles.playerBtn, outMember?.user_id === m.user_id && styles.playerBtnActive]}
                    onPress={() => {
                      if (mode === 'score' || mode === 'edit') {
                        onScoreConfirm(m);
                      } else {
                        if (step === 1) { 
                          setOutMember(m); 
                          setStep(2); 
                        } else { 
                          onSubConfirm(outMember!, m); 
                        }
                      }
                    }}
                  >
                    <Text style={[styles.playerText, outMember?.user_id === m.user_id && styles.playerTextActive]}>
                      👤 {m.full_name}
                    </Text>
                  </TouchableOpacity>
                ))
              )}
            </View>
          </ScrollView>

          {(mode === 'score' || mode === 'edit') && (
            <TouchableOpacity style={styles.skipBtn} onPress={() => onScoreConfirm(null)}>
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
  content: { backgroundColor: '#1E293B', borderRadius: 18, padding: 20, width: 460, maxWidth: '100%', borderWidth: 1, borderColor: '#334155' },
  title: { fontSize: 17, fontWeight: '900', color: '#FFFFFF', marginBottom: 4, textAlign: 'center' },
  subHint: { fontSize: 12.5, color: '#38BDF8', textAlign: 'center', marginBottom: 12, fontWeight: '800' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  playerBtn: { backgroundColor: '#334155', paddingHorizontal: 18, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: '#475569', minWidth: 100, alignItems: 'center' },
  playerBtnActive: { backgroundColor: '#0284C7', borderColor: '#38BDF8' },
  playerText: { color: '#F8FAFC', fontSize: 14.5, fontWeight: '800' },
  playerTextActive: { color: '#FFFFFF' },
  skipBtn: { marginTop: 14, paddingVertical: 12, backgroundColor: '#334155', borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: '#475569' },
  skipBtnText: { color: '#38BDF8', fontSize: 13.5, fontWeight: '800' },
  emptyText: { color: '#94A3B8', padding: 20, textAlign: 'center' },
});