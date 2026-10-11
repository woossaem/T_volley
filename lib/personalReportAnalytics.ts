import { isIntramuralMatch, isOfficialMatch } from './officialMatch';
import { addMatchPlayerStats, collectPlayerSetForm, emptyPlayerCareerStats } from './playerStats';
import {
  collectTeammateIds,
  isSameTeamLabel,
  playerAppearedForTeam,
  playerAppearedInMatch,
  resolvePlayerMatchSide,
} from './playerAppearance';
import { parseMatchScoreLogs, resolvePlayerSetPlay } from './rankingService';
import { readMatchSets } from './playerStats';
import { aggregatePlayerProStats, COURT_POSITIONS, type CourtPosition, type PositionShare } from './proStats';
import { listHasUser, parseSetRosterMap } from './roster';
import { parseTempPositionKey, positionKeyFromCourtIndex, TEMP_POSITION_LABELS } from './tempPlayer';

export type PersonalReportSlice = {
  totalTeamGames: number;
  myGames: number;
  attendanceRate: number;
  recent5: string[];
  setsWon: number;
  setsDrawn?: number;
  setsLost: number;
  matchWins?: number;
  matchDraws?: number;
  matchLosses?: number;
  matchWinRate?: number;
  bestPartnerName: string;
  maxPartnerWins: number;
  proStats?: import('./proStats').ProStatReport | null;
};

export type PersonalReportAnalytics = {
  teamName: string;
  official: PersonalReportSlice;
  intramural: PersonalReportSlice;
};

export type SkillStatCounts = {
  mvp: number;
  dig: number;
  block: number;
  ace: number;
  receive: number;
  assist: number;
  fault: number;
};

export function emptySkillStatCounts(): SkillStatCounts {
  return { mvp: 0, dig: 0, block: 0, ace: 0, receive: 0, assist: 0, fault: 0 };
}

type MatchKindRow = {
  id?: string | null;
  status?: string | null;
  is_official?: boolean | null;
  is_guest_match?: boolean | null;
};

/** 교류전·자체내전이 아닌 경기는 어느 쪽에도 넣지 않는다. */
export function skillMatchScope(match?: MatchKindRow | null): 'official' | 'intramural' | null {
  if (isIntramuralMatch(match)) return 'intramural';
  if (isOfficialMatch(match)) return 'official';
  return null;
}

/**
 * 기술 기록과 MVP를 경기 종류별로 나눈다.
 * 득점 이벤트로 MVP만 세고, 디그·블로킹·서브에이스·리시브·어시스트·범실은 해당 선수 기록만 센다.
 */
export function tallyScopedSkillStats(
  userId: string,
  rows: Array<{ match_id?: string | null; player_id?: string | null; event_type?: string | null }>,
  matches: MatchKindRow[],
): { official: SkillStatCounts; intramural: SkillStatCounts } {
  const kindById = new Map<string, 'official' | 'intramural'>();
  (matches || []).forEach((match) => {
    const id = String(match?.id || '');
    const scope = skillMatchScope(match);
    if (!id || !scope) return;
    kindById.set(id, scope);
  });

  const official = emptySkillStatCounts();
  const intramural = emptySkillStatCounts();
  const buckets = { official, intramural };
  const scores = new Map<string, Map<string, number>>();

  (rows || []).forEach((row) => {
    const matchId = String(row?.match_id || '');
    const playerId = String(row?.player_id || '');
    const scope = kindById.get(matchId);
    if (!matchId || !playerId || !scope) return;
    const kind = String(row?.event_type || '');
    if (kind === 'score') {
      const bucket = scores.get(matchId) || new Map<string, number>();
      bucket.set(playerId, (bucket.get(playerId) || 0) + 1);
      scores.set(matchId, bucket);
      return;
    }
    if (playerId !== userId) return;
    const target = buckets[scope];
    if (kind === 'dig') target.dig += 1;
    else if (kind === 'block') target.block += 1;
    else if (kind === 'ace') target.ace += 1;
    else if (kind === 'receive') target.receive += 1;
    else if (kind === 'assist') target.assist += 1;
    else if (kind === 'fault') target.fault += 1;
  });

  scores.forEach((bucket, matchId) => {
    const scope = kindById.get(matchId);
    if (!scope) return;
    let topId = '';
    let topPoints = 0;
    let tied = false;
    bucket.forEach((points, id) => {
      if (points > topPoints) {
        topPoints = points;
        topId = id;
        tied = false;
      } else if (points === topPoints) {
        tied = true;
      }
    });
    if (!tied && topId === userId && topPoints > 0) buckets[scope].mvp += 1;
  });

  return { official, intramural };
}

