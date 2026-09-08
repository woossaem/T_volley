import { positionKeyFromCourtIndex, TEMP_POSITION_LABELS, type TempPositionKey } from './tempPlayer';
import { readMatchSets } from './playerStats';
import { rawSetLineupSlots } from './playerAppearance';
import {
  parseMatchScoreLogs,
  resolvePlayerSetPlay,
  scoreLogIsCanceled,
  scoreLogMatchesPlayer,
  scoreLogSetNumber,
  scoreLogSide,
  type ScoreLogLike,
  type SetPlaySide,
} from './rankingService';
import { listHasUser } from './roster';

export const COURT_POSITIONS = ['레프트', '라이트', '센터', '세터', '리베로'] as const;
export type CourtPosition = (typeof COURT_POSITIONS)[number];

export interface PositionShare {
  position: CourtPosition;
  setsPlayed: number;
  setWins: number;
  setDraws: number;
  setLosses: number;
  sharePct: number;
  winRate: number;
}

export interface ProStatReport {
  points: number;
  faults: number;
  netRating: number;
  setsPlayed: number;
  pps: number;
  teamPoints: number;
  teamSharePct: number;
  clutchPoints: number;
  runBreakerPoints: number;
  positions: PositionShare[];
  primaryPosition: CourtPosition | null;
  scoutingTitle: string;
}

export interface TeamProStatReport {
  netRating: number;
  teamPoints: number;
  oppPoints: number;
  setsPlayed: number;
  pps: number;
  clutchPoints: number;
  runBreakerPoints: number;
  scoutingTitle: string;
}

const EMPTY_PLAYER: ProStatReport = {
  points: 0,
  faults: 0,
  netRating: 0,
  setsPlayed: 0,
  pps: 0,
  teamPoints: 0,
  teamSharePct: 0,
  clutchPoints: 0,
  runBreakerPoints: 0,
  positions: COURT_POSITIONS.map((position) => ({
    position,
    setsPlayed: 0,
    setWins: 0,
    setDraws: 0,
    setLosses: 0,
    sharePct: 0,
    winRate: 0,
  })),
  primaryPosition: null,
  scoutingTitle: '[코트 루키]',
};

const EMPTY_TEAM: TeamProStatReport = {
  netRating: 0,
  teamPoints: 0,
  oppPoints: 0,
  setsPlayed: 0,
  pps: 0,
  clutchPoints: 0,
  runBreakerPoints: 0,
  scoutingTitle: '[신생 전력]',
};

function isPointEvent(log: ScoreLogLike): boolean {
  const t = String(log.event_type || '').toLowerCase();
  return t === 'score' || t === 'fault' || t === 'manual';
}

function isKill(log: ScoreLogLike): boolean {
  return String(log.event_type || '').toLowerCase() === 'score';
}

function isFault(log: ScoreLogLike): boolean {
  return String(log.event_type || '').toLowerCase() === 'fault';
}

function logScores(log: ScoreLogLike): { host: number; away: number } {
  const rec = log as ScoreLogLike & { host_score?: number; away_score?: number; hostScore?: number; awayScore?: number };
  return {
    host: Number(rec.host_score ?? rec.hostScore) || 0,
    away: Number(rec.away_score ?? rec.awayScore) || 0,
  };
}

/** 20점 이후 2점 차 이내 */
export function isClutchScore(log: ScoreLogLike): boolean {
  const { host, away } = logScores(log);
  if (host < 20 && away < 20) return false;
  return Math.abs(host - away) <= 2;
}

function sortSetLogs(logs: ScoreLogLike[], setNumber: number): ScoreLogLike[] {
  return logs
    .filter((log) => !scoreLogIsCanceled(log) && isPointEvent(log) && scoreLogSetNumber(log) === setNumber)
    .slice()
    .sort((a, b) => {
      const as = logScores(a);
      const bs = logScores(b);
      return (as.host + as.away) - (bs.host + bs.away);
    });
}

function labelFromKey(key: TempPositionKey): CourtPosition {
  return TEMP_POSITION_LABELS[key] as CourtPosition;
}

