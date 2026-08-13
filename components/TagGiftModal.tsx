import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Colors } from '../constants/Colors';

interface TagItem {
  id: string;
  category: string;
  title: string;
  emoji: string;
}

interface GivenTag {
  targetUserId: string;
  tagId: string;
}

interface MemberInfo {
  user_id: string;
  full_name: string;
  playedSetCount?: number;
}

interface TagGiftModalProps {
  visible: boolean;
  onClose: () => void;
  currentTagBank: TagItem[];
  selectedTagFromBank: TagItem | null;
  onSelectTagFromBank: (tag: TagItem) => void;
  onRollTagBank: () => void;
  matchMembers: MemberInfo[];
  givenTags: GivenTag[];
  availableTags: TagItem[];
  onAssignTag: (targetUserId: string) => void;
  onSubmitTags: () => void;
  actionLoading: boolean;
}

export default function TagGiftModal({
  visible,
  onClose,
  currentTagBank,
  selectedTagFromBank,
  onSelectTagFromBank,
  onRollTagBank,
  matchMembers,
  givenTags,
  availableTags,
  onAssignTag,
  onSubmitTags,
  actionLoading,
}: TagGiftModalProps) {
  // 원터치 매너 평가 완료된 유저 ID 목록
  const [evaluatedUserIds, setEvaluatedUserIds] = useState<string[]>([]);

  const handleQuickManner = (targetUserId: string) => {
    if (evaluatedUserIds.includes(targetUserId)) {
      setEvaluatedUserIds(prev => prev.filter(id => id !== targetUserId));
    } else {
      setEvaluatedUserIds(prev => [...prev, targetUserId]);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { maxHeight: '88%' }]}>
          <Text style={styles.modalTitle}>🍇 매너 칭찬하고 포도알 1개 받기!</Text>
          <Text style={styles.modalSub}>오늘 코트에서 수고한 동료 선생님께 칭찬 태그와 매너 점수를 선물해 주세요.</Text>

          {/* 🛡️ 보복 평가 방지 및 익명성 보장 안내 상자 */}
          <View style={styles.protectionNoticeBox}>
            <Text style={styles.protectionNoticeTitle}>🛡️ 매너 평가 익명성 보호 시스템</Text>
            <Text style={styles.protectionNoticeText}>
              • 평가 결과는 최소 3회 이상 축적된 후 종합 지표로만 업데이트되어 특정인을 추측할 수 없습니다.{'\n'}
              • 평가에 동참해주신 선생님께는 감사 의미로 <Text style={{ fontWeight: '900', color: Colors.primary }}>포도알 1개</Text>가 즉시 지급됩니다.
            </Text>
          </View>

          {/* 태그 뱅크 영역 */}
          <View style={styles.tagBankContainer}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text style={{ fontSize: 12, fontWeight: '800', color: Colors.primary }}>🎲 부여할 태그 뱅크 (선택)</Text>
              <TouchableOpacity onPress={() => onRollTagBank()} style={{ backgroundColor: '#EFF6FF', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                <Text style={{ fontSize: 10, fontWeight: '800', color: '#1D4ED8' }}>↻ 새로고침</Text>
              </TouchableOpacity>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
              {currentTagBank.map(tag => {
                const isSelected = selectedTagFromBank?.id === tag.id;
                return (
                  <TouchableOpacity
                    key={tag.id}
                    style={[styles.bankTagChip, isSelected && styles.bankTagChipActive]}
                    onPress={() => onSelectTagFromBank(tag)}
                  >
                    <Text style={[styles.bankTagText, isSelected && styles.bankTagTextActive]}>
                      {tag.emoji} {tag.title}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* 코트 출전 팀원 명단 및 1초 원터치 매너 평가 */}
          <Text style={styles.inputLabel}>👥 오늘 함께 뛴 코트 출전 팀원 명단</Text>
          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 200, marginVertical: 4 }}>
            {matchMembers.length === 0 ? (
              <View style={{ padding: 16, alignItems: 'center' }}>
                <Text style={{ fontSize: 12, color: '#94A3B8' }}>코트에 출전한 팀원 명단이 없습니다.</Text>
              </View>
            ) : (
              matchMembers.map(m => {
                const given = givenTags.find(gt => gt.targetUserId === m.user_id);
                const givenTagInfo = given ? availableTags.find(t => t.id === given.tagId) : null;
                const isMannerChecked = evaluatedUserIds.includes(m.user_id);

                return (
                  <View key={m.user_id} style={styles.memberTagRow}>
                    <View style={{ flex: 1 }}>
                      <TouchableOpacity onPress={() => onAssignTag(m.user_id)}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={styles.memberTagRowName}>👤 {m.full_name}</Text>
                          {m.playedSetCount !== undefined && (
                            <View style={styles.setBadge}>
                              <Text style={styles.setBadgeText}>{m.playedSetCount}세트 출전</Text>
                            </View>
                          )}
                        </View>
                        {givenTagInfo ? (
                          <Text style={{ fontSize: 11, fontWeight: '800', color: '#15803D', marginTop: 2 }}>
                            태그: {givenTagInfo.emoji} {givenTagInfo.title}
                          </Text>
                        ) : (
                          <Text style={{ fontSize: 10, color: '#94A3B8', marginTop: 2 }}>+ 상세 칭찬 태그 지정하기</Text>
                        )}
                      </TouchableOpacity>
                    </View>

                    {/* 1초 원터치 매너 평가 버튼 */}
                    <TouchableOpacity
                      style={[styles.quickMannerBtn, isMannerChecked && styles.quickMannerBtnActive]}
                      onPress={() => handleQuickManner(m.user_id)}
                    >
                      <Text style={[styles.quickMannerBtnText, isMannerChecked && styles.quickMannerBtnTextActive]}>
                        {isMannerChecked ? '😊 매너 칭찬 완료' : '😊 매너 훌륭함'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })
            )}
          </ScrollView>

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            <TouchableOpacity style={[styles.closeBtn, { flex: 1 }]} onPress={onClose}>
              <Text style={styles.closeBtnText}>⚡ 건너뛰기</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.submitBtn, { flex: 2, backgroundColor: '#10B981' }]} 
              onPress={onSubmitTags} 
              disabled={actionLoading}
            >
              {actionLoading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.submitBtnText}>
                  🎁 평가 완료 & 포도알 1개 받기
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  modalContent: { backgroundColor: Colors.surface, borderRadius: 20, padding: 16, width: '100%', elevation: 5 },
  modalTitle: { fontSize: 16, fontWeight: '800', color: Colors.text, marginBottom: 2 },
  modalSub: { fontSize: 11, color: Colors.textMuted, marginBottom: 8, lineHeight: 16 },

  protectionNoticeBox: { backgroundColor: '#FEF3C7', padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#FDE68A', marginBottom: 8 },
  protectionNoticeTitle: { fontSize: 11, fontWeight: '800', color: '#B45309', marginBottom: 2 },
  protectionNoticeText: { fontSize: 10, color: '#92400E', lineHeight: 15, fontWeight: '600' },

  tagBankContainer: { backgroundColor: '#F8FAFC', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 8 },
  bankTagChip: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#CBD5E1' },
  bankTagChipActive: { backgroundColor: '#2563EB', borderColor: '#1D4ED8' },
  bankTagText: { fontSize: 11, fontWeight: '700', color: '#475569' },
  bankTagTextActive: { color: '#FFFFFF', fontWeight: '800' },

  inputLabel: { fontSize: 12, fontWeight: '700', color: '#475569', marginBottom: 4 },
  memberTagRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 10, backgroundColor: '#F8FAFC', borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 4 },
  memberTagRowName: { fontSize: 13, fontWeight: '800', color: Colors.text },
  setBadge: { backgroundColor: '#DBEAFE', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  setBadgeText: { fontSize: 10, fontWeight: '800', color: '#1E40AF' },

  quickMannerBtn: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#FDE68A', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  quickMannerBtnActive: { backgroundColor: '#FEF3C7', borderColor: '#F59E0B' },
  quickMannerBtnText: { fontSize: 11, fontWeight: '800', color: '#B45309' },
  quickMannerBtnTextActive: { color: '#92400E' },

  closeBtn: { backgroundColor: '#F1F5F9', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  closeBtnText: { color: Colors.text, fontSize: 13, fontWeight: '800' },
  submitBtn: { borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  submitBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
});