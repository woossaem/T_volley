import { supabase } from './supabase';
import { isIntramuralMatch } from './officialMatch';
import { isSameTeamLabel, rawSetLineupSlots } from './playerAppearance';
import {
  addMatchPlayerStats,
  emptyPlayerCareerStats,
  type PlayerCareerStats,
} from './playerStats';
import { parseMatchScoreLogs } from './rankingService';
import { assignedUserId, isRegisteredUserId } from './roster';
import { parseTempPositionKey, positionKeyFromCourtIndex, type TempPositionKey } from './tempPlayer';

export type FormationAlgoMode = 'DATA_MAIN' | 'EXCHANGE_STARTERS' | 'RANDOM' | 'BALANCE';

export type FormationAlgoPlayer = {
  user_id: string;
  full_name?: string | null;
};

export type PowerRatioPlayer = {
  user_id?: string | null;
  points?: number | null;
  faults?: number | null;
  power?: number | null;
};

export type PowerRatioResult = {
  aRatio: number;
  bRatio: number;
  balanceScore: number;
  aNet: number;
  bNet: number;
};

function netScoreOf(entry: PowerRatioPlayer | number | string | null | undefined): number {
  if (typeof entry === 'number' && Number.isFinite(entry)) return entry;
  if (!entry || typeof entry !== 'object') return 0;
  const points = Number(entry.points);
  const faults = Number(entry.faults);
  if (Number.isFinite(points) || Number.isFinite(faults)) {
    return (Number.isFinite(points) ? points : 0) - (Number.isFinite(faults) ? faults : 0);
  }
  if (typeof entry.power === 'number' && Number.isFinite(entry.power)) return entry.power;
  return 0;
}

/**
 * 양 팀 누적 득실(득점-범실)로 전력 비율과 균형도를 구한다.
 * balanceScore = 100 - |A_ratio - B_ratio|
 */
export function calculatePowerRatio(
  teamA: Array<PowerRatioPlayer | number | string | null | undefined> | null | undefined,
  teamB: Array<PowerRatioPlayer | number | string | null | undefined> | null | undefined,
): PowerRatioResult {
  const aNet = (teamA || []).reduce<number>((sum, row) => sum + netScoreOf(row), 0);
  const bNet = (teamB || []).reduce<number>((sum, row) => sum + netScoreOf(row), 0);
  const floor = Math.min(0, aNet, bNet);
  const aShift = aNet - floor;
  const bShift = bNet - floor;
  const sum = aShift + bShift;
  const aRatio = sum > 0 ? Math.round((aShift / sum) * 100) : 50;
  const bRatio = 100 - aRatio;
  const balanceScore = Math.max(0, Math.min(100, 100 - Math.abs(aRatio - bRatio)));
  return { aRatio, bRatio, balanceScore, aNet, bNet };
}

export type FormationAlgoInput = {
  mode: FormationAlgoMode;
  players: FormationAlgoPlayer[];
  frontCount: number;
  middleCount: number;
  backCount: number;
  teamName: string;
  teamSide: 'host' | 'away';
  excludeMatchId?: string | null;
};

type DominantHand = 'right' | 'left' | 'both' | 'unknown';
type RoleKey = TempPositionKey | 'allrounder';

type PlayerMetric = {
  id: string;
  name: string;
  stats: PlayerCareerStats;
  preferredPos: string;
  hand: DominantHand;
  role: RoleKey;
  slotShare: number[];
  power: number;
  dataWeight: number;
};

const HAND_NEEDLES: Array<{ needle: string; hand: DominantHand }> = [
  { needle: '양손', hand: 'both' },
  { needle: '왼손', hand: 'left' },
  { needle: '오른손', hand: 'right' },
  { needle: 'left', hand: 'left' },
  { needle: 'right', hand: 'right' },
];

const ROLE_NEEDLES: Array<{ needle: string; role: RoleKey }> = [
  { needle: '리베로', role: 'libero' },
  { needle: '세터', role: 'setter' },
  { needle: '레프트', role: 'left' },
  { needle: '라이트', role: 'right' },
  { needle: '센터', role: 'center' },
  { needle: '중앙', role: 'center' },
  { needle: '백수비', role: 'libero' },
  { needle: '수비', role: 'libero' },
  { needle: '올라운더', role: 'allrounder' },
  { needle: '올라운드', role: 'allrounder' },
];