function positionFromLineup(
  match: any,
  setNumber: number,
  side: SetPlaySide,
  playerId: string,
): CourtPosition | null {
  const slots = rawSetLineupSlots(match, setNumber, side);
  const idx = slots.findIndex((id) => listHasUser([id], playerId));
  if (idx < 0) return null;
  return labelFromKey(positionKeyFromCourtIndex(idx));
}

function emptyPositionMap(): Record<CourtPosition, { played: number; wins: number; draws: number; losses: number }> {
  return {
    레프트: { played: 0, wins: 0, draws: 0, losses: 0 },
    라이트: { played: 0, wins: 0, draws: 0, losses: 0 },
    센터: { played: 0, wins: 0, draws: 0, losses: 0 },
    세터: { played: 0, wins: 0, draws: 0, losses: 0 },
    리베로: { played: 0, wins: 0, draws: 0, losses: 0 },
  };
}

export function buildScoutingTitle(input: {
  teamName?: string | null;
  clutchPoints: number;
  runBreakerPoints: number;
  netRating: number;
  teamSharePct: number;
  primaryPosition?: CourtPosition | null;
  primaryWinRate?: number;
  setsPlayed: number;
}): string {
  const team = String(input.teamName || '').replace(/^\(휴면\)\s*/, '').trim() || '코트';
  const pos = input.primaryPosition;

  if (input.setsPlayed <= 0) return '[코트 루키]';
  if (input.clutchPoints >= 3 && input.clutchPoints >= Math.max(2, Math.round(input.setsPlayed * 0.35))) {
    return `[${team}의 클러치 에이스]`;
  }
  if (input.runBreakerPoints >= 3) {
    return `[${team}의 런 브레이커]`;
  }
  if (pos === '레프트' && (input.primaryWinRate || 0) >= 55) {
    return `[살림꾼 레프트]`;
  }
  if (pos === '세터' && input.teamSharePct >= 12) {
    return `[살림꾼 세터]`;
  }
  if (pos === '센터' && input.netRating >= 4) {
    return `[블로킹 센터]`;
  }
  if (pos === '라이트' && input.netRating >= 5) {
    return `[해결사 라이트]`;
  }
  if (pos === '리베로') {
    return `[코트 리베로]`;
  }
  if (input.netRating >= 8) {
    return `[${team}의 득점 엔진]`;
  }
  if (pos) return `[${team}의 ${pos}]`;
  return `[${team}의 코터]`;
}

export function emptyPlayerProStats(): ProStatReport {
  return {
    ...EMPTY_PLAYER,
    positions: EMPTY_PLAYER.positions.map((p) => ({ ...p })),
  };
}

export function emptyTeamProStats(): TeamProStatReport {
  return { ...EMPTY_TEAM };
}

