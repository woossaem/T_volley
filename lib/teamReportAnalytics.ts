import { isIntramuralMatch, isOfficialMatch } from './officialMatch';
import { isSameTeamLabel } from './playerAppearance';
import { resolveTeamName } from './nameUtils';
import { readMatchSets } from './playerStats';
import {
  parseMatchScoreLogs,
  resolveSetLineups,
  scoreLogIsCanceled,
  scoreLogSetNumber,
  scoreLogSide,
  type ScoreLogLike,
  type SetPlaySide,
} from './rankingService';
import {
  assignedUserId,
  clampLineCount,
  DEFAULT_LINE_COUNT,
  isRegisteredUserId,
  parseSetFormation,
} from './roster';

export type TeamDataScope = 'official' | 'intramural';

export interface EfficiencyRow {
  key: string;
  label: string;
  userIds: string[];
  names: string[];
  sets: number;
  pointsFor: number;
  pointsAgainst: number;
  efficiencyPct: number;
}

export interface SetWinRateRow {
  setNumber: number;
  label: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  winRate: number;
}

export interface TeamScoringRatio {
  kills: number;
  faults: number;
  successPct: number;
  pointsFor: number;
  pointsAgainst: number;
}

export interface OfficialTeamInsights {
  formations: EfficiencyRow[];
  occupancies: EfficiencyRow[];
  rotations: EfficiencyRow[];
  setWinRates: SetWinRateRow[];
  set1WinRate: number;
  laterWinRate: number;
  volatilityGap: number;
  volatilityLabel: string;
  scoring: TeamScoringRatio;
}

export interface MemberAttendanceRow {
  userId: string;
  name: string;
  setsPlayed: number;
  attendancePct: number;
}

export interface ChemistryGroup {
  userIds: string[];
  names: string[];
  setsTogether: number;
}

export interface IntramuralTeamInsights {
  sessions: number;
  totalSets: number;
  recordedPoints: number;
  avgSetsPerSession: number;
  attendance: MemberAttendanceRow[];
  bestDuo: ChemistryGroup | null;
  bestTrio: ChemistryGroup | null;
  avgCourtPlayers: number;
  guestSetCount: number;
  guestSetPct: number;
  bothSidesCount: number;
  favoriteWeekday: string;
}

export interface BuiltTeamReport {
  teamName: string;
  dataScope: TeamDataScope;
  totalMatches: number;
  totalWins: number;
  totalDraws: number;
  totalLosses: number;
  winRate: number;
  setsWon: number;
  setsLost: number;
  setDiff: number;
  shutoutWins: number;
  fullsetWins: number;
  nemesis: string;
  nemesisStat: string;
  victim: string;
  victimStat: string;
  teamRecent5: string[];
  officialInsights: OfficialTeamInsights;
  intramuralInsights: IntramuralTeamInsights;
}

const WEEKDAYS = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];

function teamPlaysMatch(match: any, teamName: string): boolean {
  return isSameTeamLabel(match?.host_team_name, teamName) || isSameTeamLabel(match?.away_team_name, teamName);
}

function parseSetWins(match: any): { host: number; away: number } {
  let host = 0;
  let away = 0;
  const rows = Array.isArray(match?.match_sets)
    ? match.match_sets
    : (Array.isArray(match?.sets) ? match.sets : []);
  if (rows.length > 0) {
    rows.forEach((row: any) => {
      const h = Number(row?.host_score ?? row?.hostScore) || 0;
      const a = Number(row?.away_score ?? row?.awayScore) || 0;
      if (h > a) host += 1;
      else if (a > h) away += 1;
    });
    return { host, away };
  }
  const raw = String(match?.set_scores || '');
  if (!raw) return { host, away };
  raw.split(', ').forEach((s: string) => {
    const [h, a] = s.split(':').map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(a)) return;
    if (h > a) host += 1;
    else if (a > h) away += 1;
  });
  return { host, away };
}

export function listOfficialTeamMatches(matches: any[], teamName: string): any[] {
  return (matches || []).filter((m) => isOfficialMatch(m) && teamPlaysMatch(m, teamName));
}

export function listIntramuralTeamMatches(matches: any[], teamName: string): any[] {
  return (matches || []).filter((m) => isIntramuralMatch(m) && teamPlaysMatch(m, teamName));
}