function uniquePlayers(players: FormationAlgoPlayer[]): FormationAlgoPlayer[] {
  const seen = new Set<string>();
  const out: FormationAlgoPlayer[] = [];
  (players || []).forEach((p) => {
    const id = assignedUserId(p?.user_id);
    if (!id || seen.has(id)) return;
    seen.add(id);
    out.push({ user_id: id, full_name: p.full_name });
  });
  return out;
}

function slotTotal(front: number, middle: number, back: number): number {
  return Math.max(1, (Number(front) || 0) + (Number(middle) || 0) + (Number(back) || 0));
}

function parseHand(raw?: string | null): DominantHand {
  const text = String(raw || '').toLowerCase();
  for (const row of HAND_NEEDLES) {
    if (text.includes(row.needle)) return row.hand;
  }
  return 'unknown';
}

function parseRole(raw?: string | null, fallback?: RoleKey): RoleKey {
  const text = String(raw || '');
  for (const row of ROLE_NEEDLES) {
    if (text.includes(row.needle)) return row.role;
  }
  if (fallback) return fallback;
  const fromTemp = parseTempPositionKey(raw);
  return fromTemp || 'allrounder';
}

function parsePreferredPos(raw?: string | null): string {
  const text = String(raw || '').trim();
  if (!text) return '';
  return text.split('/')[0].trim();
}

function emptySlotShare(n: number): number[] {
  return Array.from({ length: n }, () => 0);
}

function combatPower(stats: PlayerCareerStats, dataWeight: number): number {
  const net = (stats.points || 0) - (stats.faults || 0);
  const efficiency = (stats.points + stats.faults) > 0
    ? net / (stats.points + stats.faults)
    : 0;
  const setShare = Math.min(1, (stats.setsPlayed || 0) / 12);
  const win = (stats.setWinRate || 0) / 100;
  return (
    net * 3
    + efficiency * 12
    + setShare * 10
    + win * 8
    + dataWeight * 4
  );
}

function handBonus(hand: DominantHand, role: TempPositionKey): number {
  if (role === 'left') {
    if (hand === 'right') return 10;
    if (hand === 'left') return -3;
    if (hand === 'both') return 4;
  }
  if (role === 'right') {
    if (hand === 'left') return 10;
    if (hand === 'right') return -3;
    if (hand === 'both') return 4;
  }
  if (role === 'setter' || role === 'center') {
    if (hand === 'both') return 5;
  }
  return 0;
}

function roleAffinity(playerRole: RoleKey, slotRole: TempPositionKey): number {
  if (playerRole === 'allrounder') return 6;
  if (playerRole === slotRole) return 16;
  if (playerRole === 'libero' && slotRole === 'libero') return 18;
  if (playerRole === 'left' && (slotRole === 'left' || slotRole === 'center')) return 5;
  if (playerRole === 'right' && (slotRole === 'right' || slotRole === 'center')) return 5;
  if (playerRole === 'center' && slotRole === 'setter') return 4;
  if (playerRole === 'setter' && slotRole === 'center') return 4;
  if (playerRole === 'libero' && slotRole !== 'libero') return -8;
  return 0;
}

function shuffleInPlace<T>(list: T[]): T[] {
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = list[i];
    list[i] = list[j];
    list[j] = tmp;
  }
  return list;
}

function padCourt(ids: Array<string | null>, total: number): Array<string | null> {
  const next = ids.slice(0, total);
  while (next.length < total) next.push(null);
  return next;
}

/** 교류전: intramural/friendly 가 아닌 대외 경기. is_exchange_match 컬럼이 있으면 우선. */
export function isExchangeMatch(match?: {
  status?: string | null;
  is_official?: boolean | null;
  is_exchange_match?: boolean | null;
} | null): boolean {
  if (!match) return false;
  if (match.is_exchange_match === false) return false;
  if (isIntramuralMatch(match) || match.status === 'friendly') return false;
  if (match.is_exchange_match === true) return true;
  return match.status === 'completed' || match.status === 'pending_result' || match.status === 'matched';
}

