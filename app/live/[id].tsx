import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Platform,
  TouchableOpacity,
  useWindowDimensions,
  Modal,
  ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { supabase } from '../../lib/supabase';
import { Colors } from '../../constants/Colors';
import ScoreboardScreen from '../scoreboard';
import TeamLineupPanel, { type TeamLineupView } from '../../components/TeamLineupPanel';
import { loadLiveLineups } from '../../lib/liveLineupView';
import { LIVE_OG_DESCRIPTION, LIVE_OG_IMAGE_URL, liveOgTitle } from '../../lib/liveLink';

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

  const webFixed = Platform.OS === 'web'
    ? { position: 'fixed' as any, zIndex: 1000, elevation: 1000 }
    : null;

  return (
    <View
      style={[styles.plgBanner, compact && styles.plgBannerCompact, webFixed]}
      pointerEvents="box-none"
    >
      <View style={[styles.plgCard, compact && styles.plgCardCompact]} pointerEvents="auto">
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
  const { width, height } = useWindowDimensions();
  const isDesktop = width >= 1024;
  const rawId = resolveLiveParam(params.id);
  const [matchId, setMatchId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hostLineup, setHostLineup] = useState<TeamLineupView | null>(null);
  const [awayLineup, setAwayLineup] = useState<TeamLineupView | null>(null);
  const [dbSwapped, setDbSwapped] = useState(false);
  const [localCourtFlip, setLocalCourtFlip] = useState(false);
  const [servingPlayerId, setServingPlayerId] = useState<string | null>(null);
  const [ogHost, setOgHost] = useState('홈팀');
  const [ogAway, setOgAway] = useState('어웨이팀');
  const [isLineupModalOpen, setIsLineupModalOpen] = useState(false);
  const [focusedTeam, setFocusedTeam] = useState<'ALL' | 'HOME' | 'AWAY'>('ALL');

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

  useEffect(() => {
    if (isDesktop) setIsLineupModalOpen(false);
  }, [isDesktop]);

  useEffect(() => {
    if (!matchId || (!isDesktop && !isLineupModalOpen)) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const next = await loadLiveLineups(matchId);
        if (cancelled || !next) return;
        setHostLineup(next.host);
        setAwayLineup(next.away);
        setDbSwapped(!!next.isSwapped);
        setServingPlayerId(next.servingPlayerId);
        setOgHost(next.hostName);
        setOgAway(next.awayName);
      } catch {
        // 라인업 패널 전용. 전광판 점수 조회와 분리한다.
      }
    };
    void refresh();
    const channel = supabase
      .channel(`live_lineup_${matchId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${matchId}` }, () => {
        void refresh();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'match_sets', filter: `match_id=eq.${matchId}` }, () => {
        void refresh();
      })
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [matchId, isDesktop, isLineupModalOpen]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const title = liveOgTitle(ogHost, ogAway);
    document.title = title;
    const upsertMeta = (attr: string, key: string, value: string) => {
      let tag = document.head.querySelector(`meta[${attr}="${key}"]`);
      if (!tag) {
        tag = document.createElement('meta');
        tag.setAttribute(attr, key);
        document.head.appendChild(tag);
      }
      tag.setAttribute('content', value);
    };
    upsertMeta('name', 'description', LIVE_OG_DESCRIPTION);
    upsertMeta('property', 'og:title', title);
    upsertMeta('property', 'og:description', LIVE_OG_DESCRIPTION);
    upsertMeta('property', 'og:image', LIVE_OG_IMAGE_URL);
    upsertMeta('property', 'og:type', 'website');
  }, [ogHost, ogAway]);

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

  const homeDimmed = focusedTeam === 'AWAY';
  const awayDimmed = focusedTeam === 'HOME';
  const boardSwapped = dbSwapped === localCourtFlip;
  const leftLineup = boardSwapped ? awayLineup : hostLineup;
  const rightLineup = boardSwapped ? hostLineup : awayLineup;
  const ogTitle = liveOgTitle(ogHost, ogAway);

  return (
    <View style={styles.page}>
      {Platform.OS === 'web' ? (
        <Head>
          <title>{ogTitle}</title>
          <meta name="description" content={LIVE_OG_DESCRIPTION} />
          <meta property="og:title" content={ogTitle} />
          <meta property="og:description" content={LIVE_OG_DESCRIPTION} />
          <meta property="og:image" content={LIVE_OG_IMAGE_URL} />
          <meta property="og:type" content="website" />
          <meta name="twitter:card" content="summary_large_image" />
          <meta name="twitter:title" content={ogTitle} />
          <meta name="twitter:description" content={LIVE_OG_DESCRIPTION} />
          <meta name="twitter:image" content={LIVE_OG_IMAGE_URL} />
        </Head>
      ) : null}
      <View style={styles.liveTopBar}>
        <Text style={styles.liveTopTitle} numberOfLines={1}>티볼리 라이브 전광판</Text>
        <TouchableOpacity
          style={[styles.flipBtn, localCourtFlip && styles.flipBtnOn]}
          onPress={() => setLocalCourtFlip((prev) => !prev)}
          hitSlop={8}
        >
          <Text style={[styles.flipBtnText, localCourtFlip && styles.flipBtnTextOn]}>
            {localCourtFlip ? '코트 반전 ON' : '코트 반전'}
          </Text>
        </TouchableOpacity>
      </View>
      <View style={isDesktop ? styles.desktopShell : styles.mobileBoard}>
        {isDesktop ? (
          <TeamLineupPanel
            team={{ name: leftLineup?.teamName }}
            lineup={leftLineup}
            side="left"
            servingPlayerId={servingPlayerId}
          />
        ) : null}
        <View style={isDesktop ? styles.desktopBoard : styles.boardFrame}>
          <ScoreboardScreen
            matchId={matchId}
            isSpectator={true}
            spectatorCourtFlip={localCourtFlip}
            onOpenLineup={!isDesktop ? () => setIsLineupModalOpen(true) : undefined}
          />
        </View>
        {isDesktop ? (
          <TeamLineupPanel
            team={{ name: rightLineup?.teamName }}
            lineup={rightLineup}
            side="right"
            servingPlayerId={servingPlayerId}
          />
        ) : null}
      </View>
      {!isDesktop ? (
        <Modal
          visible={isLineupModalOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setIsLineupModalOpen(false)}
        >
          <View style={styles.lineupModalBackdrop}>
            <View style={[styles.lineupModalSheet, { maxHeight: Math.round(height * 0.85) }]}>
              <View style={styles.lineupModalHeader}>
                <Text style={styles.lineupModalTitle}>선발 라인업 및 대기 명단</Text>
                <TouchableOpacity
                  style={styles.lineupModalClose}
                  onPress={() => setIsLineupModalOpen(false)}
                  hitSlop={8}
                >
                  <Text style={styles.lineupModalCloseText}>✕</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.lineupFilterRow}>
                <TouchableOpacity
                  style={[styles.lineupFilterBtn, focusedTeam === 'ALL' && styles.lineupFilterBtnActive]}
                  onPress={() => setFocusedTeam('ALL')}
                >
                  <Text style={styles.lineupFilterText}>전체 보기</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.lineupFilterBtn, focusedTeam === 'HOME' && styles.lineupFilterBtnHost]}
                  onPress={() => setFocusedTeam('HOME')}
                >
                  <Text style={styles.lineupFilterText} numberOfLines={1}>{leftLineup?.teamName || '홈 팀'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.lineupFilterBtn, focusedTeam === 'AWAY' && styles.lineupFilterBtnAway]}
                  onPress={() => setFocusedTeam('AWAY')}
                >
                  <Text style={styles.lineupFilterText} numberOfLines={1}>{rightLineup?.teamName || '어웨이 팀'}</Text>
                </TouchableOpacity>
              </View>
              <ScrollView style={styles.lineupCompareScroll} contentContainerStyle={styles.lineupCompareRow}>
                <View style={[styles.lineupCompareCol, homeDimmed && styles.lineupDimmed]}>
                  <TeamLineupPanel
                    team={{ name: leftLineup?.teamName }}
                    lineup={leftLineup}
                    side="left"
                    variant="compare"
                    servingPlayerId={servingPlayerId}
                  />
                </View>
                <View style={[styles.lineupCompareCol, awayDimmed && styles.lineupDimmed]}>
                  <TeamLineupPanel
                    team={{ name: rightLineup?.teamName }}
                    lineup={rightLineup}
                    side="right"
                    variant="compare"
                    servingPlayerId={servingPlayerId}
                  />
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>
      ) : null}
      {Platform.OS === 'web' ? <PlgPromoBanner /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#020617',
  },
  liveTopBar: {
    flexShrink: 0,
    zIndex: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#020617',
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  liveTopTitle: { color: '#F8FAFC', fontSize: 13, fontWeight: '800', flex: 1, paddingRight: 8 },
  flipBtn: {
    backgroundColor: '#1E293B',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#475569',
  },
  flipBtnOn: { backgroundColor: '#FDE68A', borderColor: '#F59E0B' },
  flipBtnText: { color: '#E2E8F0', fontSize: 12, fontWeight: '800' },
  flipBtnTextOn: { color: '#78350F' },
  desktopShell: {
    flexDirection: 'row',
    width: '100%',
    flex: 1,
    minHeight: 0,
    backgroundColor: '#090a0f',
    justifyContent: 'center',
    alignItems: 'stretch',
  },
  mobileBoard: {
    flex: 1,
    minHeight: 0,
  },
  boardFrame: {
    flex: 1,
    width: '100%',
    maxWidth: 1200,
    alignSelf: 'center',
  },
  desktopBoard: {
    flex: 1,
    height: '100%',
    minWidth: 0,
    maxWidth: 1200,
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
  lineupModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(9, 10, 15, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 24,
  },
  lineupModalSheet: {
    backgroundColor: '#0F172A',
    borderRadius: 14,
    padding: 12,
    width: '100%',
    maxWidth: 720,
    minHeight: 280,
    maxHeight: '85%',
    overflow: 'hidden',
  },
  lineupModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  lineupModalTitle: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '800',
    flex: 1,
    paddingRight: 8,
  },
  lineupModalClose: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lineupModalCloseText: {
    color: '#E2E8F0',
    fontSize: 18,
    fontWeight: '800',
  },
  lineupFilterRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
  },
  lineupFilterBtn: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 6,
    alignItems: 'center',
    backgroundColor: '#1E293B',
  },
  lineupFilterBtnActive: {
    backgroundColor: '#334155',
  },
  lineupFilterBtnHost: {
    backgroundColor: '#0C4A6E',
  },
  lineupFilterBtnAway: {
    backgroundColor: '#881337',
  },
  lineupFilterText: {
    color: '#E2E8F0',
    fontSize: 11,
    fontWeight: '800',
  },
  lineupCompareScroll: {
    flexGrow: 1,
  },
  lineupCompareRow: {
    flexDirection: 'row',
    gap: 8,
    flexGrow: 1,
  },
  lineupCompareCol: {
    flex: 1,
    minWidth: 0,
  },
  lineupDimmed: {
    opacity: 0.35,
  },
  plgBanner: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    zIndex: 1000,
    elevation: 1000,
    maxWidth: 360,
  },
  plgBannerCompact: {
    right: 8,
    bottom: 88,
    maxWidth: 280,
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
