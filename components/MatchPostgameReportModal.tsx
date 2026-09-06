import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { Colors } from '../constants/Colors';
import ScoreTimeline, { MatchEvent } from './ScoreTimeline';
import { parseRosterUserIds, parseSetRosterMap, safeIncludes } from '../lib/roster';
import { isPersonalFault, isPersonalKill } from '../lib/playerStats';
import { resolveTeamName } from '../lib/nameUtils';
import { formatPlayerDisplayName } from '../lib/tempPlayer';

interface MatchPostgameReportModalProps {
  visible: boolean;
  onClose: () => void;
  match: any;
  initialEvents?: MatchEvent[];
}

type ReportTab = 'card' | 'highlight' | 'timeline';

interface PlayerStat {
  name: string;
  playerId: string | null;
  team: 'host' | 'away';
  points: number;
  faults: number;
}

interface StreakSpan {
  length: number;
  setIndex: number;
  fromHost: number;
  fromAway: number;
  toHost: number;
  toAway: number;
}

interface SetSummary {
  setIndex: number;
  hostScore: number;
  awayScore: number;
  clutchName: string | null;
  clutchTeam: 'host' | 'away' | null;
  mvp: PlayerStat | null;
  mvpLine: string;
  maxHostStreak: number;
  maxAwayStreak: number;
}

function isDrawResult(winner?: string | null) {
  if (!winner) return false;
  return winner === 'draw' || winner === '무승부';
}

function formatMvpLine(players: PlayerStat[]): string {
  if (!players.length) return '없음';
  const max = Math.max(...players.map((p) => p.points));
  if (max <= 0) return '없음';
  const tied = players.filter((p) => p.points === max).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  if (tied.length === 1) return `${tied[0].name} (${tied[0].points}점)`;
  return `${tied.map((p) => p.name).join(', ')} (공동 ${max}점)`;
}

function parseSetScoreString(raw?: string | null): { host: number; away: number }[] {
  if (!raw || typeof raw !== 'string' || !raw.trim()) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const parts = s.split(/[:\-]/);
      const host = Number(parts[0]);
      const away = Number(parts[1]);
      return {
        host: Number.isFinite(host) ? host : 0,
        away: Number.isFinite(away) ? away : 0,
      };
    });
}

function computeBestStreak(scoreEvents: MatchEvent[], team: 'host' | 'away'): StreakSpan {
  let best: StreakSpan = { length: 0, setIndex: 0, fromHost: 0, fromAway: 0, toHost: 0, toAway: 0 };
  let current = 0;
  let startHost = 0;
  let startAway = 0;
  let startSet = 0;

  scoreEvents.forEach((e, idx) => {
    const prev = idx > 0 ? scoreEvents[idx - 1] : null;
    if (e.team_type === team) {
      if (current === 0) {
        startHost = prev ? prev.host_score : (e.team_type === 'host' ? Math.max(0, e.host_score - 1) : e.host_score);
        startAway = prev ? prev.away_score : (e.team_type === 'away' ? Math.max(0, e.away_score - 1) : e.away_score);
        startSet = Number(e.set_index) || 0;
      }
      current += 1;
      if (current > best.length) {
        best = {
          length: current,
          setIndex: startSet,
          fromHost: startHost,
          fromAway: startAway,
          toHost: e.host_score,
          toAway: e.away_score,
        };
      }
    } else {
      current = 0;
    }
  });
  return best;
}

function TeamLogoBadge({
  name,
  accent,
  icon,
}: {
  name: string;
  accent: string;
  icon: string;
}) {
  const initial = (name || '?').trim().charAt(0) || '?';
  return (
    <View style={[styles.logoBadge, { borderColor: accent, backgroundColor: `${accent}22` }]}>
      <Text style={styles.logoIcon}>{icon}</Text>
      <Text style={[styles.logoInitial, { color: accent }]}>{initial}</Text>
    </View>
  );
}

function momentumMarks(maxScore: number): number[] {
  const ceiling = Math.max(20, Math.ceil(maxScore / 5) * 5);
  const marks: number[] = [];
  for (let n = 0; n <= ceiling; n += 5) marks.push(n);
  return marks;
}

