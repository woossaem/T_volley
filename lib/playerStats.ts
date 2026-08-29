import { parseSetScoresString } from './matchSets';
import { isAnonymousSlotId, listHasUser, parseRosterUserIds, parseSetRosterMap, safeIncludes } from './roster';

export interface PlayerCareerStats {
  points: number;
  faults: number;
  setsPlayed: number;
  setWins: number;
  setDraws: number;
  setLosses: number;
  setWinRate: number;
  matchesPlayed: number;
  matchWins: number;
  matchDraws: number;
  matchLosses: number;
  matchWinRate: number;
}

export type PlayerEventLike = {
  match_id?: string;
  player_id?: string | null;
  event_type?: string;
  is_canceled?: boolean;
};

const EMPTY_STATS: PlayerCareerStats = {
  points: 0,
  faults: 0,
  setsPlayed: 0,
  setWins: 0,
  setDraws: 0,
  setLosses: 0,
  setWinRate: 0,
  matchesPlayed: 0,
  matchWins: 0,
  matchDraws: 0,
  matchLosses: 0,
  matchWinRate: 0,
};

function isDrawWinner(winner?: string | null) {
  return winner === 'draw' || winner === '무승부';
}

export function emptyPlayerCareerStats(): PlayerCareerStats {
  return { ...EMPTY_STATS };
}

export function isScoringEvent(eventType?: string | null) {
  return eventType === 'score' || eventType === 'fault' || eventType === 'manual';
}

/** 개인 킬 득점 (상대 범실로 올린 팀 득점은 제외) */
export function isPersonalKill(eventType?: string | null) {
  return eventType === 'score';
}

export function isPersonalFault(eventType?: string | null) {
  return eventType === 'fault';
}

export function addMatchPlayerStats(
  acc: PlayerCareerStats,
  userId: string,
  match: any,
  events: PlayerEventLike[],
): PlayerCareerStats {
  if (!userId || !match) return acc;

  const inHost = listHasUser(parseRosterUserIds(match.host_roster), userId) || safeIncludes(match.host_roster, userId);
  const inAway = listHasUser(parseRosterUserIds(match.away_roster), userId) || safeIncludes(match.away_roster, userId);
  const inHostMerc = listHasUser(parseRosterUserIds(match.host_mercenary_roster), userId) || safeIncludes(match.host_mercenary_roster, userId);
  const inAwayMerc = listHasUser(parseRosterUserIds(match.away_mercenary_roster), userId) || safeIncludes(match.away_mercenary_roster, userId);

  if (!inHost && !inAway && !inHostMerc && !inAwayMerc) return acc;

  const hostMap = parseSetRosterMap(match.host_roster);
  const awayMap = parseSetRosterMap(match.away_roster);
  const scores = parseSetScoresString(match.set_scores);
  const setCount = Math.max(scores.length, Object.keys(hostMap).length, Object.keys(awayMap).length, 1);

  let playedThisMatch = false;
  for (let idx = 0; idx < setCount; idx += 1) {
    const hostLine = hostMap[idx] || hostMap[0] || [];
    const awayLine = awayMap[idx] || awayMap[0] || [];
    const onHost = listHasUser(hostLine, userId) || (inHost && hostLine.length === 0);
    const onAway = listHasUser(awayLine, userId) || (inAway && awayLine.length === 0);
    if (!onHost && !onAway) continue;

    playedThisMatch = true;
    acc.setsPlayed += 1;
    const score = scores[idx];
    if (!score) continue;
    const myScore = onHost ? score.host : score.away;
    const oppScore = onHost ? score.away : score.host;
    if (myScore > oppScore) acc.setWins += 1;
    else if (myScore < oppScore) acc.setLosses += 1;
    else acc.setDraws += 1;
  }

  if (playedThisMatch || inHost || inAway || inHostMerc || inAwayMerc) {
    acc.matchesPlayed += 1;
    const myTeam = (inHost || inHostMerc) ? match.host_team_name : match.away_team_name;
    if (isDrawWinner(match.winner_team)) acc.matchDraws += 1;
    else if (match.winner_team === myTeam) acc.matchWins += 1;
    else acc.matchLosses += 1;
  }

  events.forEach((e) => {
    if (!e || e.is_canceled) return;
    if (!e.player_id || isAnonymousSlotId(e.player_id) || e.player_id !== userId) return;
    if (isPersonalKill(e.event_type)) acc.points += 1;
    if (isPersonalFault(e.event_type)) acc.faults += 1;
  });

  acc.setWinRate = acc.setsPlayed > 0 ? Math.round((acc.setWins / acc.setsPlayed) * 100) : 0;
  acc.matchWinRate = acc.matchesPlayed > 0 ? Math.round((acc.matchWins / acc.matchesPlayed) * 100) : 0;
  return acc;
}

export function finalizePlayerStats(acc: PlayerCareerStats): PlayerCareerStats {
  acc.setWinRate = acc.setsPlayed > 0 ? Math.round((acc.setWins / acc.setsPlayed) * 100) : 0;
  acc.matchWinRate = acc.matchesPlayed > 0 ? Math.round((acc.matchWins / acc.matchesPlayed) * 100) : 0;
  return acc;
}
