import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  Alert,
} from 'react-native';
import { Colors } from '../constants/Colors';
import { getAllBadgesWithStatus, BadgeItem, GetBadgeParams } from '../lib/badgeUtils';

interface BadgeCollectionModalProps {
  visible: boolean;
  onClose: () => void;
  userParams: GetBadgeParams;
  equippedBadgeIds: string[]; // 현재 장착 중인 칭호 ID 배열 (최대 2개)
  onSaveEquippedBadges: (badgeIds: string[]) => void; // 저장 함수
}

export default function BadgeCollectionModal({
  visible,
  onClose,
  userParams,
  equippedBadgeIds,
  onSaveEquippedBadges,
}: BadgeCollectionModalProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // 모달이 열릴 때 기존 장착 칭호 세팅
  useEffect(() => {
    if (visible) {
      setSelectedIds(equippedBadgeIds.slice(0, 2));
    }
  }, [visible, equippedBadgeIds]);

  const allBadges = getAllBadgesWithStatus(userParams);
  const unlockedCount = allBadges.filter((b) => b.isUnlocked).length;

  // 칭호 선택 토글 (최대 2개)
  const handleToggleSelect = (badge: BadgeItem) => {
    if (!badge.isUnlocked) {
      Alert.alert(`🔒 [미해금 칭호] ${badge.label}`, `해금 조건: ${badge.conditionText}\n\n${badge.description}`);
      return;
    }

    if (selectedIds.includes(badge.id)) {
      // 선택 해제
      setSelectedIds((prev) => prev.filter((id) => id !== badge.id));
    } else {
      // 최대 2개 제한
      if (selectedIds.length >= 2) {
        Alert.alert('대표 칭호 제한', '대표 칭호는 최대 2개까지만 동시에 장착하실 수 있습니다.');
        return;
      }
      setSelectedIds((prev) => [...prev, badge.id]);
    }
  };

  const handleSave = () => {
    onSaveEquippedBadges(selectedIds);
    Alert.alert('대표 칭호 설정', '선택하신 대표 칭호가 성공적으로 적용되었습니다!');
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* 헤더 */}
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>🏆 칭호 수집 도감</Text>
              <Text style={styles.modalSub}>
                수집율: <Text style={{ color: Colors.primary, fontWeight: '900' }}>{unlockedCount}</Text> / {allBadges.length}개 해금
              </Text>
            </View>
            <View style={styles.equippedCountBadge}>
              <Text style={styles.equippedCountText}>장착 중 {selectedIds.length}/2개</Text>
            </View>
          </View>

          <Text style={styles.guideNotice}>
            ✨ 해금된 칭호를 터치하여 <Text style={{ fontWeight: '800', color: Colors.primary }}>최대 2개</Text>까지 대표 칭호로 장착하세요!
          </Text>

          {/* 칭호 도감 리스트 */}
          <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
            <View style={styles.badgeGrid}>
              {allBadges.map((badge) => {
                const isEquipped = selectedIds.includes(badge.id);

                return (
                  <TouchableOpacity
                    key={badge.id}
                    activeOpacity={0.8}
                    onPress={() => handleToggleSelect(badge)}
                    style={[
                      styles.badgeCard,
                      badge.isUnlocked ? styles.badgeUnlocked : styles.badgeLocked,
                      isEquipped && styles.badgeCardEquipped,
                    ]}
                  >
                    <View style={styles.badgeCardHeader}>
                      {badge.isUnlocked ? (
                        <View style={[styles.badgeChip, badge.style]}>
                          <Text style={[styles.badgeChipText, { color: badge.style.color }]}>
                            {badge.label}
                          </Text>
                        </View>
                      ) : (
                        <View style={[styles.badgeChip, styles.lockedChip]}>
                          <Text style={styles.lockedChipText}>🔒 {badge.label}</Text>
                        </View>
                      )}

                      {/* 장착 선택 인디케이터 */}
                      {isEquipped && (
                        <View style={styles.equippedCheckPill}>
                          <Text style={styles.equippedCheckText}>✓ 대표</Text>
                        </View>
                      )}
                    </View>

                    <Text style={styles.badgeDesc} numberOfLines={2}>
                      {badge.description}
                    </Text>

                    {!badge.isUnlocked && (
                      <View style={styles.conditionBox}>
                        <Text style={styles.conditionText}>🔒 {badge.conditionText}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>

          {/* 하단 버튼 바 */}
          <View style={styles.footerRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>취소</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
              <Text style={styles.saveBtnText}>대표 칭호 저장하기 ({selectedIds.length}/2)</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  modalContent: { backgroundColor: Colors.surface, borderRadius: 20, padding: 16, width: '100%', maxHeight: '88%', elevation: 5 },

  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#E2E8F0', paddingBottom: 10 },
  modalTitle: { fontSize: 17, fontWeight: '900', color: Colors.text },
  modalSub: { fontSize: 12, color: '#64748B', fontWeight: '600', marginTop: 2 },
  equippedCountBadge: { backgroundColor: '#EFF6FF', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, borderWidth: 1, borderColor: '#BFDBFE' },
  equippedCountText: { fontSize: 11, fontWeight: '800', color: '#1D4ED8' },

  guideNotice: { fontSize: 11.5, color: '#475569', backgroundColor: '#F8FAFC', padding: 8, borderRadius: 8, marginVertical: 8, fontWeight: '600', borderWidth: 1, borderColor: '#E2E8F0' },

  scrollArea: { flexShrink: 1 },
  badgeGrid: { gap: 8, paddingBottom: 10 },

  badgeCard: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#E2E8F0' },
  badgeUnlocked: { borderColor: '#CBD5E1' },
  badgeLocked: { backgroundColor: '#F8FAFC', opacity: 0.65 },
  badgeCardEquipped: { borderColor: '#3B82F6', borderWidth: 2, backgroundColor: '#EFF6FF' },

  badgeCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  badgeChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  badgeChipText: { fontSize: 11, fontWeight: '800' },
  lockedChip: { backgroundColor: '#E2E8F0', borderColor: '#CBD5E1' },
  lockedChipText: { fontSize: 11, fontWeight: '700', color: '#64748B' },

  equippedCheckPill: { backgroundColor: '#2563EB', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  equippedCheckText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900' },

  badgeDesc: { fontSize: 11.5, color: '#334155', lineHeight: 16, fontWeight: '600' },
  conditionBox: { marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: '#E2E8F0' },
  conditionText: { fontSize: 10.5, color: '#B45309', fontWeight: '700' },

  footerRow: { flexDirection: 'row', gap: 8, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#E2E8F0' },
  cancelBtn: { flex: 1, backgroundColor: '#F1F5F9', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  cancelBtnText: { color: Colors.text, fontSize: 13, fontWeight: '800' },
  saveBtn: { flex: 2, backgroundColor: Colors.primary, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  saveBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
});