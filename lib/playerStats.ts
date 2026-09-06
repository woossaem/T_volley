import { listMatchSetRows } from './matchSets';
import { resolvePlayerSetPlay, setLineupsAreEmpty, type ScoreLogLike } from './rankingService';
import { isAnonymousSlotId, listHasUser, parseRosterUserIds, safeIncludes } from './roster';

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

export type SetSide = 'host' | 'away';
export type SetOutcome = 'win' | 'loss' | 'draw';

export type PlayerEventLike = ScoreLogLike & {
  match_id?: string;
  player_id?: string | null;
  event_type?: string;
  is_canceled?: boolean;
  set_index?: number;
  host_score?: number;
  away_score?: number;
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

export function evaluateSetOutcome(hostScore: number, awayScore: number, playedAs: SetSide): SetOutcome {
  const host = Number(hostScore) || 0;
  const away = Number(awayScore) || 0;
  if (host > away) return playedAs === 'host' ? 'win' : 'loss';
  if (away > host) return playedAs === 'away' ? 'win' : 'loss';
  return 'draw';
}

export function formatSetRecordLabel(wins: number, draws: number, losses: number): string {
  return draws > 0 ? `${wins}승 ${draws}무 ${losses}패` : `${wins}승 ${losses}패`;
}

export function emptyPlayerCareerStats(): PlayerCareerStats {
  return { ...EMPTY_STATS };
}

export function isScoringEvent(eventType?: string | null) {
  return eventType === 'score' || eventType === 'fault' || eventType === 'manual';
}

export function isPersonalKill(eventType?: string | null) {
  return eventType === 'score';
}

export function isPersonalFault(eventType?: string | null) {
  return eventType === 'fault';
}

export function readMatchSets(
  match: any,
  events?: PlayerEventLike[],
): Array<{ set_number: number; host_score: number; away_score: number }> {
  return listMatchSetRows({
    ...match,
    match_events: match?.match_events || match?.events || events,
  }).map((s) => ({
    set_number: s.setNumber,
    host_score: s.host_score,
    away_score: s.away_score,
  }));
}

export function addMatchPlayerStats(
  acc: PlayerCareerStats,
  userId: string,
  match: any,
  events: PlayerEventLike[],
  playerName?: string | null,
): PlayerCareerStats {
  if (!userId || !match) return acc;

  const inHost = listHasUser(parseRosterUserIds(match.host_roster), userId) || safeIncludes(match.host_roster, userId);
  const inAway = listHasUser(parseRosterUserIds(match.away_roster), userId) || safeIncludes(match.away_roster, userId);
  const inHostMerc = listHasUser(parseRosterUserIds(match.host_mercenary_roster), userId) || safeIncludes(match.host_mercenary_roster, userId);
  const inAwayMerc = listHasUser(parseRosterUserIds(match.away_mercenary_roster), userId) || safeIncludes(match.away_mercenary_roster, userId);

  const setRows = readMatchSets(match, events);
  const hasSetPlay = setRows.some((set) =>
    resolvePlayerSetPlay(match, set.set_number, userId, playerName, events).played,
  );

  if (!inHost && !inAway && !inHostMerc && !inAwayMerc && !hasSetPlay) return acc;

  let playedThisMatch = false;
  let setWinsThisMatch = 0;
  let setLossesThisMatch = 0;

  setRows.forEach((set) => {
    const appearance = resolvePlayerSetPlay(match, set.set_number, userId, playerName, events);
    let playedAs = appearance.side;

    if (!appearance.played) {
      if (!setLineupsAreEmpty(match, set.set_number)) return;
      if (inHost || inHostMerc) playedAs = 'host';
      else if (inAway || inAwayMerc) playedAs = 'away';
      else return;
    } else if (!playedAs) {
      playedAs = inAway || inAwayMerc ? 'away' : 'host';
    }

    playedThisMatch = true;
    acc.setsPlayed += 1;

    const myScore = playedAs === 'host' ? set.host_score : set.away_score;
    const oppScore = playedAs === 'host' ? set.away_score : set.host_score;
    if (myScore > oppScore) {
      acc.setWins += 1;
      setWinsThisMatch += 1;
    } else if (myScore < oppScore) {
      acc.setLosses += 1;
      setLossesThisMatch += 1;
    } else {
      acc.setDraws += 1;
    }
  });

  if (playedThisMatch || inHost || inAway || inHostMerc || inAwayMerc) {
    acc.matchesPlayed += 1;
    if (setWinsThisMatch > setLossesThisMatch) acc.matchWins += 1;
    else if (setLossesThisMatch > setWinsThisMatch) acc.matchLosses += 1;
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