function MomentumBar({ events, hostName, awayName }: { events: MatchEvent[]; hostName: string; awayName: string }) {
  const flow = events.filter(
    (e) => !e.is_canceled && (e.event_type === 'score' || e.event_type === 'fault')
  );
  const last = flow[flow.length - 1];
  const maxScore = last ? Math.max(last.host_score || 0, last.away_score || 0, flow.length) : 20;
  const marks = momentumMarks(maxScore);

  if (flow.length === 0) {
    return (
      <View>
        <Text style={styles.momentumEmpty}>이 세트의 점수 흐름 기록이 없습니다.</Text>
        <View style={styles.momentumScale}>
          {marks.map((n) => (
            <View key={n} style={styles.momentumScaleItem}>
              <View style={styles.momentumScaleTick} />
              <Text style={styles.momentumScaleText}>{n}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  }
  return (
    <View>
      <View style={styles.momentumHeader}>
        <Text style={styles.momentumTitle}>세트 점수 모멘텀</Text>
        <Text style={styles.momentumLegend}>{hostName} 청 · {awayName} 적</Text>
      </View>
      <View style={styles.momentumTrack}>
        {flow.map((e, i) => (
          <View
            key={`${e.id}-${i}`}
            style={[
              styles.momentumTick,
              { backgroundColor: e.team_type === 'host' ? '#38BDF8' : '#FB7185' },
            ]}
          />
        ))}
      </View>
      <View style={styles.momentumScale}>
        {marks.map((n) => (
          <View key={n} style={styles.momentumScaleItem}>
            <View style={styles.momentumScaleTick} />
            <Text style={styles.momentumScaleText}>{n}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export default function MatchPostgameReportModal({
  visible,
  onClose,
  match,
  initialEvents,
}: MatchPostgameReportModalProps) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<MatchEvent[]>(initialEvents || []);
  const [activeTab, setActiveTab] = useState<ReportTab>('card');
  const [activeSetIndex, setActiveSetIndex] = useState(0);
  const [hostTeamType, setHostTeamType] = useState<'school' | 'club'>('school');
  const [awayTeamType, setAwayTeamType] = useState<'school' | 'club'>('club');
  const [showAllPlayers, setShowAllPlayers] = useState(false);

  useEffect(() => {
    if (visible && match?.id) {
      setActiveTab('card');
      setActiveSetIndex(0);
      setShowAllPlayers(false);
      if (initialEvents && initialEvents.length > 0) {
        setEvents(initialEvents);
      } else {
        fetchEvents();
      }
      fetchTeamTypes();
    }
  }, [visible, match?.id]);

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('match_events')
        .select('*')
        .eq('match_id', match.id)
        .order('created_at', { ascending: true });
      if (data && data.length > 0) {
        setEvents(data);
      } else {
        const logs = Array.isArray(match?.score_logs) ? match.score_logs : [];
        setEvents(logs.map((log: any, idx: number) => ({
          id: String(log.id || `log-${idx}`),
          match_id: match.id,
          set_index: Number(log.set_index ?? ((Number(log.set_number) || 1) - 1)),
          event_type: log.event_type,
          team_type: log.team_type,
          player_id: log.player_id,
          player_name: formatPlayerDisplayName(log.player_id, log.player_name),
          host_score: log.host_score,
          away_score: log.away_score,
          is_canceled: !!log.is_canceled,
        })));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchTeamTypes = async () => {
    if (!match?.host_team_name) return;
    try {
      const names = [match.host_team_name, match.away_team_name].filter(Boolean);
      const { data } = await supabase.from('teams').select('name, team_type').in('name', names);
      (data || []).forEach((t: any) => {
        const type = t.team_type === 'club' ? 'club' : 'school';
        if (t.name === match.host_team_name) setHostTeamType(type);
        if (t.name === match.away_team_name) setAwayTeamType(type);
      });
    } catch {
      // 로고는 이니셜 폴백
    }
  };

  const parsedIntraNames = useMemo(() => {
    if (!match?.description) return { teamA: 'A팀', teamB: 'B팀' };
    const m = match.description.match(/^\[(.*?)\ VS (.*?)\]/);
    if (m) return { teamA: m[1] || 'A팀', teamB: m[2] || 'B팀' };
    return { teamA: 'A팀', teamB: 'B팀' };
  }, [match?.description]);

  const isIntramural = match?.status === 'intramural';
  const intramuralTeamName = resolveTeamName(match?.host_team_name, '우리팀');
  const displayHostName = isIntramural ? parsedIntraNames.teamA : resolveTeamName(match?.host_team_name, '홈팀');
  const displayAwayName = isIntramural ? parsedIntraNames.teamB : resolveTeamName(match?.away_team_name, '어웨이팀');
  const reportSubtitle = isIntramural
    ? `${intramuralTeamName} 자체 내전 (${parsedIntraNames.teamA} vs ${parsedIntraNames.teamB})`
    : `${displayHostName} VS ${displayAwayName}`;
  const hostIcon = isIntramural ? '⚔️' : hostTeamType === 'club' ? '🛡️' : '🏫';
  const awayIcon = isIntramural ? '⚔️' : awayTeamType === 'club' ? '🛡️' : '🏫';

  const analytics = useMemo(() => {
    const hostRosterMap = parseSetRosterMap(match?.host_roster);
    const awayRosterMap = parseSetRosterMap(match?.away_roster);
    const hostRosterIds = parseRosterUserIds(match?.host_roster);
    const awayRosterIds = parseRosterUserIds(match?.away_roster);

    const resolveTeam = (e: MatchEvent): 'host' | 'away' => {
      if (e.player_id && (safeIncludes(match?.away_roster, e.player_id) || awayRosterIds.includes(e.player_id))) {
        if (!hostRosterIds.includes(e.player_id) && Object.keys(awayRosterMap).length > 0) return 'away';
      }
      if (e.player_id && (safeIncludes(match?.host_roster, e.player_id) || hostRosterIds.includes(e.player_id))) {
        if (!awayRosterIds.includes(e.player_id) && Object.keys(hostRosterMap).length > 0) return 'host';
      }
      return e.team_type;
    };

    const validScores = events.filter((e) => (e.event_type === 'score' || e.event_type === 'fault') && !e.is_canceled);
    const scoredEvents = events.filter(
      (e) => !e.is_canceled && (e.event_type === 'score' || e.event_type === 'fault' || e.event_type === 'manual')
    );

    const playerMap = new Map<string, PlayerStat>();
    const bump = (team: 'host' | 'away', e: MatchEvent, field: 'points' | 'faults') => {
      const displayName = formatPlayerDisplayName(e.player_id, e.player_name);
      const key = `${team}:${e.player_id || displayName}`;
      const prev = playerMap.get(key);
      if (prev) prev[field] += 1;
      else {
        playerMap.set(key, {
          name: displayName,
          playerId: e.player_id || null,
          team,
          points: field === 'points' ? 1 : 0,
          faults: field === 'faults' ? 1 : 0,
        });
      }
    };

    events.forEach((e) => {
      if (e.is_canceled) return;
      if (isPersonalKill(e.event_type)) bump(resolveTeam(e), e, 'points');
      if (isPersonalFault(e.event_type)) {
        const faultTeam = e.team_type === 'host' ? 'away' : 'host';
        bump(faultTeam, e, 'faults');
      }
    });

    const allPlayers = Array.from(playerMap.values()).sort(
      (a, b) => b.points - a.points || b.faults - a.faults
    );
    const hostPlayers = allPlayers.filter((p) => p.team === 'host');
    const awayPlayers = allPlayers.filter((p) => p.team === 'away');
    const mvp = [...allPlayers].sort((a, b) => b.points - a.points)[0] || null;
    const hostTop = hostPlayers[0] || null;
    const awayTop = awayPlayers[0] || null;
    const mvpLine = formatMvpLine(allPlayers);
    const hostTopLine = formatMvpLine(hostPlayers);
    const awayTopLine = formatMvpLine(awayPlayers);

    const setIndexSet = new Set<number>();
    scoredEvents.forEach((e) => setIndexSet.add(Number(e.set_index)));
    validScores.forEach((e) => setIndexSet.add(Number(e.set_index)));

    const storedSets = parseSetScoreString(match?.set_scores);
    storedSets.forEach((_, idx) => setIndexSet.add(idx));

    const maxFromEvents = setIndexSet.size > 0 ? Math.max(...Array.from(setIndexSet)) : -1;
    const setsPlayedCount = Math.max(storedSets.length, maxFromEvents + 1, 1);

    const setSummaries: SetSummary[] = Array.from({ length: setsPlayedCount }).map((_, idx) => {
      const setScores = validScores.filter((e) => Number(e.set_index) === idx);
      const setAll = scoredEvents.filter((e) => Number(e.set_index) === idx);
      const lastScore = setScores[setScores.length - 1];
      const lastAny = setAll[setAll.length - 1];
      const stored = storedSets[idx];

      const hostScore = stored ? stored.host : lastAny ? lastAny.host_score : lastScore ? lastScore.host_score : 0;
      const awayScore = stored ? stored.away : lastAny ? lastAny.away_score : lastScore ? lastScore.away_score : 0;

      const setPlayerMap = new Map<string, PlayerStat>();
      setScores.forEach((e) => {
        if (!isPersonalKill(e.event_type)) return;
        const team = resolveTeam(e);
        const displayName = formatPlayerDisplayName(e.player_id, e.player_name);
        const key = `${team}:${e.player_id || displayName}`;
        const prev = setPlayerMap.get(key);
        if (prev) prev.points += 1;
        else setPlayerMap.set(key, { name: displayName, playerId: e.player_id || null, team, points: 1, faults: 0 });
      });
      const setPlayers = Array.from(setPlayerMap.values());
      const setMvp = setPlayers.sort((a, b) => b.points - a.points)[0] || null;
      const setMvpLine = formatMvpLine(setPlayers);
      const hostStreak = computeBestStreak(setScores, 'host');
      const awayStreak = computeBestStreak(setScores, 'away');

      return {
        setIndex: idx,
        hostScore,
        awayScore,
        clutchName: lastScore ? formatPlayerDisplayName(lastScore.player_id, lastScore.player_name) : null,
        clutchTeam: lastScore?.team_type || null,
        mvp: setMvp,
        mvpLine: setMvpLine,
        maxHostStreak: hostStreak.length,
        maxAwayStreak: awayStreak.length,
      };
    });

    const matchClutchNames = Array.from(
      new Set(setSummaries.map((s) => s.clutchName).filter((n): n is string => !!n))
    );

    const hostStreak = computeBestStreak(validScores, 'host');
    const awayStreak = computeBestStreak(validScores, 'away');

    let hostSetWins = 0;
    let awaySetWins = 0;
    setSummaries.forEach((s) => {
      if (s.hostScore > s.awayScore) hostSetWins++;
      else if (s.awayScore > s.hostScore) awaySetWins++;
    });

    return {
      allPlayers,
      hostPlayers,
      awayPlayers,
      mvp,
      mvpLine,
      hostTop,
      hostTopLine,
      awayTop,
      awayTopLine,
      setSummaries,
      matchClutchNames,
      hostStreak,
      awayStreak,
      setsPlayedCount,
      hostSetWins,
      awaySetWins,
      isDraw: isDrawResult(match?.winner_team),
    };
  }, [events, match?.set_scores, match?.winner_team, match?.host_roster, match?.away_roster]);

  const winnerLabel = useMemo(() => {
    if (analytics.isDraw) return '🤝 무승부';
    if (match?.winner_team) return `🥇 ${match.winner_team} 승리`;
    return '진행 중';
  }, [analytics.isDraw, match?.winner_team]);

  const setScoreLine = useMemo(() => {
    if (analytics.setSummaries.length === 0) return '기록 없음';
    const hasAny = analytics.setSummaries.some((s) => s.hostScore > 0 || s.awayScore > 0);
    if (!hasAny && !match?.set_scores) return '기록 없음';
    return analytics.setSummaries.map((s) => `${s.hostScore}:${s.awayScore}`).join(', ');
  }, [analytics.setSummaries, match?.set_scores]);

  const formatStreakLine = (span: StreakSpan) => {
    if (span.length <= 0) return '연속 득점 없음';
    return `${span.setIndex + 1}세트 ${span.fromHost}:${span.fromAway} ➔ ${span.toHost}:${span.toAway} 구간 (${span.length}연속 득점)`;
  };

  const activeSetSummary = analytics.setSummaries[activeSetIndex] || analytics.setSummaries[0];
  const activeSetEvents = events.filter((e) => Number(e.set_index) === activeSetIndex);

  if (!match) return null;

  const renderShareCard = () => (
    <View style={styles.shareCard}>
      <Text style={styles.shareBrand}>🏐 T volley MATCH REPORT</Text>

      <View style={styles.shareScoreRow}>
        <View style={styles.shareTeamCol}>
          <TeamLogoBadge name={displayHostName} accent="#38BDF8" icon={hostIcon} />
          <Text style={styles.shareTeamName} numberOfLines={2}>{displayHostName}</Text>
        </View>
        <View style={styles.shareScoreCol}>
          <Text style={styles.shareFinalScore}>
            {analytics.hostSetWins}  :  {analytics.awaySetWins}
          </Text>
          <Text style={styles.shareWinner}>{winnerLabel}</Text>
        </View>
        <View style={styles.shareTeamCol}>
          <TeamLogoBadge name={displayAwayName} accent="#FB7185" icon={awayIcon} />
          <Text style={styles.shareTeamName} numberOfLines={2}>{displayAwayName}</Text>
        </View>
      </View>

      <View style={styles.shareSetRow}>
        {analytics.setSummaries.map((s) => (
          <View
            key={s.setIndex}
            style={[styles.shareSetPill, s.hostScore === s.awayScore && styles.shareSetPillDraw]}
          >
            <Text style={styles.shareSetLabel}>{s.setIndex + 1}세트</Text>
            <Text style={styles.shareSetScore}>{s.hostScore}-{s.awayScore}</Text>
          </View>
        ))}
      </View>

      <View style={styles.shareStatRow}>
        <View style={styles.shareStatChip}>
          <Text style={styles.shareStatEmoji}>👑</Text>
          <Text style={styles.shareStatTitle}>경기 MVP</Text>
          <Text style={styles.shareStatValue}>{analytics.mvpLine}</Text>
        </View>
        <View style={styles.shareStatChip}>
          <Text style={styles.shareStatEmoji}>🎯</Text>
          <Text style={styles.shareStatTitle}>클러치 요정</Text>
          <Text style={styles.shareStatValue}>
            {analytics.matchClutchNames.length > 0 ? analytics.matchClutchNames.join(', ') : '없음'}
          </Text>
        </View>
      </View>

      <View style={styles.shareTopRow}>
        <View style={[styles.shareTopBox, { borderColor: '#38BDF8' }]}>
          <Text style={[styles.shareTopLabel, { color: '#7DD3FC' }]}>{displayHostName} 최다득점</Text>
          <Text style={styles.shareTopValue}>{analytics.hostTopLine}</Text>
        </View>
        <View style={[styles.shareTopBox, { borderColor: '#FB7185' }]}>
          <Text style={[styles.shareTopLabel, { color: '#FDA4AF' }]}>{displayAwayName} 최다득점</Text>
          <Text style={styles.shareTopValue}>{analytics.awayTopLine}</Text>
        </View>
      </View>
    </View>
  );

  const renderPlayerGrid = (players: PlayerStat[], teamLabel: string, accent: string) => (
    <View style={styles.playerTeamBlock}>
      <Text style={[styles.playerTeamTitle, { color: accent }]}>{teamLabel}</Text>
      {players.length === 0 ? (
        <Text style={styles.playerEmpty}>기록 없음</Text>
      ) : (
        <View style={styles.playerGrid}>
          {players.map((p) => (
            <View key={`${p.team}-${p.playerId || p.name}`} style={styles.playerCell}>
              <Text style={styles.playerCellText} numberOfLines={1}>
                {formatPlayerDisplayName(p.playerId, p.name)} {p.points}({p.faults})
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );

  const renderCompareStreak = () => (
    <View style={styles.streakCompare}>
      <Text style={styles.streakCompareTitle}>🔥 최대 연속 득점</Text>
      <View style={styles.streakCompareRow}>
        <View style={[styles.streakSide, styles.streakHost]}>
          <Text style={styles.streakSideName} numberOfLines={1}>{displayHostName}</Text>
          <Text style={styles.streakSideValue}>{analytics.hostStreak.length}연속</Text>
          <Text style={styles.streakSideSpan}>{formatStreakLine(analytics.hostStreak)}</Text>
        </View>
        <View style={styles.streakVs}><Text style={styles.streakVsText}>VS</Text></View>
        <View style={[styles.streakSide, styles.streakAway]}>
          <Text style={[styles.streakSideName, { color: '#9F1239' }]} numberOfLines={1}>{displayAwayName}</Text>
          <Text style={[styles.streakSideValue, { color: '#9F1239' }]}>{analytics.awayStreak.length}연속</Text>
          <Text style={[styles.streakSideSpan, { color: '#BE123C' }]}>{formatStreakLine(analytics.awayStreak)}</Text>
        </View>
      </View>
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>📊 경기 결과 & 리뷰 리포트</Text>
          <Text style={styles.modalSub}>{reportSubtitle}</Text>

          <View style={styles.tabRow}>
            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'card' && styles.tabBtnActive]}
              onPress={() => setActiveTab('card')}
            >
              <Text style={[styles.tabText, activeTab === 'card' && styles.tabTextActive]}>📸 경기 요약</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'highlight' && styles.tabBtnActive]}
              onPress={() => setActiveTab('highlight')}
            >
              <Text style={[styles.tabText, activeTab === 'highlight' && styles.tabTextActive]}>🏆 하이라이트</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'timeline' && styles.tabBtnActive]}
              onPress={() => setActiveTab('timeline')}
            >
              <Text style={[styles.tabText, activeTab === 'timeline' && styles.tabTextActive]}>📈 세트별</Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={Colors.primary} />
            </View>
          ) : (
            <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
              {activeTab === 'card' ? (
                <View style={styles.cardTabWrap}>
                  {renderShareCard()}
                </View>
              ) : activeTab === 'highlight' ? (
                <View style={styles.highlightContainer}>
                  <View style={styles.playerListBox}>
                    <TouchableOpacity
                      style={styles.expandPlayersBtn}
                      onPress={() => setShowAllPlayers((prev) => !prev)}
                    >
                      <Text style={styles.playerListHeading}>개인별 득점 / 범실</Text>
                      <Text style={styles.expandPlayersText}>
                        {showAllPlayers ? '접기 ▴' : '펼쳐 보기 ▾'}
                      </Text>
                    </TouchableOpacity>
                    {showAllPlayers ? (
                      <>
                        {renderPlayerGrid(analytics.hostPlayers, displayHostName, '#0284C7')}
                        {renderPlayerGrid(analytics.awayPlayers, displayAwayName, '#E11D48')}
                      </>
                    ) : null}
                  </View>

                  <View style={styles.scoreSummaryBox}>
                    <Text style={styles.scoreSummaryTitle}>최종 결과</Text>
                    <Text style={styles.scoreSummaryWinner}>{winnerLabel}</Text>
                    <Text style={styles.scoreSummarySets}>세트승 {analytics.hostSetWins} : {analytics.awaySetWins}</Text>
                    <Text style={styles.scoreSummarySets}>세트 점수 {setScoreLine}</Text>
                  </View>

                  <View style={styles.recordGrid}>
                    <View style={styles.recordCard}>
                      <Text style={styles.recordEmoji}>👑</Text>
                      <Text style={styles.recordTitle}>오늘의 득점왕 (MVP)</Text>
                      <Text style={styles.recordValue}>{analytics.mvpLine}</Text>
                    </View>
                    <View style={styles.recordCard}>
                      <Text style={styles.recordEmoji}>🎯</Text>
                      <Text style={styles.recordTitle}>경기 전체 클러치</Text>
                      <Text style={styles.recordValue}>
                        {analytics.matchClutchNames.length > 0 ? analytics.matchClutchNames.join(', ') : '없음'}
                      </Text>
                    </View>
                  </View>

                  {renderCompareStreak()}
                </View>
              ) : (
                <View style={styles.timelineContainer}>
                  <View style={styles.setTabNavRow}>
                    {Array.from({ length: analytics.setsPlayedCount }).map((_, idx) => (
                      <TouchableOpacity
                        key={idx}
                        style={[styles.setNavPill, activeSetIndex === idx && styles.setNavPillActive]}
                        onPress={() => setActiveSetIndex(idx)}
                      >
                        <Text style={[styles.setNavPillText, activeSetIndex === idx && styles.setNavPillTextActive]}>
                          {idx + 1}세트
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {activeSetSummary ? (
                    <View style={styles.setInsightBox}>
                      <Text style={styles.setInsightScore}>
                        {displayHostName} {activeSetSummary.hostScore} : {activeSetSummary.awayScore} {displayAwayName}
                        {activeSetSummary.hostScore === activeSetSummary.awayScore ? '  ·  무승부 세트' : ''}
                      </Text>
                      <View style={styles.setClutchRow}>
                        <View style={styles.setClutchChip}>
                          <Text style={styles.setClutchLabel}>🏆 세트 MVP</Text>
                          <Text style={styles.setClutchValue}>{activeSetSummary.mvpLine}</Text>
                        </View>
                        <View style={[styles.setClutchChip, { backgroundColor: '#EEF2FF' }]}>
                          <Text style={styles.setClutchLabel}>🎯 세트 클러치</Text>
                          <Text style={styles.setClutchValue}>{activeSetSummary.clutchName || '없음'}</Text>
                        </View>
                      </View>
                      <MomentumBar events={activeSetEvents} hostName={displayHostName} awayName={displayAwayName} />
                    </View>
                  ) : null}

                  <View style={styles.timelineBox}>
                    <ScoreTimeline
                      key={`report-set-${activeSetIndex}`}
                      events={activeSetEvents}
                      canControl={false}
                      displayHostName={displayHostName}
                      displayAwayName={displayAwayName}
                      currentSetIndex={activeSetIndex}
                    />
                  </View>
                </View>
              )}
            </ScrollView>
          )}

          <TouchableOpacity style={[styles.closeBtn, { marginBottom: Math.min(insets.bottom, 8) }]} onPress={onClose} activeOpacity={0.8} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={styles.closeBtnText}>닫기</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  modalContent: { backgroundColor: Colors.surface, borderRadius: 20, padding: 16, width: '100%', maxHeight: '88%', elevation: 5 },
  modalTitle: { fontSize: 18, fontWeight: '900', color: Colors.text, marginBottom: 2 },
  modalSub: { fontSize: 13, color: Colors.textMuted, marginBottom: 12 },

  tabRow: { flexDirection: 'row', backgroundColor: '#F1F5F9', borderRadius: 10, padding: 4, marginBottom: 12 },
  tabBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  tabBtnActive: { backgroundColor: '#FFFFFF', elevation: 1 },
  tabText: { fontSize: 12, fontWeight: '700', color: '#64748B' },
  tabTextActive: { color: Colors.primary, fontWeight: '900' },

  loadingBox: { padding: 40, alignItems: 'center' },
  scrollArea: { flexShrink: 1, flexGrow: 0 },

  cardTabWrap: { gap: 10 },
  shareCard: {
    backgroundColor: '#0F172A',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1E3A5F',
    gap: 14,
  },
  shareBrand: { fontSize: 11, fontWeight: '800', color: '#38BDF8', letterSpacing: 0.6, textAlign: 'center' },
  shareScoreRow: { flexDirection: 'row', alignItems: 'center' },
  shareTeamCol: { flex: 1, alignItems: 'center', gap: 6 },
  shareScoreCol: { alignItems: 'center', paddingHorizontal: 8 },
  shareFinalScore: { fontSize: 28, fontWeight: '900', color: '#F8FAFC' },
  shareWinner: { fontSize: 12, fontWeight: '800', color: '#FBBF24', marginTop: 4 },
  shareTeamName: { fontSize: 12, fontWeight: '800', color: '#E2E8F0', textAlign: 'center' },

  logoBadge: { width: 58, height: 58, borderRadius: 29, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  logoIcon: { fontSize: 12, marginBottom: -2 },
  logoInitial: { fontSize: 20, fontWeight: '900' },

  shareSetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  shareSetPill: { backgroundColor: '#1E293B', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: '#334155', alignItems: 'center' },
  shareSetPillDraw: { borderColor: '#FBBF24' },
  shareSetLabel: { fontSize: 9, fontWeight: '800', color: '#94A3B8' },
  shareSetScore: { fontSize: 13, fontWeight: '900', color: '#F8FAFC' },

  shareStatRow: { flexDirection: 'row', gap: 8 },
  shareStatChip: { flex: 1, backgroundColor: '#1E293B', borderRadius: 12, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: '#334155' },
  shareStatEmoji: { fontSize: 18, marginBottom: 2 },
  shareStatTitle: { fontSize: 10, fontWeight: '800', color: '#FBBF24', marginBottom: 4 },
  shareStatValue: { fontSize: 12, fontWeight: '900', color: '#F8FAFC', textAlign: 'center' },

  shareTopRow: { flexDirection: 'row', gap: 8 },
  shareTopBox: { flex: 1, borderRadius: 10, padding: 10, borderWidth: 1, backgroundColor: '#111827' },
  shareTopLabel: { fontSize: 10, fontWeight: '800', marginBottom: 4 },
  shareTopValue: { fontSize: 12, fontWeight: '900', color: '#F8FAFC' },

  highlightContainer: { gap: 10 },
  scoreSummaryBox: { backgroundColor: '#EFF6FF', borderRadius: 12, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#BFDBFE' },
  scoreSummaryTitle: { fontSize: 11, fontWeight: '800', color: '#3B82F6', marginBottom: 4 },
  scoreSummaryWinner: { fontSize: 20, fontWeight: '900', color: '#1E40AF', marginBottom: 6 },
  scoreSummarySets: { fontSize: 14, fontWeight: '800', color: '#1D4ED8' },

  recordGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 },
  recordCard: { width: '48.5%', backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A', borderRadius: 12, padding: 12, alignItems: 'center' },
  recordEmoji: { fontSize: 24, marginBottom: 4 },
  recordTitle: { fontSize: 11, fontWeight: '800', color: '#D97706', marginBottom: 4, textAlign: 'center' },
  recordValue: { fontSize: 14, fontWeight: '900', color: '#92400E', textAlign: 'center' },

  streakCompare: { backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#E2E8F0' },
  streakCompareTitle: { fontSize: 13, fontWeight: '900', color: Colors.text, marginBottom: 8, textAlign: 'center' },
  streakCompareRow: { flexDirection: 'row', alignItems: 'stretch' },
  streakSide: { flex: 1, borderRadius: 10, padding: 10, borderWidth: 1 },
  streakHost: { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' },
  streakAway: { backgroundColor: '#FFF1F2', borderColor: '#FECDD3' },
  streakVs: { width: 28, alignItems: 'center', justifyContent: 'center' },
  streakVsText: { fontSize: 10, fontWeight: '900', color: '#94A3B8' },
  streakSideName: { fontSize: 11, fontWeight: '800', color: '#1D4ED8', marginBottom: 4 },
  streakSideValue: { fontSize: 18, fontWeight: '900', color: '#1E3A8A', marginBottom: 4 },
  streakSideSpan: { fontSize: 10, fontWeight: '700', color: '#2563EB', lineHeight: 14 },

  playerListBox: { backgroundColor: '#F8FAFC', borderRadius: 12, padding: 10, borderWidth: 1, borderColor: '#E2E8F0', gap: 8 },
  playerListHeading: { fontSize: 14, fontWeight: '900', color: Colors.text, textAlign: 'center' },
  playerTeamBlock: { gap: 4 },
  playerTeamTitle: { fontSize: 12, fontWeight: '900', marginBottom: 2 },
  playerEmpty: { fontSize: 12, color: Colors.textMuted, fontWeight: '600' },
  playerGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  playerCell: { width: '50%', paddingVertical: 4, paddingHorizontal: 6 },
  playerCellText: { fontSize: 12, fontWeight: '800', color: Colors.text },

  timelineContainer: { gap: 8 },
  setTabNavRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  setNavPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0' },
  setNavPillActive: { backgroundColor: '#2563EB', borderColor: '#1D4ED8' },
  setNavPillText: { fontSize: 12, fontWeight: '700', color: '#64748B' },
  setNavPillTextActive: { color: '#FFFFFF', fontWeight: '900' },
  setInsightBox: { backgroundColor: '#F8FAFC', borderRadius: 12, padding: 10, borderWidth: 1, borderColor: '#E2E8F0', gap: 8 },
  setInsightScore: { fontSize: 13, fontWeight: '900', color: Colors.text, textAlign: 'center' },
  setClutchRow: { flexDirection: 'row', gap: 6 },
  setClutchChip: { flex: 1, backgroundColor: '#FFFBEB', borderRadius: 10, padding: 8, borderWidth: 1, borderColor: '#FDE68A' },
  setClutchLabel: { fontSize: 10, fontWeight: '800', color: '#92400E', marginBottom: 3 },
  setClutchValue: { fontSize: 12, fontWeight: '900', color: '#78350F' },
  timelineBox: { backgroundColor: '#0F172A', borderRadius: 12, padding: 12, marginTop: 8 },

  momentumHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  momentumTitle: { fontSize: 11, fontWeight: '900', color: Colors.text },
  momentumLegend: { fontSize: 10, fontWeight: '700', color: Colors.textMuted },
  momentumTrack: { flexDirection: 'row', height: 16, borderRadius: 8, overflow: 'hidden', backgroundColor: '#E2E8F0' },
  momentumTick: { flex: 1, minWidth: 4 },
  momentumScale: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, paddingHorizontal: 2 },
  momentumScaleItem: { alignItems: 'center', minWidth: 18 },
  momentumScaleTick: { width: 1, height: 6, backgroundColor: '#94A3B8', marginBottom: 2 },
  momentumScaleText: { fontSize: 9, fontWeight: '800', color: '#64748B' },
  momentumEmpty: { fontSize: 11, color: Colors.textMuted, fontWeight: '600', textAlign: 'center', marginBottom: 6 },
  expandPlayersBtn: { backgroundColor: '#EFF6FF', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10, alignItems: 'center', borderWidth: 1, borderColor: '#BFDBFE', gap: 2 },
  expandPlayersText: { fontSize: 12, fontWeight: '800', color: '#1D4ED8' },
  closeBtn: { backgroundColor: '#F1F5F9', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 8, minHeight: 44, justifyContent: 'center' },
  closeBtnText: { color: Colors.text, fontSize: 14, fontWeight: '800', lineHeight: 20, includeFontPadding: false },
});
