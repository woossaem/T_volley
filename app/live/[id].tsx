import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Platform,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { Colors } from '../../constants/Colors';
import ScoreboardScreen from '../scoreboard';

const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.rudolfuu.tvolley&pcampaignid=web_share';
const APP_STORE_URL = 'https://apps.apple.com/kr/app/%ED%8B%B0%EB%B3%BC%EB%A6%AC/id6799385540';

function resolveLiveParam(raw: string | string[] | undefined): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return '';
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function PlgPromoBanner() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const compact = width < 768;
  const [isBannerVisible, setIsBannerVisible] = useState(true);

  const handleDownload = () => {
    if (Platform.OS !== 'web') return;
    const userAgent = String(window.navigator.userAgent || '').toLowerCase();
    if (/android/.test(userAgent)) {
      window.open(PLAY_STORE_URL, '_blank');
    } else if (/iphone|ipad|ipod/.test(userAgent)) {
      window.open(APP_STORE_URL, '_blank');
    } else {
      window.open(PLAY_STORE_URL, '_blank');
    }
  };

  if (!isBannerVisible) return null;

  return (
    <View style={[styles.plgBanner, compact && styles.plgBannerCompact]} pointerEvents="box-none">
      <View style={[styles.plgCard, compact && styles.plgCardCompact]}>
        <TouchableOpacity
          style={styles.plgCloseBtn}
          onPress={() => setIsBannerVisible(false)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="배너 닫기"
        >
          <Text style={styles.plgCloseText}>✕</Text>
        </TouchableOpacity>
        <View style={styles.plgCopy}>
          <Text style={[styles.plgTitle, compact && styles.plgTitleCompact]}>🏐 우리 팀 경기 기록, 더 스마트하게</Text>
          <Text style={[styles.plgSub, compact && styles.plgSubCompact]}>선수 교체부터 개인 스탯까지 빠르고 간편하게!</Text>
          <View style={[styles.plgCtaRow, compact && styles.plgCtaRowCompact]}>
            <TouchableOpacity
              style={[styles.plgCta, compact && styles.plgCtaCompact]}
              onPress={() => router.push('/login')}
              activeOpacity={0.85}
            >
              <Text style={[styles.plgCtaText, compact && styles.plgCtaTextCompact]}>3초만에 간편 등록하기</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.plgCta, styles.plgCtaSecondary, compact && styles.plgCtaCompact]}
              onPress={handleDownload}
              activeOpacity={0.85}
            >
              <Text style={[styles.plgCtaText, compact && styles.plgCtaTextCompact]}>앱 다운로드</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

export default function LiveScoreboardScreen() {
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
      {Platform.OS === 'web' ? <PlgPromoBanner /> : null}
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
  plgBannerCompact: {
    right: 8,
    bottom: 8,
    left: 8,
  },
  plgCard: {
    position: 'relative',
    backgroundColor: 'rgba(15, 23, 42, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.35)',
    borderRadius: 12,
    paddingTop: 14,
    paddingBottom: 10,
    paddingHorizontal: 12,
    maxWidth: 360,
  },
  plgCardCompact: {
    paddingTop: 12,
    paddingBottom: 8,
    paddingHorizontal: 10,
    maxWidth: '100%',
    borderRadius: 10,
  },
  plgCloseBtn: {
    position: 'absolute',
    top: 4,
    right: 6,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  plgCloseText: {
    color: '#E2E8F0',
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 16,
  },
  plgCopy: {
    paddingRight: 18,
  },
  plgTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  plgTitleCompact: {
    fontSize: 12,
  },
  plgSub: {
    color: '#CBD5E1',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 3,
    lineHeight: 16,
  },
  plgSubCompact: {
    fontSize: 10,
    lineHeight: 14,
    marginTop: 2,
  },
  plgCtaRow: {
    marginTop: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  plgCtaRowCompact: {
    marginTop: 6,
    gap: 4,
  },
  plgCta: {
    backgroundColor: '#2563EB',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: 'center',
    flexGrow: 1,
  },
  plgCtaCompact: {
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  plgCtaSecondary: {
    backgroundColor: '#334155',
  },
  plgCtaText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  plgCtaTextCompact: {
    fontSize: 11,
  },
});