export function selectTeamMatchesByScope(matches: any[], teamName: string): { matches: any[]; scope: TeamDataScope } {
  const official = listOfficialTeamMatches(matches, teamName);
  if (official.length > 0) return { matches: official, scope: 'official' };
  return { matches: listIntramuralTeamMatches(matches, teamName), scope: 'intramural' };
}

export function emptyOfficialInsights(): OfficialTeamInsights {
  return {
    formations: [],
    occupancies: [],
    rotations: [],
    setWinRates: [],
    set1WinRate: 0,
    laterWinRate: 0,
    volatilityGap: 0,
    volatilityLabel: '기록 부족',
    scoring: { kills: 0, faults: 0, successPct: 0, pointsFor: 0, pointsAgainst: 0 },
  };
}

export function emptyIntramuralInsights(): IntramuralTeamInsights {
  return {
    sessions: 0,
    totalSets: 0,
    recordedPoints: 0,
    avgSetsPerSession: 0,
    attendance: [],
    bestDuo: null,
    bestTrio: null,
    avgCourtPlayers: 0,
    guestSetCount: 0,
    guestSetPct: 0,
    bothSidesCount: 0,
    favoriteWeekday: '기록 없음',
  };
}

function eventType(log: ScoreLogLike): string {
  return String(log.event_type || '').toLowerCase();
}

function isPointEvent(log: ScoreLogLike): boolean {
  const t = eventType(log);
  return t === 'score' || t === 'fault' || t === 'manual';
}

function isKillEvent(log: ScoreLogLike): boolean {
  return eventType(log) === 'score';
}

function isFaultEvent(log: ScoreLogLike): boolean {
  return eventType(log) === 'fault';
}

function readLogPlayerId(log: ScoreLogLike): string {
  return String(log.player_id ?? log.playerId ?? '').trim();
}

function readLogPlayerName(log: ScoreLogLike): string {
  return String(log.playerName ?? log.player_name ?? log.name ?? '').trim();
}

function matchSidesForTeam(match: any, teamName: string): SetPlaySide[] {
  const host = isSameTeamLabel(match?.host_team_name, teamName);
  const away = isSameTeamLabel(match?.away_team_name, teamName);
  if (host && away) return ['host', 'away'];
  if (away) return ['away'];
  if (host) return ['host'];
  return [];
}

function comboKey(ids: string[]): string {
  return [...ids].sort().join('|');
}

function registeredIds(ids: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  ids.forEach((raw) => {
    const id = assignedUserId(raw);
    if (!id || !isRegisteredUserId(id) || seen.has(id)) return;
    seen.add(id);
    out.push(id);
  });
  return out;
}

function sideLineupIds(match: any, setNumber: number, side: SetPlaySide, logs: ScoreLogLike[]): string[] {
  const lineups = resolveSetLineups(match, setNumber);
  const fromLineup = side === 'away' ? lineups.away : lineups.host;
  const fromLogs: string[] = [];
  logs.forEach((log) => {
    if (!log || scoreLogIsCanceled(log) || !isPointEvent(log)) return;
    if (scoreLogSetNumber(log) !== setNumber) return;
    if (scoreLogSide(log) !== side) return;
    const id = readLogPlayerId(log);
    if (id) fromLogs.push(id);
  });
  return registeredIds([...fromLineup, ...fromLogs]);
}

function sideFormation(match: any, setNumber: number, side: SetPlaySide) {
  const roster = side === 'away' ? match?.away_roster : match?.host_roster;
  return parseSetFormation(roster, Math.max(0, setNumber - 1));
}

function formationLabel(front: number, middle: number, back: number): string {
  return `전${front}-중${middle}-후${back}`;
}

function displayNames(ids: string[], nameMap: Record<string, string>): string[] {
  return ids.map((id) => nameMap[id] || '선생님');
}

function collectNameMap(matches: any[]): Record<string, string> {
  const map: Record<string, string> = {};
  (matches || []).forEach((match) => {
    parseMatchScoreLogs(match).forEach((log) => {
      const id = readLogPlayerId(log);
      const name = readLogPlayerName(log);
      if (id && isRegisteredUserId(id) && name && !map[id]) map[id] = name;
    });
  });
  return map;
}

function pushEfficiency(
  bucket: Record<string, { label: string; userIds: string[]; names: string[]; sets: number; pointsFor: number; pointsAgainst: number }>,
  key: string,
  label: string,
  userIds: string[],
  names: string[],
  pointsFor: number,
  pointsAgainst: number,
) {
  if (!key) return;
  if (!bucket[key]) {
    bucket[key] = { label, userIds, names, sets: 0, pointsFor: 0, pointsAgainst: 0 };
  }
  bucket[key].sets += 1;
  bucket[key].pointsFor += pointsFor;
  bucket[key].pointsAgainst += pointsAgainst;
}