function matchTeamSide(match: any, teamName: string): 'host' | 'away' | null {
  if (isSameTeamLabel(match?.host_team_name, teamName)) return 'host';
  if (isSameTeamLabel(match?.away_team_name, teamName)) return 'away';
  return null;
}

async function fetchTeamMatches(teamName: string, excludeMatchId?: string | null): Promise<any[]> {
  const name = String(teamName || '').trim();
  if (!name) return [];
  const select = 'id, status, is_official, is_guest_match, host_team_name, away_team_name, host_roster, away_roster, created_at, match_date, score_logs, winner_team, match_sets(*)';
  const [{ data: asHost }, { data: asAway }] = await Promise.all([
    supabase.from('matches').select(select).eq('host_team_name', name).order('created_at', { ascending: false }).limit(18),
    supabase.from('matches').select(select).eq('away_team_name', name).order('created_at', { ascending: false }).limit(18),
  ]);
  const merged = new Map<string, any>();
  [...(asHost || []), ...(asAway || [])].forEach((row) => {
    if (!row?.id) return;
    if (excludeMatchId && String(row.id) === String(excludeMatchId)) return;
    if (!isSameTeamLabel(row.host_team_name, name) && !isSameTeamLabel(row.away_team_name, name)) return;
    merged.set(String(row.id), row);
  });
  let rows = Array.from(merged.values());
  if (rows.length === 0) {
    const { data: recent } = await supabase
      .from('matches')
      .select(select)
      .in('status', ['completed', 'pending_result', 'matched', 'intramural'])
      .order('created_at', { ascending: false })
      .limit(40);
    (recent || []).forEach((row) => {
      if (!row?.id) return;
      if (excludeMatchId && String(row.id) === String(excludeMatchId)) return;
      if (!isSameTeamLabel(row.host_team_name, name) && !isSameTeamLabel(row.away_team_name, name)) return;
      merged.set(String(row.id), row);
    });
    rows = Array.from(merged.values());
  }
  rows.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  const ids = rows.map((m) => m.id).filter(Boolean);
  if (ids.length) {
    const { data: events } = await supabase
      .from('match_events')
      .select('match_id, player_id, player_name, event_type, is_canceled, team_type, set_index, position_slot')
      .in('match_id', ids);
    const byMatch = new Map<string, any[]>();
    (events || []).forEach((ev) => {
      const mid = String(ev.match_id || '');
      if (!mid) return;
      const list = byMatch.get(mid) || [];
      list.push(ev);
      byMatch.set(mid, list);
    });
    rows.forEach((m) => {
      m.match_events = byMatch.get(String(m.id)) || [];
    });
  }
  return rows;
}

function slotUsageFromMatch(match: any, userId: string, teamName: string, slotCount: number): number[] {
  const share = emptySlotShare(slotCount);
  const side = matchTeamSide(match, teamName);
  const bump = (court: Array<string | null | undefined>) => {
    (court || []).forEach((id, idx) => {
      if (assignedUserId(id) !== userId) return;
      if (idx >= 0 && idx < share.length) share[idx] += 1;
    });
  };
  const sets = Array.isArray(match?.match_sets) ? match.match_sets : [];
  if (sets.length) {
    sets.forEach((row: any) => {
      if (!side || side === 'host') bump(row?.host_lineup || row?.hostLineup);
      if (!side || side === 'away') bump(row?.away_lineup || row?.awayLineup);
    });
    return share;
  }
  if (!side || side === 'host') bump(rawSetLineupSlots(match, 1, 'host'));
  if (!side || side === 'away') bump(rawSetLineupSlots(match, 1, 'away'));
  return share;
}

function primaryRoleFromSlots(share: number[], front: number, middle: number, back: number): RoleKey | null {
  let bestIdx = -1;
  let best = 0;
  share.forEach((n, i) => {
    if (n > best) {
      best = n;
      bestIdx = i;
    }
  });
  if (bestIdx < 0 || best <= 0) return null;
  return positionKeyFromCourtIndex(bestIdx, front, middle, back);
}

