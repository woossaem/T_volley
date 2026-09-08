import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Colors } from '../constants/Colors';
import { DEFAULT_GUEST_TEAM_NAME } from '../lib/guestMatch';

type GuestTeamNameModalProps = {
  visible: boolean;
  title?: string;
  subtitle?: string;
  defaultValue?: string;
  confirmLabel?: string;
  loading?: boolean;
  onClose: () => void;
  onConfirm: (name: string) => void;
};

export default function GuestTeamNameModal({
  visible,
  title = '게스트 팀으로 변경',
  subtitle = '미가입 상대 팀명을 입력하면 신청/승인 없이 바로 경기를 진행할 수 있습니다.',
  defaultValue = DEFAULT_GUEST_TEAM_NAME,
  confirmLabel = '게스트 팀으로 변경',
  loading = false,
  onClose,
  onConfirm,
}: GuestTeamNameModalProps) {
  const [name, setName] = useState(defaultValue);

  useEffect(() => {
    if (visible) setName(defaultValue || DEFAULT_GUEST_TEAM_NAME);
  }, [visible, defaultValue]);

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.sub}>{subtitle}</Text>
          <Text style={styles.label}>상대 팀명</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder={DEFAULT_GUEST_TEAM_NAME}
            placeholderTextColor="#94A3B8"
            autoFocus
          />
          <View style={styles.row}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={loading}>
              <Text style={styles.cancelText}>취소</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.confirmBtn}
              onPress={() => onConfirm((name || '').trim() || DEFAULT_GUEST_TEAM_NAME)}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.confirmText}>{confirmLabel}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 20,
  },
  title: { fontSize: 16, fontWeight: '800', color: Colors.text, marginBottom: 6 },
  sub: { fontSize: 12, color: Colors.textMuted, lineHeight: 18, marginBottom: 14 },
  label: { fontSize: 12, fontWeight: '700', color: '#334155', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: Colors.text,
    backgroundColor: '#F8FAFC',
  },
  row: { flexDirection: 'row', gap: 10, marginTop: 16 },
  cancelBtn: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: { fontWeight: '800', color: Colors.text },
  confirmBtn: {
    flex: 2,
    backgroundColor: Colors.primary,
    borderRadius: 10,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmText: { fontWeight: '800', color: '#FFFFFF' },
});
