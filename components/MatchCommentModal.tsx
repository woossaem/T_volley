import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Colors } from '../constants/Colors';
import StickyAdBanner from './StickyAdBanner'; // 💡 스티커 광고 배너 Import

export interface CommentData {
  id: string;
  match_id: string;
  user_id: string;
  content: string;
  created_at: string;
  full_name?: string;
  badgeType?: 'host' | 'applicant' | 'mercenary' | 'general';
  badgeLabel?: string;
}

export interface BadgeOption {
  type: 'host' | 'applicant' | 'mercenary' | 'general';
  teamName?: string;
  label: string;
}

interface MatchCommentModalProps {
  visible: boolean;
  onClose: () => void;
  targetMatch: any;
  fetchingComments: boolean;
  commentsList: CommentData[];
  availableBadges: BadgeOption[];
  selectedBadge: BadgeOption | null;
  onSelectBadge: (badge: BadgeOption) => void;
  commentInput: string;
  onChangeCommentInput: (text: string) => void;
  onPostComment: () => void;
  actionLoading: boolean;
  onOpenUserProfile: (userId: string) => void;
  currentUserId?: string;
  onDeleteComment?: (commentId: string) => void;
  onReportComment?: (comment: CommentData) => void;
}

export default function MatchCommentModal({
  visible,
  onClose,
  targetMatch,
  fetchingComments,
  commentsList,
  availableBadges,
  selectedBadge,
  onSelectBadge,
  commentInput,
  onChangeCommentInput,
  onPostComment,
  actionLoading,
  onOpenUserProfile,
  currentUserId,
  onDeleteComment,
  onReportComment,
}: MatchCommentModalProps) {
  if (!targetMatch) return null;

  const isIntramural = targetMatch.status === 'intramural';
  const isMatchEstablished = targetMatch.status !== 'open' && !isIntramural;
  const isGeneralUser = selectedBadge?.type === 'general' || availableBadges.every(b => b.type === 'general');
  const isCommentDisabledForGeneral = isMatchEstablished && isGeneralUser;

  const handleDefaultReport = (comment: CommentData) => {
    if (onReportComment) {
      onReportComment(comment);
      return;
    }
    Alert.alert('댓글 신고/차단', `'${comment.full_name}' 님의 댓글을 신고 또는 차단하시겠습니까?`, [
      { text: '취소', style: 'cancel' },
      {
        text: '신고 접수',
        onPress: () => Alert.alert('접수 완료', '신청하신 댓글이 부적절한 내용으로 관리자에게 신고되었습니다.'),
      },
      {
        text: '유저 차단',
        style: 'destructive',
        onPress: () => Alert.alert('차단 완료', '해당 유저의 게시글과 댓글이 더 이상 보이지 않도록 차단 처리되었습니다.'),
      },
    ]);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>
            {isIntramural ? '💬 팀 내전 소통 댓글' : '💬 주최팀 ↔ 신청팀 소통 댓글'}
          </Text>
          <Text style={styles.modalSub}>
            주최: <Text style={{ fontWeight: '800', color: Colors.primary }}>{targetMatch.host_team_name}</Text>
            {targetMatch.away_team_name ? ` VS ${targetMatch.away_team_name}` : ''}
          </Text>

          <ScrollView style={styles.commentListScroll} showsVerticalScrollIndicator={false}>
            {fetchingComments ? (
              <ActivityIndicator color={Colors.primary} style={{ marginVertical: 20 }} />
            ) : commentsList.length === 0 ? (
              <View style={styles.emptyCommentBox}>
                <Text style={styles.emptyCommentText}>
                  아직 댓글이 없습니다.{'\n'}주차, 네트 높이, 혼성 비율 등을 자유롭게 질문해보세요!
                </Text>
              </View>
            ) : (
              commentsList.map((item) => {
                const isMyComment = currentUserId && item.user_id === currentUserId;
                return (
                  <View key={item.id} style={styles.commentItem}>
                    <View style={styles.commentHeaderRow}>
                      <TouchableOpacity 
                        style={styles.authorGroup} 
                        onPress={() => onOpenUserProfile(item.user_id)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.badgeChip}>
                          <Text style={styles.badgeChipText}>{item.badgeLabel || '🏐 티볼리 유저'}</Text>
                        </View>
                        <Text style={styles.commentAuthorName}>{item.full_name} 👤</Text>
                      </TouchableOpacity>

                      <View style={styles.actionGroup}>
                        {isMyComment ? (
                          onDeleteComment && (
                            <TouchableOpacity onPress={() => onDeleteComment(item.id)} hitSlop={8}>
                              <Text style={styles.deleteText}>삭제</Text>
                            </TouchableOpacity>
                          )
                        ) : (
                          <TouchableOpacity onPress={() => handleDefaultReport(item)} hitSlop={8}>
                            <Text style={styles.reportText}>신고/차단</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                    <Text style={styles.commentContentText}>{item.content}</Text>
                  </View>
                );
              })
            )}
          </ScrollView>

          {/* 뱃지 선택 영역 */}
          {availableBadges.length > 1 && !isCommentDisabledForGeneral && (
            <>
              <Text style={styles.badgeSelectTitle}>🏷️ 내 발언 소속 선택:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginBottom: 8 }}>
                {availableBadges.map((badge, idx) => {
                  const isSelected = selectedBadge?.type === badge.type && selectedBadge?.teamName === badge.teamName;
                  return (
                    <TouchableOpacity
                      key={idx}
                      style={[styles.badgeSelectChip, isSelected && styles.badgeSelectChipActive]}
                      onPress={() => onSelectBadge(badge)}
                    >
                      <Text style={[styles.badgeSelectChipText, isSelected && styles.badgeSelectChipTextActive]}>
                        {badge.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </>
          )}

          {/* 댓글 입력 영역 */}
          {isCommentDisabledForGeneral ? (
            <View style={styles.disabledBanner}>
              <Text style={styles.disabledBannerText}>
                🔒 경기가 성사되어 일반 사용자의 댓글 사용이 중지됩니다.
              </Text>
            </View>
          ) : (
            <View style={styles.commentInputRow}>
              <TextInput
                style={styles.commentTextInput}
                placeholder="질문이나 안내사항을 입력하세요..."
                placeholderTextColor="#94A3B8"
                value={commentInput}
                onChangeText={onChangeCommentInput}
              />
              <TouchableOpacity style={styles.commentSendBtn} onPress={onPostComment} disabled={actionLoading}>
                {actionLoading ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.commentSendBtnText}>등록</Text>}
              </TouchableOpacity>
            </View>
          )}

          {/* 💡 [신규] 모달 내 스티커 광고 배너 추가 */}
          <View style={{ marginTop: 8, borderRadius: 10, overflow: 'hidden' }}>
            <StickyAdBanner isModal={true} />
          </View>

          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>닫기</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  modalContent: { backgroundColor: Colors.surface, borderRadius: 20, padding: 16, width: '100%', maxHeight: '85%', elevation: 5 },
  modalTitle: { fontSize: 16, fontWeight: '800', color: Colors.text, marginBottom: 2 },
  modalSub: { fontSize: 12, color: Colors.textMuted, marginBottom: 8 },
  commentListScroll: { maxHeight: 220, marginVertical: 6 },
  emptyCommentBox: { padding: 24, alignItems: 'center' },
  emptyCommentText: { color: '#94A3B8', fontSize: 12, fontWeight: '600', textAlign: 'center', lineHeight: 18 },
  commentItem: { backgroundColor: '#F8FAFC', borderRadius: 10, padding: 10, marginBottom: 6, borderWidth: 1, borderColor: '#E2E8F0' },
  commentHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  authorGroup: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  commentAuthorName: { fontSize: 13, fontWeight: '800', color: Colors.text, textDecorationLine: 'underline' },
  badgeChip: { backgroundColor: '#EFF6FF', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: '#BFDBFE' },
  badgeChipText: { fontSize: 10, fontWeight: '800', color: '#1D4ED8' },
  actionGroup: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  deleteText: { fontSize: 11, fontWeight: '700', color: '#EF4444' },
  reportText: { fontSize: 11, fontWeight: '700', color: '#94A3B8' },
  commentContentText: { fontSize: 13, color: Colors.text, lineHeight: 18 },
  badgeSelectTitle: { fontSize: 11, fontWeight: '800', color: '#475569', marginBottom: 4 },
  badgeSelectChip: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 10, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#CBD5E1' },
  badgeSelectChipActive: { backgroundColor: '#2563EB', borderColor: '#1D4ED8' },
  badgeSelectChipText: { fontSize: 11, fontWeight: '700', color: '#475569' },
  badgeSelectChipTextActive: { color: '#FFFFFF', fontWeight: '800' },
  commentInputRow: { flexDirection: 'row', gap: 6, marginTop: 4 },
  commentTextInput: { flex: 1, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, color: Colors.text },
  commentSendBtn: { backgroundColor: Colors.primary, borderRadius: 10, paddingHorizontal: 16, justifyContent: 'center', alignItems: 'center' },
  commentSendBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },
  disabledBanner: { backgroundColor: '#F1F5F9', paddingVertical: 12, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: '#CBD5E1', marginTop: 4 },
  disabledBannerText: { color: '#64748B', fontSize: 11.5, fontWeight: '800' },
  closeBtn: { backgroundColor: '#F1F5F9', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  closeBtnText: { color: Colors.text, fontSize: 14, fontWeight: '800' },
});