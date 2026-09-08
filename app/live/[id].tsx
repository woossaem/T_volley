import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Platform, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { Colors } from '../../constants/Colors';
import ScoreboardScreen from '../scoreboard';

function resolveLiveParam(raw: string | string[] | undefined): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return '';
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default function LiveScoreboardScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const rawId = resolveLiveParam(params.id);
  const [matchId, setMatchId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadMatch = async () => {
      if (!rawId) {
        setError('경기 코드를 찾을 수 없습니다.');
        setLoading(false);
        return;
      }

      const isShortCode = rawId.toUpperCase().startsWith('TV-');
      const lookupValue = isShortCode ? rawId.toUpperCase() : rawId;
      const column = isShortCode ? 'short_code' : 'id';

      const { data, error: queryError } = await supabase
        .from('matches')
        .select('id')
        .eq(column, lookupValue)
        .maybeSingle();

      if (cancelled) return;

      if (queryError || !data?.id) {
        setError('경기를 찾을 수 없습니다. 링크를 다시 확인해 주세요.');
        setMatchId(null);
        setLoading(false);
        return;
      }

      setMatchId(data.id);
      setError(null);
      setLoading(false);
    };

    setLoading(true);
    void loadMatch();
    return () => {
      cancelled = true;
    };
  }, [rawId]);

  const showPlgBanner = Platform.OS === 'web';

  if (loading) {
    return (
      <View style={styles.fallback}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.fallbackText}>라이브 전광판을 불러오는 중입니다...</Text>
      </View>
    );
  }

  if (error || !matchId) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.fallbackTitle}>전광판을 열 수 없습니다</Text>
        <Text style={styles.fallbackText}>{error || '경기를 찾을 수 없습니다.'}</Text>
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <View style={styles.boardFrame}>
        <ScoreboardScreen matchId={matchId} isSpectator={true} />
      </View>
      {showPlgBanner ? (
        <View style={styles.plgBanner} pointerEvents="box-none">
          <View style={styles.plgCard}>
            <View style={styles.qrPlaceholder}>
              <Text style={styles.qrMark}>QR</Text>
            </View>
            <View style={styles.plgCopy}>
              <Text style={styles.plgTitle}>🏐 우리 팀 경기 기록, 더 스마트하게</Text>
              <Text style={styles.plgSub}>선수 교체부터 개인 스탯까지 빠르고 간편하게!</Text>
              <TouchableOpacity
                style={styles.plgCta}
                onPress={() => router.push('/login')}
                activeOpacity={0.85}
              >
                <Text style={styles.plgCtaText}>3초만에 간편 등록하기</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#020617',
  },
  boardFrame: {
    flex: 1,
    width: '100%',
    maxWidth: 1200,
    alignSelf: 'center',
  },
  fallback: {
    flex: 1,
    backgroundColor: '#020617',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  fallbackTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 8,
  },
  fallbackText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 8,
  },
  plgBanner: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    zIndex: 40,
  },
  plgCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(15, 23, 42, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.35)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    maxWidth: 360,
  },
  qrPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrMark: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 1,
  },
  plgCopy: {
    flex: 1,
  },
  plgTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  plgSub: {
    color: '#CBD5E1',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 3,
    lineHeight: 16,
  },
  plgCta: {
    marginTop: 8,
    backgroundColor: '#2563EB',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  plgCtaText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
});
