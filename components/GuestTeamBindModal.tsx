import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Colors } from '../constants/Colors';
import { supabase } from '../lib/supabase';
import { getSafeTeamName } from '../lib/utils';
import { isActiveTeamStatus } from '../lib/teamStatus';
import { isSameName, resolveTeamName } from '../lib/nameUtils';

type TeamOption = {
  id: string;
  name: string;
  region?: string | null;
};

type GuestTeamBindModalProps = {
  visible: boolean;
  excludeTeamName?: string | null;
  excludeTeamId?: string | null;
  loading?: boolean;
  onClose: () => void;
  onConfirm: (team: TeamOption) => void;
};

export default function GuestTeamBindModal({
  visible,
  excludeTeamName,
  excludeTeamId,
  loading = false,
  onClose,
  onConfirm,
}: GuestTeamBindModalProps) {
  const [query, setQuery] = useState('');
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [fetching, setFetching] = useState(false);
  const [selected, setSelected] = useState<TeamOption | null>(null);

  useEffect(() => {
    if (!visible) return;
    setQuery('');
    setSelected(null);
    let cancelled = false;
    const load = async () => {
      setFetching(true);
      try {
        const { data } = await supabase.from('teams').select('id, name, team_name, region, status');
        if (cancelled) return;
        const next = (data || [])
          .filter((t: any) => isActiveTeamStatus(t.status) && t.id)
          .map((t: any) => ({
            id: String(t.id),
            name: getSafeTeamName(t),
            region: t.region || null,
          }))
          .filter((t: TeamOption) => {
            if (excludeTeamId && t.id === excludeTeamId) return false;
            if (excludeTeamName && isSameName(t.name, excludeTeamName)) return false;
            return !!t.name;
          });
        setTeams(next);
      } finally {
        if (!cancelled) setFetching(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [visible, excludeTeamId, excludeTeamName]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return teams.slice(0, 40);
    return teams.filter((t) => t.name.toLowerCase().includes(q) || String(t.region || '').toLowerCase().includes(q)).slice(0, 40);
  }, [teams, query]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>상대 팀 소급 연동</Text>
          <Text style={styles.sub}>
            앱에 가입한 실제 팀을 지정하면 상대에게 결과 승인 또는 재수정 요청이 갑니다. 상대가 승인한 뒤에만 공식 랭킹에 반영됩니다.
          </Text>
          <TextInput
            style={styles.input}
            value={query}
            onChangeText={setQuery}
            placeholder="가입된 팀명 검색"
            placeholderTextColor="#94A3B8"
            autoFocus
          />
          {fetching ? (
            <ActivityIndicator color={Colors.primary} style={{ marginVertical: 24 }} />
          ) : (
            <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
              {filtered.length === 0 ? (
                <Text style={styles.empty}>검색된 가입 팀이 없습니다.</Text>
              ) : (
                filtered.map((team) => {
                  const active = selected?.id === team.id;
                  return (
                    <TouchableOpacity
                      key={team.id}
                      style={[styles.teamRow, active && styles.teamRowActive]}
                      onPress={() => setSelected(team)}
                    >
                      <Text style={[styles.teamName, active && styles.teamNameActive]} numberOfLines={1}>
                        🛡️ {getSafeTeamName(team)}
                      </Text>
                      {team.region ? (
                        <Text style={styles.teamRegion} numberOfLines={1}>{resolveTeamName(team.region, team.region)}</Text>
                      ) : null}
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          )}
          <View style={styles.row}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={loading}>
              <Text style={styles.cancelText}>취소</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmBtn, !selected && styles.btnDisabled]}
              onPress={() => selected && onConfirm(selected)}
              disabled={loading || !selected}
            >
              {loading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.confirmText}>연동 완료</Text>
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
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 20,
    maxHeight: '82%',
  },
  title: { fontSize: 16, fontWeight: '800', color: Colors.text, marginBottom: 6 },
  sub: { fontSize: 12, color: Colors.textMuted, lineHeight: 18, marginBottom: 12 },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: Colors.text,
    backgroundColor: '#F8FAFC',
    marginBottom: 10,
  },
  list: { maxHeight: 320 },
  empty: { textAlign: 'center', color: '#94A3B8', marginVertical: 20, fontWeight: '700' },
  teamRow: {
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
    backgroundColor: '#FFFFFF',
  },
  teamRowActive: { borderColor: Colors.primary, backgroundColor: '#EFF6FF' },
  teamName: { fontSize: 14, fontWeight: '800', color: Colors.text },
  teamNameActive: { color: Colors.primary },
  teamRegion: { fontSize: 11, color: Colors.textMuted, marginTop: 2, fontWeight: '600' },
  row: { flexDirection: 'row', gap: 10, marginTop: 12 },
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
  btnDisabled: { opacity: 0.5 },
  confirmText: { fontWeight: '800', color: '#FFFFFF' },
});