function finalizeEfficiency(
  bucket: Record<string, { label: string; userIds: string[]; names: string[]; sets: number; pointsFor: number; pointsAgainst: number }>,
  limit = 6,
): EfficiencyRow[] {
  return Object.entries(bucket)
    .map(([key, row]) => {
      const total = row.pointsFor + row.pointsAgainst;
      return {
        key,
        label: row.label,
        userIds: row.userIds,
        names: row.names,
        sets: row.sets,
        pointsFor: row.pointsFor,
        pointsAgainst: row.pointsAgainst,
        efficiencyPct: total > 0 ? Math.round((row.pointsFor / total) * 100) : 0,
      };
    })
    .sort((a, b) => b.sets - a.sets || b.efficiencyPct - a.efficiencyPct)
    .slice(0, limit);
}

function matchWeekday(match: any): number | null {
  const raw = String(match?.match_date || match?.created_at || '');
  const numbers = raw.match(/\d+/g);
  if (numbers && numbers.length >= 3) {
    const y = Number(numbers[0]);
    const m = Number(numbers[1]);
    const d = Number(numbers[2]);
    const date = new Date(y, m - 1, d);
    if (!Number.isNaN(date.getTime()) && y >= 2000) return date.getDay();
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getDay();
}

function combinations(ids: string[], size: number): string[][] {
  const out: string[][] = [];
  const walk = (start: number, acc: string[]) => {
    if (acc.length === size) {
      out.push([...acc]);
      return;
    }
    for (let i = start; i < ids.length; i += 1) {
      acc.push(ids[i]);
      walk(i + 1, acc);
      acc.pop();
    }
  };
  if (ids.length >= size) walk(0, []);
  return out;
}

function buildOfficialInsights(matches: any[], teamName: string, nameMap: Record<string, string>): OfficialTeamInsights {
  const insights = emptyOfficialInsights();
  if (!matches?.length) return insights;

  const formationBucket: Record<string, { label: string; userIds: string[]; names: string[]; sets: number; pointsFor: number; pointsAgainst: number }> = {};
  const occupancyBucket: Record<string, { label: string; userIds: string[]; names: string[]; sets: number; pointsFor: number; pointsAgainst: number }> = {};
  const rotationBucket: Record<string, { label: string; userIds: string[]; names: string[]; sets: number; pointsFor: number; pointsAgainst: number }> = {};
  const setTally: Record<number, { played: number; wins: number; draws: number; losses: number }> = {};
  let kills = 0;
  let faults = 0;
  let pointsFor = 0;
  let pointsAgainst = 0;

  matches.forEach((match) => {
    const sides = matchSidesForTeam(match, teamName);
    if (sides.length !== 1) return;
    const side = sides[0];
    const logs = parseMatchScoreLogs(match);
    const setRows = readMatchSets(match, logs);

    setRows.forEach((set) => {
      const mine = side === 'host' ? set.host_score : set.away_score;
      const opp = side === 'host' ? set.away_score : set.host_score;
      pointsFor += mine;
      pointsAgainst += opp;

      const setNo = set.set_number >= 3 ? 3 : Math.max(1, set.set_number);
      if (!setTally[setNo]) setTally[setNo] = { played: 0, wins: 0, draws: 0, losses: 0 };
      setTally[setNo].played += 1;
      if (mine > opp) setTally[setNo].wins += 1;
      else if (mine < opp) setTally[setNo].losses += 1;
      else setTally[setNo].draws += 1;

      const form = sideFormation(match, set.set_number, side);
      const front = clampLineCount(form.frontCount, DEFAULT_LINE_COUNT);
      const middle = clampLineCount(form.middleCount, DEFAULT_LINE_COUNT);
      const back = clampLineCount(form.backCount, DEFAULT_LINE_COUNT);
      const formKey = `${front}-${middle}-${back}`;
      pushEfficiency(formationBucket, formKey, formationLabel(front, middle, back), [], [], mine, opp);

      const lineIds = resolveSetLineups(match, set.set_number)[side] || [];
      const courtFilled = (form.court || []).filter((id) => !!assignedUserId(id)).length;
      const occ = Math.max(courtFilled, lineIds.filter((id) => !!assignedUserId(id)).length);
      if (occ > 0) {
        const occKey = String(occ);
        pushEfficiency(occupancyBucket, occKey, `${occ}인 코트`, [], [], mine, opp);
      }

      const frontIds = registeredIds((form.court || []).slice(0, front));
      const rotationIds = frontIds.length >= 2 ? frontIds : registeredIds(lineIds).slice(0, 3);
      if (rotationIds.length >= 2) {
        const names = displayNames(rotationIds, nameMap);
        pushEfficiency(
          rotationBucket,
          comboKey(rotationIds),
          names.join(' · '),
          rotationIds,
          names,
          mine,
          opp,
        );
      }

      logs.forEach((log) => {
        if (!log || scoreLogIsCanceled(log) || scoreLogSetNumber(log) !== set.set_number) return;
        if (scoreLogSide(log) !== side) return;
        if (isKillEvent(log)) kills += 1;
        if (isFaultEvent(log)) faults += 1;
      });
    });
  });

  const setWinRates: SetWinRateRow[] = [1, 2, 3].map((setNumber) => {
    const row = setTally[setNumber] || { played: 0, wins: 0, draws: 0, losses: 0 };
    return {
      setNumber,
      label: setNumber === 3 ? '3세트~' : `${setNumber}세트`,
      played: row.played,
      wins: row.wins,
      draws: row.draws,
      losses: row.losses,
      winRate: row.played > 0 ? Math.round((row.wins / row.played) * 100) : 0,
    };
  }).filter((row) => row.played > 0);

  const set1 = setTally[1];
  const laterPlayed = (setTally[2]?.played || 0) + (setTally[3]?.played || 0);
  const laterWins = (setTally[2]?.wins || 0) + (setTally[3]?.wins || 0);
  const set1WinRate = set1 && set1.played > 0 ? Math.round((set1.wins / set1.played) * 100) : 0;
  const laterWinRate = laterPlayed > 0 ? Math.round((laterWins / laterPlayed) * 100) : 0;
  const volatilityGap = laterWinRate - set1WinRate;
  let volatilityLabel = '기록 부족';
  if ((set1?.played || 0) > 0 && laterPlayed > 0) {
    if (Math.abs(volatilityGap) <= 8) volatilityLabel = '세트 기복이 고른 편';
    else if (volatilityGap >= 9) volatilityLabel = '후반으로 갈수록 강해짐';
    else volatilityLabel = '1세트형 (후반 기복)';
  }

  const scored = kills + faults;
  return {
    formations: finalizeEfficiency(formationBucket, 5),
    occupancies: finalizeEfficiency(occupancyBucket, 5),
    rotations: finalizeEfficiency(rotationBucket, 5),
    setWinRates,
    set1WinRate,
    laterWinRate,
    volatilityGap,
    volatilityLabel,
    scoring: {
      kills,
      faults,
      successPct: scored > 0 ? Math.round((kills / scored) * 100) : 0,
      pointsFor,
      pointsAgainst,
    },
  };
}

function buildIntramuralInsights(matches: any[], nameMap: Record<string, string>): IntramuralTeamInsights {
  const insights = emptyIntramuralInsights();
  if (!matches?.length) return insights;

  const attendanceSets: Record<string, Set<string>> = {};
  const duoMap: Record<string, { userIds: string[]; names: string[]; setsTogether: number }> = {};
  const trioMap: Record<string, { userIds: string[]; names: string[]; setsTogether: number }> = {};
  const hostSets = new Set<string>();
  const awaySets = new Set<string>();
  const weekdayCount = [0, 0, 0, 0, 0, 0, 0];
  let totalSets = 0;
  let recordedPoints = 0;
  let courtPlayerSum = 0;
  let courtPlayerSamples = 0;
  const guestSetKeys = new Set<string>();

  matches.forEach((match) => {
    const logs = parseMatchScoreLogs(match);
    const setRows = readMatchSets(match, logs);
    const weekday = matchWeekday(match);
    if (weekday != null) weekdayCount[weekday] += 1;

    setRows.forEach((set) => {
      totalSets += 1;
      recordedPoints += (Number(set.host_score) || 0) + (Number(set.away_score) || 0);

      (['host', 'away'] as SetPlaySide[]).forEach((side) => {
        const form = sideFormation(match, set.set_number, side);
        const lineIds = resolveSetLineups(match, set.set_number)[side] || [];
        const courtIds = (form.court || []).map((id) => assignedUserId(id)).filter((id): id is string => !!id);
        const filled = Math.max(courtIds.length, lineIds.filter((id) => !!assignedUserId(id)).length);
        if (filled > 0) {
          courtPlayerSum += filled;
          courtPlayerSamples += 1;
        }
        const hasGuest = [...courtIds, ...lineIds].some((id) => !!assignedUserId(id) && !isRegisteredUserId(id));
        if (hasGuest) guestSetKeys.add(`${String(match?.id || 'm')}:${set.set_number}`);

        const ids = sideLineupIds(match, set.set_number, side, logs);
        const appearanceKey = `${String(match?.id || 'm')}:${set.set_number}`;
        ids.forEach((id) => {
          if (!attendanceSets[id]) attendanceSets[id] = new Set();
          attendanceSets[id].add(appearanceKey);
          if (side === 'host') hostSets.add(id);
          else awaySets.add(id);
        });
        combinations(ids, 2).forEach((pair) => {
          const key = comboKey(pair);
          if (!duoMap[key]) duoMap[key] = { userIds: pair, names: displayNames(pair, nameMap), setsTogether: 0 };
          duoMap[key].setsTogether += 1;
        });
        combinations(ids, 3).forEach((trio) => {
          const key = comboKey(trio);
          if (!trioMap[key]) trioMap[key] = { userIds: trio, names: displayNames(trio, nameMap), setsTogether: 0 };
          trioMap[key].setsTogether += 1;
        });
      });
    });
  });

  const attendance = Object.entries(attendanceSets)
    .map(([userId, setKeys]) => ({
      userId,
      name: nameMap[userId] || '선생님',
      setsPlayed: setKeys.size,
      attendancePct: totalSets > 0 ? Math.round((setKeys.size / totalSets) * 100) : 0,
    }))
    .sort((a, b) => b.setsPlayed - a.setsPlayed || a.name.localeCompare(b.name, 'ko'));

  const bestDuo = Object.values(duoMap).sort((a, b) => b.setsTogether - a.setsTogether)[0] || null;
  const bestTrio = Object.values(trioMap).sort((a, b) => b.setsTogether - a.setsTogether)[0] || null;
  const bothSidesCount = [...hostSets].filter((id) => awaySets.has(id)).length;
  const topWeekdayIdx = weekdayCount.reduce((best, count, idx) => (count > weekdayCount[best] ? idx : best), 0);
  const favoriteWeekday = weekdayCount[topWeekdayIdx] > 0 ? WEEKDAYS[topWeekdayIdx] : '기록 없음';
  const guestSetCount = guestSetKeys.size;

  return {
    sessions: matches.length,
    totalSets,
    recordedPoints,
    avgSetsPerSession: matches.length > 0 ? Math.round((totalSets / matches.length) * 10) / 10 : 0,
    attendance,
    bestDuo: bestDuo && bestDuo.setsTogether > 0 ? bestDuo : null,
    bestTrio: bestTrio && bestTrio.setsTogether > 0 ? bestTrio : null,
    avgCourtPlayers: courtPlayerSamples > 0 ? Math.round((courtPlayerSum / courtPlayerSamples) * 10) / 10 : 0,
    guestSetCount,
    guestSetPct: totalSets > 0 ? Math.round((guestSetCount / totalSets) * 100) : 0,
    bothSidesCount,
    favoriteWeekday,
  };
}

export function buildTeamReportAnalytics(matches: any[], teamName: string, scope: TeamDataScope): BuiltTeamReport {
  const name = resolveTeamName(teamName, teamName);
  const empty: BuiltTeamReport = {
    teamName: name,
    dataScope: scope,
    totalMatches: 0,
    totalWins: 0,
    totalDraws: 0,
    totalLosses: 0,
    winRate: 0,
    setsWon: 0,
    setsLost: 0,
    setDiff: 0,
    shutoutWins: 0,
    fullsetWins: 0,
    nemesis: '없음',
    nemesisStat: '',
    victim: '없음',
    victimStat: '',
    teamRecent5: [],
    officialInsights: emptyOfficialInsights(),
    intramuralInsights: emptyIntramuralInsights(),
  };
  if (!name || !matches?.length) return empty;

  let totalWins = 0;
  let totalDraws = 0;
  let totalLosses = 0;
  let setsWon = 0;
  let setsLost = 0;
  let shutoutWins = 0;
  let fullsetWins = 0;
  const oppMap: { [oppName: string]: { wins: number; losses: number; draws: number; total: number } } = {};

  matches.forEach((m: any) => {
    const isHost = isSameTeamLabel(m.host_team_name, name);
    const intramural = scope === 'intramural';
    const { host, away } = parseSetWins(m);
    const mySetWon = isHost ? host : away;
    const oppSetWon = isHost ? away : host;
    setsWon += mySetWon;
    setsLost += oppSetWon;

    if (intramural) {
      const wName = String(m.winner_team || '');
      const isDraw = wName === 'draw' || wName === '무승부' || !wName;
      if (isDraw) totalDraws += 1;
      else if (mySetWon > oppSetWon) totalWins += 1;
      else if (oppSetWon > mySetWon) totalLosses += 1;
      else totalDraws += 1;
    } else {
      const wName = resolveTeamName(m.winner_team, String(m.winner_team || ''));
      const isWin = isSameTeamLabel(wName, name);
      const isDraw = wName === 'draw' || wName === '무승부';
      if (isWin) totalWins += 1;
      else if (isDraw) totalDraws += 1;
      else totalLosses += 1;

      const oppName = resolveTeamName(isHost ? m.away_team_name : m.host_team_name);
      if (oppName && !isSameTeamLabel(oppName, name)) {
        if (!oppMap[oppName]) oppMap[oppName] = { wins: 0, losses: 0, draws: 0, total: 0 };
        oppMap[oppName].total += 1;
        if (isWin) oppMap[oppName].wins += 1;
        else if (isDraw) oppMap[oppName].draws += 1;
        else oppMap[oppName].losses += 1;
      }
    }

    if (mySetWon > oppSetWon) {
      if (oppSetWon === 0) shutoutWins += 1;
      else fullsetWins += 1;
    }
  });

  let nemesis = '없음';
  let nemesisStat = '';
  let victim = '없음';
  let victimStat = '';
  let maxLossDiff = -999;
  let maxWinDiff = -999;

  if (scope === 'official') {
    Object.entries(oppMap).forEach(([opp, stat]) => {
      const winDiff = stat.wins - stat.losses;
      const lossDiff = stat.losses - stat.wins;
      if (stat.losses > stat.wins && lossDiff > maxLossDiff) {
        maxLossDiff = lossDiff;
        nemesis = opp;
        nemesisStat = `${stat.losses}패 ${stat.wins}승 (${stat.total}전)`;
      }
      if (stat.wins > stat.losses && winDiff > maxWinDiff) {
        maxWinDiff = winDiff;
        victim = opp;
        victimStat = `${stat.wins}승 ${stat.losses}패 (${stat.total}전)`;
      }
    });
  }

  const teamRecent5 = matches.slice(0, 5).map((m: any) => {
    if (scope === 'intramural') {
      const isHost = isSameTeamLabel(m.host_team_name, name);
      const { host, away } = parseSetWins(m);
      const my = isHost ? host : away;
      const opp = isHost ? away : host;
      if (my > opp) return 'WIN';
      if (opp > my) return 'LOSS';
      return 'DRAW';
    }
    const isWin = isSameTeamLabel(m.winner_team, name);
    const isDraw = m.winner_team === 'draw' || m.winner_team === '무승부';
    return isWin ? 'WIN' : isDraw ? 'DRAW' : 'LOSS';
  });

  const totalMatches = matches.length;
  const setDecided = setsWon + setsLost;
  const winRate = scope === 'intramural'
    ? (setDecided > 0 ? Math.round((setsWon / setDecided) * 100) : 0)
    : (totalMatches > 0 ? Math.round((totalWins / totalMatches) * 100) : 0);

  const nameMap = collectNameMap(matches);

  return {
    teamName: name,
    dataScope: scope,
    totalMatches,
    totalWins,
    totalDraws,
    totalLosses,
    winRate,
    setsWon,
    setsLost,
    setDiff: setsWon - setsLost,
    shutoutWins,
    fullsetWins,
    nemesis,
    nemesisStat,
    victim,
    victimStat,
    teamRecent5,
    officialInsights: scope === 'official' ? buildOfficialInsights(matches, name, nameMap) : emptyOfficialInsights(),
    intramuralInsights: scope === 'intramural' ? buildIntramuralInsights(matches, nameMap) : emptyIntramuralInsights(),
  };
}