/** score_logs / match_sets 실데이터만 집계. rankingService 파싱 본체는 호출만 한다. */
export function aggregatePlayerProStats(
  matches: any[],
  userId: string,
  playerName?: string | null,
  teamName?: string | null,
): ProStatReport {
  const report = emptyPlayerProStats();
  if (!userId) return report;

  const posMap = emptyPositionMap();

  (matches || []).forEach((match) => {
    const logs = parseMatchScoreLogs(match);
    const setRows = readMatchSets(match, logs);

    setRows.forEach((set) => {
      const play = resolvePlayerSetPlay(match, set.set_number, userId, playerName, logs);
      if (!play.played) return;
      const side: SetPlaySide = play.side || 'host';
      report.setsPlayed += 1;

      const myScore = side === 'host' ? set.host_score : set.away_score;
      const oppScore = side === 'host' ? set.away_score : set.host_score;
      const pos = positionFromLineup(match, set.set_number, side, userId);
      if (pos) {
        posMap[pos].played += 1;
        if (myScore > oppScore) posMap[pos].wins += 1;
        else if (myScore < oppScore) posMap[pos].losses += 1;
        else posMap[pos].draws += 1;
      }

      const setLogs = sortSetLogs(logs, set.set_number);
      let oppStreak = 0;
      setLogs.forEach((log) => {
        const logSide = scoreLogSide(log);
        const mine = scoreLogMatchesPlayer(log, userId, playerName);
        if (logSide && logSide !== side) {
          oppStreak += 1;
          return;
        }
        if (logSide === side) {
          if (isKill(log) || String(log.event_type || '') === 'manual') {
            report.teamPoints += 1;
          }
          if (mine && isKill(log)) {
            report.points += 1;
            if (isClutchScore(log)) report.clutchPoints += 1;
            if (oppStreak >= 3) report.runBreakerPoints += 1;
          }
          if (mine && isFault(log)) report.faults += 1;
          oppStreak = 0;
        }
      });
    });
  });

  report.netRating = report.points - report.faults;
  report.pps = report.setsPlayed > 0 ? Math.round((report.points / report.setsPlayed) * 10) / 10 : 0;
  report.teamSharePct = report.teamPoints > 0 ? Math.round((report.points / report.teamPoints) * 100) : 0;

  const totalPosSets = COURT_POSITIONS.reduce((sum, p) => sum + posMap[p].played, 0);
  report.positions = COURT_POSITIONS.map((position) => {
    const row = posMap[position];
    return {
      position,
      setsPlayed: row.played,
      setWins: row.wins,
      setDraws: row.draws,
      setLosses: row.losses,
      sharePct: totalPosSets > 0 ? Math.round((row.played / totalPosSets) * 100) : 0,
      winRate: row.played > 0 ? Math.round((row.wins / row.played) * 100) : 0,
    };
  });

  const primary = report.positions.slice().sort((a, b) => b.setsPlayed - a.setsPlayed || b.winRate - a.winRate)[0];
  report.primaryPosition = primary && primary.setsPlayed > 0 ? primary.position : null;
  report.scoutingTitle = buildScoutingTitle({
    teamName,
    clutchPoints: report.clutchPoints,
    runBreakerPoints: report.runBreakerPoints,
    netRating: report.netRating,
    teamSharePct: report.teamSharePct,
    primaryPosition: report.primaryPosition,
    primaryWinRate: primary?.winRate || 0,
    setsPlayed: report.setsPlayed,
  });

  return report;
}

export function aggregateTeamProStats(matches: any[], teamName: string): TeamProStatReport {
  const report = emptyTeamProStats();
  const name = String(teamName || '').trim();
  if (!name) return report;

  (matches || []).forEach((match) => {
    const isHost = String(match?.host_team_name || '').trim() === name;
    const isAway = String(match?.away_team_name || '').trim() === name;
    const intramural = match?.status === 'intramural' && isHost;
    if (!isHost && !isAway && !intramural) return;

    const side: SetPlaySide = isAway ? 'away' : 'host';
    const logs = parseMatchScoreLogs(match);
    const setRows = readMatchSets(match, logs);

    setRows.forEach((set) => {
      report.setsPlayed += 1;
      const my = side === 'host' ? set.host_score : set.away_score;
      const opp = side === 'host' ? set.away_score : set.host_score;
      report.teamPoints += my;
      report.oppPoints += opp;

      const setLogs = sortSetLogs(logs, set.set_number);
      let oppStreak = 0;
      setLogs.forEach((log) => {
        const logSide = scoreLogSide(log);
        if (logSide && logSide !== side) {
          oppStreak += 1;
          return;
        }
        if (logSide === side) {
          if (isKill(log) || String(log.event_type || '') === 'manual') {
            if (isClutchScore(log)) report.clutchPoints += 1;
            if (oppStreak >= 3) report.runBreakerPoints += 1;
          }
          oppStreak = 0;
        }
      });
    });
  });

  report.netRating = report.teamPoints - report.oppPoints;
  report.pps = report.setsPlayed > 0 ? Math.round((report.teamPoints / report.setsPlayed) * 10) / 10 : 0;
  if (report.clutchPoints >= 8) report.scoutingTitle = `[${name}의 클러치 머신]`;
  else if (report.runBreakerPoints >= 6) report.scoutingTitle = `[${name}의 흐름 차단]`;
  else if (report.netRating >= 20) report.scoutingTitle = `[${name}의 득점 공장]`;
  else if (report.setsPlayed > 0) report.scoutingTitle = `[${name} 스카우팅]`;
  return report;
}