function lineupSlots(raw: unknown): Array<string | null> {
  if (Array.isArray(raw)) {
    return raw.map((item) => (item == null || item === '' ? null : String(item)));
  }
  if (typeof raw === 'string' && raw.trim()) {
    try {
      return lineupSlots(JSON.parse(raw));
    } catch {
      return [];
    }
  }
  return [];
}

function slotIndexOf(slots: Array<string | null>, userId: string): number {
  return slots.findIndex((id) => !!id && (id === userId || listHasUser([id], userId)));
}

function standardPosition(token: string | null | undefined, index: number): CourtPosition | null {
  const text = String(token || '').trim();
  if (text === 'Li' || text.toLowerCase() === 'li' || text.includes('리베로')) return '리베로';
  const exact: Record<string, CourtPosition> = {
    L: '레프트', R: '라이트', C: '센터', S: '세터',
    l: '레프트', r: '라이트', c: '센터', s: '세터',
    레프트: '레프트', 라이트: '라이트', 센터: '센터', 세터: '세터', 리베로: '리베로',
  };
  if (exact[text]) return exact[text];
  if (text.includes('세터')) return '세터';
  if (text.includes('레프트')) return '레프트';
  if (text.includes('라이트')) return '라이트';
  if (text.includes('센터')) return '센터';
  const key = parseTempPositionKey(text);
  if (key) return TEMP_POSITION_LABELS[key] as CourtPosition;
  if (index >= 0) return TEMP_POSITION_LABELS[positionKeyFromCourtIndex(index)] as CourtPosition;
  return null;
}

type SideAB = 'A' | 'B';

function setCourtPlacement(
  match: any,
  setNumber: number,
  userId: string,
  playerName?: string | null,
): { side: SideAB; position: CourtPosition } | null {
  const idx = Math.max(0, setNumber - 1);
  const rows = Array.isArray(match?.match_sets) ? match.match_sets : (Array.isArray(match?.sets) ? match.sets : []);
  const row = rows.find((s: any) => Number(s?.set_number ?? s?.setNumber) === setNumber) || rows[idx];
  let host = lineupSlots(row?.host_lineup ?? row?.hostLineup);
  let away = lineupSlots(row?.away_lineup ?? row?.awayLineup);
  if (host.length === 0 && away.length === 0) {
    const hostMap = parseSetRosterMap(match?.host_roster);
    const awayMap = parseSetRosterMap(match?.away_roster);
    host = (hostMap[idx] || []).map((id) => id || null);
    away = (awayMap[idx] || []).map((id) => id || null);
  }
  const hostIdx = slotIndexOf(host, userId);
  const awayIdx = slotIndexOf(away, userId);
  const logs = parseMatchScoreLogs(match);
  const logged = resolvePlayerSetPlay(match, setNumber, userId, playerName, logs).side;

  let side: SideAB | null = null;
  let slotIndex = -1;
  let token: string | null = null;
  if (awayIdx >= 0 && hostIdx < 0) {
    side = 'B';
    slotIndex = awayIdx;
    token = away[awayIdx];
  } else if (hostIdx >= 0 && awayIdx < 0) {
    side = 'A';
    slotIndex = hostIdx;
    token = host[hostIdx];
  } else if (awayIdx >= 0 && hostIdx >= 0) {
    if (logged === 'host') {
      side = 'A';
      slotIndex = hostIdx;
      token = host[hostIdx];
    } else {
      side = 'B';
      slotIndex = awayIdx;
      token = away[awayIdx];
    }
  } else if (logged === 'away') {
    side = 'B';
  } else if (logged === 'host') {
    side = 'A';
  }
  if (!side) return null;
  const position = standardPosition(token, slotIndex) || '센터';
  return { side, position };
}

/**
 * 포지션별 세트 승률.
 * A팀(청)은 score_a > score_b, B팀(백)은 score_b > score_a 일 때만 승리로 센다.
 */