async function loadMetrics(
  players: FormationAlgoPlayer[],
  teamName: string,
  front: number,
  middle: number,
  back: number,
  excludeMatchId?: string | null,
): Promise<PlayerMetric[]> {
  const list = uniquePlayers(players);
  const total = slotTotal(front, middle, back);
  const ids = list.map((p) => p.user_id);
  const registered = ids.filter((id) => isRegisteredUserId(id));
  const profileMap = new Map<string, string>();
  if (registered.length) {
    const { data } = await supabase.from('profiles').select('id, position, full_name').in('id', registered);
    (data || []).forEach((row: any) => {
      if (row?.id) profileMap.set(String(row.id), String(row.position || ''));
    });
  }
  const matches = await fetchTeamMatches(teamName, excludeMatchId);
  return list.map((p) => {
    const profilePos = profileMap.get(p.user_id) || '';
    const preferredPos = parsePreferredPos(profilePos);
    const hand = parseHand(profilePos);
    const tempRole = parseTempPositionKey(p.user_id);
    let stats = emptyPlayerCareerStats();
    const slotShare = emptySlotShare(total);
    matches.forEach((match) => {
      const logs = parseMatchScoreLogs(match);
      const beforeSets = stats.setsPlayed;
      addMatchPlayerStats(stats, p.user_id, match, logs, p.full_name);
      if (stats.setsPlayed > beforeSets) {
        const used = slotUsageFromMatch(match, p.user_id, teamName, total);
        used.forEach((n, i) => {
          if (i < slotShare.length) slotShare[i] += n;
        });
      }
    });
    const fromSlots = primaryRoleFromSlots(slotShare, front, middle, back);
    const role = fromSlots || parseRole(preferredPos, tempRole || 'allrounder');
    const dataWeight = Math.min(1, (stats.setsPlayed || 0) / 6);
    return {
      id: p.user_id,
      name: p.full_name || '',
      stats,
      preferredPos,
      hand,
      role,
      slotShare,
      power: combatPower(stats, dataWeight),
      dataWeight,
    };
  });
}

function slotScore(metric: PlayerMetric, slotIndex: number, front: number, middle: number, back: number): number {
  const slotRole = positionKeyFromCourtIndex(slotIndex, front, middle, back);
  const hist = metric.slotShare[slotIndex] || 0;
  const histTotal = metric.slotShare.reduce((s, n) => s + n, 0);
  const histShare = histTotal > 0 ? hist / histTotal : 0;
  const preferredBoost = metric.dataWeight < 0.35 && metric.preferredPos
    ? roleAffinity(parseRole(metric.preferredPos, metric.role), slotRole) * 1.2
    : 0;
  return (
    metric.power * 0.35
    + roleAffinity(metric.role, slotRole)
    + handBonus(metric.hand, slotRole)
    + histShare * 18
    + preferredBoost
  );
}

function assignByScore(
  metrics: PlayerMetric[],
  front: number,
  middle: number,
  back: number,
): Array<string | null> {
  const total = slotTotal(front, middle, back);
  const court: Array<string | null> = Array.from({ length: total }, () => null);
  const remaining = metrics.slice();
  const slotOrder = Array.from({ length: total }, (_, i) => i).sort((a, b) => {
    const roleA = positionKeyFromCourtIndex(a, front, middle, back);
    const roleB = positionKeyFromCourtIndex(b, front, middle, back);
    const rank = (role: TempPositionKey) => (
      role === 'setter' ? 0 : role === 'libero' ? 1 : role === 'left' ? 2 : role === 'right' ? 3 : 4
    );
    return rank(roleA) - rank(roleB) || a - b;
  });
  slotOrder.forEach((slot) => {
    if (!remaining.length) return;
    let bestAt = 0;
    let bestScore = -Infinity;
    remaining.forEach((m, idx) => {
      const score = slotScore(m, slot, front, middle, back);
      if (score > bestScore) {
        bestScore = score;
        bestAt = idx;
      }
    });
    const picked = remaining.splice(bestAt, 1)[0];
    if (picked) court[slot] = picked.id;
  });
  return court;
}

function assignRandom(players: FormationAlgoPlayer[], total: number): Array<string | null> {
  const ids = shuffleInPlace(uniquePlayers(players).map((p) => p.user_id));
  return padCourt(ids.slice(0, total), total);
}

