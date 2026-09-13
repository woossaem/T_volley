import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { DEFAULT_SERVE_START_LABEL, SERVE_ROTATION_LABELS, type ServeTeam } from '../lib/serveRotation';

type Props = {
  visible: boolean;
  setNumber: number;
  hostName: string;
  awayName: string;
  onConfirm: (team: ServeTeam, startLabel: string) => void;
};

export default function FirstServeModal({ visible, setNumber, hostName, awayName, onConfirm }: Props) {
  const [team, setTeam] = useState<ServeTeam>('host');
  const [startLabel, setStartLabel] = useState<string>(DEFAULT_SERVE_START_LABEL);

  useEffect(() => {
    if (!visible) return;
    setTeam('host');
    setStartLabel(DEFAULT_SERVE_START_LABEL);
  }, [visible, setNumber]);

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{setNumber}세트 첫 서브 설정</Text>
          <Text style={styles.sub}>서브권은 선수가 아니라 포지션 슬롯을 따라갑니다.</Text>

          <Text style={styles.label}>첫 서브 팀</Text>
          <View style={styles.row}>
            <TouchableOpacity
              style={[styles.teamBtn, styles.hostBtn, team === 'host' && styles.teamBtnOn]}
              onPress={() => setTeam('host')}
            >
              <Text style={styles.teamBtnText} numberOfLines={1}>{hostName}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.teamBtn, styles.awayBtn, team === 'away' && styles.teamBtnOn]}
              onPress={() => setTeam('away')}
            >
              <Text style={styles.teamBtnText} numberOfLines={1}>{awayName}</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>시작 포지션</Text>
          <View style={styles.posGrid}>
            {SERVE_ROTATION_LABELS.map((label, idx) => (
              <TouchableOpacity
                key={label}
                style={[styles.posBtn, startLabel === label && styles.posBtnOn]}
                onPress={() => setStartLabel(label)}
              >
                <Text style={styles.posIdx}>{idx + 1}</Text>
                <Text style={[styles.posText, startLabel === label && styles.posTextOn]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={styles.saveBtn} onPress={() => onConfirm(team, startLabel)}>
            <Text style={styles.saveText}>이 세트로 시작</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  sheet: { width: 440, maxWidth: '100%', backgroundColor: '#0F172A', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#334155' },
  title: { color: '#F8FAFC', fontSize: 17, fontWeight: '900', textAlign: 'center' },
  sub: { color: '#94A3B8', fontSize: 12, fontWeight: '700', textAlign: 'center', marginTop: 4, marginBottom: 14 },
  label: { color: '#CBD5E1', fontSize: 12, fontWeight: '800', marginBottom: 6 },
  row: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  teamBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', borderWidth: 2, borderColor: 'transparent' },
  hostBtn: { backgroundColor: '#0284C7' },
  awayBtn: { backgroundColor: '#BE123C' },
  teamBtnOn: { borderColor: '#FDE68A' },
  teamBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  posGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 },
  posBtn: { width: '31%', minWidth: 88, flexGrow: 1, backgroundColor: '#1E293B', borderRadius: 8, paddingVertical: 8, alignItems: 'center', borderWidth: 1, borderColor: '#334155' },
  posBtnOn: { borderColor: '#FDE68A', backgroundColor: '#334155' },
  posIdx: { color: '#64748B', fontSize: 10, fontWeight: '800' },
  posText: { color: '#E2E8F0', fontSize: 13, fontWeight: '800', marginTop: 2 },
  posTextOn: { color: '#FDE68A' },
  saveBtn: { backgroundColor: '#2563EB', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  saveText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
});
