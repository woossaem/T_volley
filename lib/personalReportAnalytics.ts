import { isIntramuralMatch } from './officialMatch';
import { addMatchPlayerStats, collectPlayerSetForm, emptyPlayerCareerStats } from './playerStats';
import {
  collectTeammateIds,
  isSameTeamLabel,
  playerAppearedForTeam,
  playerAppearedInMatch,
  resolvePlayerMatchSide,
} from './playerAppearance';
import { parseMatchScoreLogs } from './rankingService';
import { aggregatePlayerProStats } from './proStats';

export type PersonalReportSlice = {
  totalTeamGames: number;
  myGames: number;
  attendanceRate: number;
  recent5: string[];
  setsWon: number;
  setsDrawn?: number;
  setsLost: number;
  bestPartnerName: string;
  maxPartnerWins: number;
  proStats?: import('./proStats').ProStatReport | null;
};

export type PersonalReportAnalytics = {
  teamName: string;
  official: PersonalReportSlice;
  intramural: PersonalReportSlice;
};

function teamPlaysMatch(match: any, teamName?: string | null): boolean {
  if (!teamName) return true;
  return isSameTeamLabel(match?.host_team_name, teamName) || isSameTeamLabel(match?.away_team_name, teamName);
}

function playedMatches(
  list: any[],
  userId: string,
  playerName?: string | null,
  teamName?: string | null,
) {
  return (list || []).filter((m) => {
    const logs = parseMatchScoreLogs(m);
    if (teamName) return playerAppearedForTeam(m, userId, teamName, playerName, logs);
    return playerAppearedInMatch(m, userId, playerName, logs);
  });
}

function matchWinLabel(match: any, userId: string, playerName?: string | null, teamName?: string | null): 'WIN' | 'DRAW' | 'LOSS' {
  if (match?.winner_team === 'draw' || match?.winner_team === '무승부') return 'DRAW';
  const logs = parseMatchScoreLogs(match);
  const side = resolvePlayerMatchSide(match, userId, playerName, logs);
  const myTeam = teamName
    || (side === 'away' ? match?.away_team_name : match?.host_team_name);
  return isSameTeamLabel(match?.winner_team, myTeam) ? 'WIN' : 'LOSS';
}

function buildSlice(
  teamAllMatches: any[],
  myPlayedForTeam: any[],
  intramural: boolean,
  userId: string,
  playerName: string | null | undefined,
  profilesMap: Record<string, string>,
  teamName?: string | null,
): PersonalReportSlice {
  const totalTeamGames = teamAllMatches.length;
  const myGames = myPlayedForTeam.length;
  const attendanceRate = totalTeamGames > 0 ? Math.round((myGames / totalTeamGames) * 100) : 0;
  const partnerWinsMap: { [userId: string]: number } = {};
  const career = emptyPlayerCareerStats();

  myPlayedForTeam.forEach((m) => {
    const logs = parseMatchScoreLogs(m);
    const setWinsBefore = career.setWins;
    addMatchPlayerStats(career, userId, m, logs, playerName);
    const gainedSetWins = career.setWins - setWinsBefore;
    const isWin = matchWinLabel(m, userId, playerName, teamName) === 'WIN';
    if (!intramural && !isWin) return;
    if (intramural && gainedSetWins <= 0) return;
    collectTeammateIds(m, userId, playerName, logs).forEach((id) => {
      partnerWinsMap[id] = (partnerWinsMap[id] || 0) + (intramural ? gainedSetWins : 1);
    });
  });

  let bestPartnerName = '데이터 없음';
  let maxPartnerWins = 0;
  Object.entries(partnerWinsMap).forEach(([id, wins]) => {
    if (wins > maxPartnerWins) {
      maxPartnerWins = wins;
      bestPartnerName = profilesMap[id] || '팀원';
    }
  });

  const recent5 = intramural
    ? collectPlayerSetForm(myPlayedForTeam, userId, playerName).slice(-5).reverse()
    : myPlayedForTeam.slice(0, 5).map((m) => matchWinLabel(m, userId, playerName, teamName));

  return {
    totalTeamGames,
    myGames,
    attendanceRate,
    recent5,
    setsWon: career.setWins,
    setsDrawn: career.setDraws,
    setsLost: career.setLosses,
    bestPartnerName,
    maxPartnerWins,
    proStats: aggregatePlayerProStats(myPlayedForTeam, userId, playerName, teamName),
  };
}

export function buildPersonalReportAnalytics(opts: {
  userId: string;
  playerName?: string | null;
  matches: any[];
  profilesMap: Record<string, string>;
  teamName?: string | null;
}): PersonalReportAnalytics {
  const teamName = opts.teamName || '';
  const officialAll = (opts.matches || []).filter((m) => !isIntramuralMatch(m) && teamPlaysMatch(m, opts.teamName));
  const intraAll = (opts.matches || []).filter((m) => isIntramuralMatch(m) && teamPlaysMatch(m, opts.teamName));
  const officialPlayed = playedMatches(officialAll, opts.userId, opts.playerName, opts.teamName);
  const intraPlayed = playedMatches(intraAll, opts.userId, opts.playerName, opts.teamName);

  return {
    teamName: teamName || '개인 출전',
    official: buildSlice(officialAll, officialPlayed, false, opts.userId, opts.playerName, opts.profilesMap, opts.teamName),
    intramural: buildSlice(intraAll, intraPlayed, true, opts.userId, opts.playerName, opts.profilesMap, opts.teamName),
  };
}