function assignBalanced(
  metrics: PlayerMetric[],
  front: number,
  middle: number,
  back: number,
): Array<string | null> {
  const total = slotTotal(front, middle, back);
  const sorted = metrics.slice().sort((a, b) => b.power - a.power);
  const rows: number[][] = [];
  let offset = 0;
  [front, middle, back].forEach((count) => {
    const row: number[] = [];
    for (let i = 0; i < count; i += 1) row.push(offset + i);
    rows.push(row);
    offset += count;
  });
  const court: Array<string | null> = Array.from({ length: total }, () => null);
  const rowLoads = rows.map(() => 0);
  sorted.forEach((m) => {
    let target = -1;
    let lowest = Infinity;
    rows.forEach((slots, idx) => {
      const hasEmpty = slots.some((slot) => !court[slot]);
      if (!hasEmpty) return;
      if (rowLoads[idx] < lowest) {
        lowest = rowLoads[idx];
        target = idx;
      }
    });
    if (target < 0) return;
    let bestSlot = rows[target][0];
    let bestScore = -Infinity;
    rows[target].forEach((slot) => {
      if (court[slot]) return;
      const score = slotScore(m, slot, front, middle, back);
      if (score > bestScore) {
        bestScore = score;
        bestSlot = slot;
      }
    });
    court[bestSlot] = m.id;
    rowLoads[target] += Math.max(0.5, m.power);
  });
  return court;
}

function fillVacancies(
  court: Array<string | null>,
  metrics: PlayerMetric[],
  front: number,
  middle: number,
  back: number,
): Array<string | null> {
  const used = new Set(court.filter((id): id is string => !!id));
  const leftover = metrics.filter((m) => !used.has(m.id));
  const next = court.slice();
  next.forEach((id, idx) => {
    if (id || !leftover.length) return;
    const scored = leftover
      .map((m, i) => ({ i, score: slotScore(m, idx, front, middle, back) }))
      .sort((a, b) => b.score - a.score);
    const pick = leftover.splice(scored[0].i, 1)[0];
    if (pick) next[idx] = pick.id;
  });
  return next;
}

function startingNineFromMatch(
  match: any,
  teamName: string,
  available: Set<string>,
  total: number,
): Array<string | null> {
  const side = matchTeamSide(match, teamName);
  if (!side) return padCourt([], total);
  const slots = rawSetLineupSlots(match, 1, side);
  return padCourt(
    (slots || []).map((id) => {
      const real = assignedUserId(id);
      return real && available.has(real) ? real : null;
    }),
    total,
  );
}

export async function suggestFormation(input: FormationAlgoInput): Promise<Array<string | null>> {
  const front = Number(input.frontCount) || 0;
  const middle = Number(input.middleCount) || 0;
  const back = Number(input.backCount) || 0;
  const total = slotTotal(front, middle, back);
  const players = uniquePlayers(input.players);
  if (!players.length) return padCourt([], total);

  if (input.mode === 'RANDOM') {
    return assignRandom(players, total);
  }

  const metrics = await loadMetrics(
    players,
    input.teamName,
    front,
    middle,
    back,
    input.excludeMatchId,
  );

  if (input.mode === 'BALANCE') {
    return assignBalanced(metrics, front, middle, back);
  }

  if (input.mode === 'EXCHANGE_STARTERS') {
    const matches = await fetchTeamMatches(input.teamName, input.excludeMatchId);
    const latest = matches.find((m) => isExchangeMatch(m));
    const available = new Set(players.map((p) => p.user_id));
    if (!latest) {
      return assignByScore(metrics, front, middle, back);
    }
    const seeded = startingNineFromMatch(latest, input.teamName, available, total);
    return fillVacancies(seeded, metrics, front, middle, back);
  }

  return assignByScore(metrics, front, middle, back);
}

function metricById(metrics: PlayerMetric[]): Map<string, PlayerMetric> {
  const map = new Map<string, PlayerMetric>();
  metrics.forEach((m) => map.set(m.id, m));
  return map;
}

