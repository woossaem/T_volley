import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Colors } from '../constants/Colors';

export default function FeedbackScreen() {
  const router = useRouter();
  const { session } = useAuth();

  const [category, setCategory] = useState<'bug' | 'feature' | 'other'>('bug');
  const [content, setContent] = useState('');
  const [contact, setContact] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const userId = session?.user?.id;

  const handleSubmit = async () => {
    if (!content.trim()) {
      return Alert.alert('알림', '건의나 오류 내용을 작성해 주세요.');
    }

    setSubmitting(true);
    try {
      const categoryLabel =
        category === 'bug'
          ? '오류/버그 제보'
          : category === 'feature'
          ? '신규 기능 제안'
          : '기타 문의';

      // 1. 새로 만드신 `feedbacks` 테이블에 저장
      const { error: dbError } = await supabase.from('feedbacks').insert({
        user_id: userId || null,
        category: categoryLabel,
        content: content.trim(),
        contact: contact.trim() || null,
      });

      if (dbError) throw dbError;

      // 2. 개발자 이메일(wpro424@gmail.com)로 실시간 자동 발송
      try {
        await fetch('https://formsubmit.co/ajax/wpro424@gmail.com', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            _subject: `[티볼리] 새로운 ${categoryLabel}가 접수되었습니다.`,
            카테고리: categoryLabel,
            건의내용: content.trim(),
            회신연락처: contact.trim() || '미작성',
            작성자ID: userId || '비로그인 유저',
          }),
        });
      } catch (emailErr) {
        console.log('이메일 전송 예외 (DB에는 정상 저장됨):', emailErr);
      }

      Alert.alert(
        '전송 완료! 🎉',
        '선생님의 의견이 안전하게 등록되었습니다. 더 멋진 티볼리를 만들어 가겠습니다.',
        [{ text: '확인', onPress: () => router.back() }]
      );
    } catch (err: any) {
      Alert.alert('오류', err.message || '의견 제출 중 문제가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} hitSlop={10}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>건의 및 오류 리포트</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.introBox}>
          <Text style={styles.introTitle}>💬 개발자에게 의견 보내기</Text>
          <Text style={styles.introSub}>
            앱 이용 중 불편한 점, 버그, 또는 새롭게 원하시는 아이디어가 있다면 언제든 자유롭게 남겨주세요!
          </Text>
        </View>

        <Text style={styles.label}>1. 유형 선택</Text>
        <View style={styles.categoryRow}>
          <TouchableOpacity
            style={[styles.catChip, category === 'bug' && styles.catChipActive]}
            onPress={() => setCategory('bug')}
          >
            <Text style={[styles.catChipText, category === 'bug' && styles.catChipTextActive]}>
              🚨 오류 / 버그 제보
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.catChip, category === 'feature' && styles.catChipActive]}
            onPress={() => setCategory('feature')}
          >
            <Text style={[styles.catChipText, category === 'feature' && styles.catChipTextActive]}>
              ✨ 신규 기능 제안
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.catChip, category === 'other' && styles.catChipActive]}
            onPress={() => setCategory('other')}
          >
            <Text style={[styles.catChipText, category === 'other' && styles.catChipTextActive]}>
              💡 기타 문의
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.label}>2. 상세 내용</Text>
        <TextInput
          style={styles.textArea}
          placeholder="화면 멈춤, 글자 깨짐, 아이디어 등 상세히 작성해 주시면 큰 도움이 됩니다."
          placeholderTextColor="#94A3B8"
          multiline
          numberOfLines={6}
          textAlignVertical="top"
          value={content}
          onChangeText={setContent}
        />

        <Text style={styles.label}>3. 회신받으실 연락처 (선택)</Text>
        <TextInput
          style={styles.input}
          placeholder="이메일 또는 전화번호 (필요시 답변을 드립니다)"
          placeholderTextColor="#94A3B8"
          value={contact}
          onChangeText={setContact}
        />

        <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit} disabled={submitting}>
          {submitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.submitBtnText}>의견 보내기 🚀</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: { width: 32, height: 32, justifyContent: 'center' },
  backText: { fontSize: 32, color: Colors.text, lineHeight: 32 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: Colors.text },
  content: { padding: 20, gap: 14 },
  introBox: {
    backgroundColor: '#FEF3C7',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#FDE68A',
    marginBottom: 6,
  },
  introTitle: { fontSize: 15, fontWeight: '800', color: '#B45309', marginBottom: 4 },
  introSub: { fontSize: 13, color: '#92400E', lineHeight: 18 },
  label: { fontSize: 14, fontWeight: '800', color: Colors.text, marginTop: 6 },
  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  catChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  catChipText: { fontSize: 13, fontWeight: '700', color: '#475569' },
  catChipTextActive: { color: '#FFFFFF' },
  textArea: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 14,
    fontSize: 14,
    minHeight: 120,
    color: Colors.text,
  },
  input: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 14,
    fontSize: 14,
    color: Colors.text,
  },
  submitBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 14,
  },
  submitBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
});