export function calculatePositionStats(
  matches: any[],
  userId: string,
  playerName?: string | null,
): PositionShare[] {
  const tally: Record<CourtPosition, { played: number; wins: number }> = {
    레프트: { played: 0, wins: 0 },
    라이트: { played: 0, wins: 0 },
    센터: { played: 0, wins: 0 },
    세터: { played: 0, wins: 0 },
    리베로: { played: 0, wins: 0 },
  };

  (matches || []).forEach((match) => {
    const logs = parseMatchScoreLogs(match);
    readMatchSets(match, logs).forEach((set) => {
      const place = setCourtPlacement(match, set.set_number, userId, playerName);
      if (!place) return;
      const scoreA = Number(set.host_score) || 0;
      const scoreB = Number(set.away_score) || 0;
      const isWin = place.side === 'A' ? scoreA > scoreB : scoreB > scoreA;
      tally[place.position].played += 1;
      if (isWin) tally[place.position].wins += 1;
    });
  });

  const total = COURT_POSITIONS.reduce((sum, position) => sum + tally[position].played, 0);
  return COURT_POSITIONS.map((position) => {
    const row = tally[position];
    return {
      position,
      setsPlayed: row.played,
      setWins: row.wins,
      setDraws: 0,
      setLosses: Math.max(0, row.played - row.wins),
      sharePct: total > 0 ? Math.round((row.played / total) * 100) : 0,
      winRate: row.played > 0 ? Math.round((row.wins / row.played) * 100) : 0,
    };
  });
}

/**
 * 자체내전 한 세트의 승리 여부.
 * 소속 team_id가 아니라 그 세트에 배정된 진영(A=host, B=away)과 세트 점수를 비교한다.
 */
export function intramuralSetIsWin(
  match: any,
  set: { set_number: number; host_score: number; away_score: number },
  userId: string,
  playerName?: string | null,
): boolean {
  const logs = parseMatchScoreLogs(match);
  const play = resolvePlayerSetPlay(match, set.set_number, userId, playerName, logs);
  if (!play.played || !play.side) return false;
  const myScore = play.side === 'host' ? set.host_score : set.away_score;
  const oppScore = play.side === 'host' ? set.away_score : set.host_score;
  return myScore > oppScore;
}

function applyPositionWinRates(
  report: ReturnType<typeof aggregatePlayerProStats>,
  positions: PositionShare[],
): ReturnType<typeof aggregatePlayerProStats> {
  report.positions = positions;
  const primary = positions.slice().sort((a, b) => b.setsPlayed - a.setsPlayed || b.winRate - a.winRate)[0];
  report.primaryPosition = primary && primary.setsPlayed > 0 ? primary.position : null;
  return report;
}

function matchStamp(match: any): number {
  const parsed = Date.parse(String(match?.match_date || match?.created_at || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

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
    if (intramural) {
      const expectedWins = readMatchSets(m, logs).filter((set) =>
        intramuralSetIsWin(m, set, userId, playerName),
      ).length;
      const countedWins = career.setWins - setWinsBefore;
      if (countedWins !== expectedWins) {
        career.setWins += expectedWins - countedWins;
        career.setWinRate = career.setsPlayed > 0 ? Math.round((career.setWins / career.setsPlayed) * 100) : 0;
      }
    }
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

  const chronological = [...myPlayedForTeam].sort((a, b) => matchStamp(a) - matchStamp(b));
  const recent5 = intramural
    ? collectPlayerSetForm(chronological, userId, playerName).slice(-5).reverse()
    : [...chronological].reverse().slice(0, 5).map((m) => matchWinLabel(m, userId, playerName, teamName));

  return {
    totalTeamGames,
    myGames,
    attendanceRate,
    recent5,
    setsWon: career.setWins,
    setsDrawn: career.setDraws,
    setsLost: career.setLosses,
    matchWins: career.matchWins,
    matchDraws: career.matchDraws,
    matchLosses: career.matchLosses,
    matchWinRate: career.matchWinRate,
    bestPartnerName,
    maxPartnerWins,
    proStats: applyPositionWinRates(
      aggregatePlayerProStats(myPlayedForTeam, userId, playerName, teamName),
      calculatePositionStats(myPlayedForTeam, userId, playerName),
    ),
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
  const officialAll = (opts.matches || []).filter((m) => isOfficialMatch(m) && teamPlaysMatch(m, opts.teamName));
  const intraAll = (opts.matches || []).filter((m) => isIntramuralMatch(m) && teamPlaysMatch(m, opts.teamName));
  const officialPlayed = playedMatches(officialAll, opts.userId, opts.playerName, opts.teamName);
  const intraPlayed = playedMatches(intraAll, opts.userId, opts.playerName, opts.teamName);

  return {
    teamName: teamName || '개인 출전',
    official: buildSlice(officialAll, officialPlayed, false, opts.userId, opts.playerName, opts.profilesMap, opts.teamName),
    intramural: buildSlice(intraAll, intraPlayed, true, opts.userId, opts.playerName, opts.profilesMap, opts.teamName),
  };
}