function ratingsForCourt(court: Array<string | null | undefined>, byId: Map<string, PlayerMetric>): PowerRatioPlayer[] {
  return (court || []).map((id) => {
    const real = assignedUserId(id);
    const hit = real ? byId.get(real) : null;
    return {
      user_id: real,
      points: hit?.stats.points || 0,
      faults: hit?.stats.faults || 0,
    };
  });
}

function splitDualPools(metrics: PlayerMetric[], total: number): { hostPool: PlayerMetric[]; awayPool: PlayerMetric[] } {
  const sorted = metrics.slice().sort((a, b) => b.power - a.power);
  const hostPool: PlayerMetric[] = [];
  const awayPool: PlayerMetric[] = [];
  sorted.forEach((m) => {
    const hostFull = hostPool.length >= total;
    const awayFull = awayPool.length >= total;
    if (hostFull && awayFull) return;
    if (hostFull) {
      awayPool.push(m);
      return;
    }
    if (awayFull) {
      hostPool.push(m);
      return;
    }
    const hostLoad = hostPool.reduce((sum, row) => sum + row.power, 0);
    const awayLoad = awayPool.reduce((sum, row) => sum + row.power, 0);
    if (hostLoad <= awayLoad) hostPool.push(m);
    else awayPool.push(m);
  });
  return { hostPool, awayPool };
}

export type PowerBalancePreview = {
  current: PowerRatioResult;
  next: PowerRatioResult;
  host: Array<string | null>;
  away: Array<string | null>;
};

/** 현재 라인업 vs 재배치 후 라인업의 전력비·코트 배치를 함께 반환 */
export async function previewPowerBalance(args: {
  players: FormationAlgoPlayer[];
  currentHost: Array<string | null | undefined>;
  currentAway: Array<string | null | undefined>;
  frontCount: number;
  middleCount: number;
  backCount: number;
  teamName: string;
  excludeMatchId?: string | null;
  splitBothTeams?: boolean;
  rebalanceSide?: 'host' | 'away';
}): Promise<PowerBalancePreview> {
  const front = Number(args.frontCount) || 0;
  const middle = Number(args.middleCount) || 0;
  const back = Number(args.backCount) || 0;
  const total = slotTotal(front, middle, back);
  const metrics = await loadMetrics(
    args.players,
    args.teamName,
    front,
    middle,
    back,
    args.excludeMatchId,
  );
  const byId = metricById(metrics);
  const current = calculatePowerRatio(
    ratingsForCourt(args.currentHost, byId),
    ratingsForCourt(args.currentAway, byId),
  );

  let host: Array<string | null>;
  let away: Array<string | null>;
  if (args.splitBothTeams === false) {
    const placed = assignBalanced(metrics, front, middle, back);
    if (args.rebalanceSide === 'away') {
      host = padCourt((args.currentHost || []).map((id) => assignedUserId(id)), total);
      away = placed;
    } else {
      host = placed;
      away = padCourt((args.currentAway || []).map((id) => assignedUserId(id)), total);
    }
  } else {
    const { hostPool, awayPool } = splitDualPools(metrics, total);
    host = assignByScore(hostPool, front, middle, back);
    away = assignByScore(awayPool, front, middle, back);
  }

  const next = calculatePowerRatio(
    ratingsForCourt(host, byId),
    ratingsForCourt(away, byId),
  );
  return { current, next, host, away };
}

/** 내전 양팀 모달용: 가용 인원을 전투력 스네이크로 나눠 각각 배치 */
export async function suggestBalancedDual(args: {
  players: FormationAlgoPlayer[];
  frontCount: number;
  middleCount: number;
  backCount: number;
  hostTeamName: string;
  awayTeamName: string;
  excludeMatchId?: string | null;
  currentHost?: Array<string | null | undefined>;
  currentAway?: Array<string | null | undefined>;
}): Promise<{ host: Array<string | null>; away: Array<string | null> }> {
  const preview = await previewPowerBalance({
    players: args.players,
    currentHost: args.currentHost || [],
    currentAway: args.currentAway || [],
    frontCount: args.frontCount,
    middleCount: args.middleCount,
    backCount: args.backCount,
    teamName: args.hostTeamName || args.awayTeamName,
    excludeMatchId: args.excludeMatchId,
    splitBothTeams: true,
  });
  return { host: preview.host, away: preview.away };
}
