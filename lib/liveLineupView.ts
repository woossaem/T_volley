import { supabase } from './supabase';
import type { MatchSetRecord } from './matchSets';
import {
  assignedUserId,
  clampLineCount,
  DEFAULT_LINE_COUNT,
  courtSlotLabelAt,
  displaySlotPlayerName,
  parseSetFormationMap,
  resolveFormationFromSources,
  type SetFormation,
} from './roster';
import { parseTempGuestNum } from './tempPlayer';
import { getSafeDisplayName, getSafeTeamName } from './utils';
import type { LineupPlayerView, TeamLineupView } from '../components/TeamLineupPanel';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type PlayerMeta = {
  name: string;
  isCaptain?: boolean;
};

function intramuralNames(description?: string | null): { host: string; away: string } | null {
  const m = String(description || '').match(/^\[(.*?)\ VS (.*?)\]/);
  if (!m) return null;
  return { host: m[1] || 'A팀', away: m[2] || 'B팀' };
}

function toPlayer(
  id: string | null | undefined,
  index: number,
  formation: SetFormation | null,
  metaMap: Record<string, PlayerMeta>,
  kind: 'court' | 'bench',
): LineupPlayerView | null {
  const real = assignedUserId(id);
  if (!real) return null;
  const guestNum = parseTempGuestNum(real);
  const badge = guestNum ? String(guestNum) : String(index + 1);
  const meta = metaMap[real];
  const name = meta?.name || displaySlotPlayerName(real, null);
  let position: string | undefined;
  if (kind === 'court' && formation) {
    position = courtSlotLabelAt(
      index,
      formation.frontCount,
      formation.middleCount,
      formation.backCount,
    );
  }
  return {
    id: real,
    name,
    badge,
    position,
    isCaptain: !!meta?.isCaptain,
  };
}

function collectIds(formation: SetFormation): string[] {
  return [...(formation.court || []), ...(formation.bench || [])]
    .map((id) => assignedUserId(id))
    .filter((id): id is string => !!id && UUID_RE.test(id));
}

async function loadPlayerMetaMap(ids: string[]): Promise<Record<string, PlayerMeta>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return {};
  const { data } = await supabase.from('profiles').select('*').in('id', unique);
  const map: Record<string, PlayerMeta> = {};
  (data || []).forEach((row: any) => {
    if (!row?.id) return;
    map[row.id] = {
      name: getSafeDisplayName(row) || '',
      isCaptain: !!(row.is_captain || row.isCaptain || row.captain),
    };
  });
  return map;
}

function formationToView(teamName: string, formation: SetFormation, metaMap: Record<string, PlayerMeta>): TeamLineupView {
  const front = clampLineCount(formation.frontCount, DEFAULT_LINE_COUNT);
  const middle = clampLineCount(formation.middleCount, DEFAULT_LINE_COUNT);
  const back = clampLineCount(formation.backCount, DEFAULT_LINE_COUNT);
  const slotTotal = front + middle + back;
  const courtSlots = [...(formation.court || [])];
  while (courtSlots.length < slotTotal) courtSlots.push('');
  const court = courtSlots
    .slice(0, slotTotal)
    .map((id, index) => toPlayer(id, index, formation, metaMap, 'court'))
    .filter((p): p is LineupPlayerView => !!p && !!p.name);
  const courtIds = new Set(court.map((p) => p.id));
  const bench = (formation.bench || [])
    .map((id, index) => toPlayer(id, index, null, metaMap, 'bench'))
    .filter((p): p is LineupPlayerView => !!p && !!p.name && !courtIds.has(p.id));
  return { teamName, court, bench };
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim());
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map((item) => String(item || '').trim());
    } catch {
      return value.split(',').map((s) => s.trim()).filter(Boolean);
    }
  }
  return [];
}

function liveSetIndexFromRows(rows: MatchSetRecord[], finished: boolean): number {
  if (rows.length === 0) return 0;
  if (finished) return Math.max(0, rows.length - 1);
  const openIdx = rows.findIndex((s) => !s.isClosed);
  return openIdx >= 0 ? openIdx : Math.max(0, rows.length - 1);
}

export async function loadLiveLineups(matchId: string): Promise<{ left: TeamLineupView; right: TeamLineupView } | null> {
  const { data: match, error } = await supabase.from('matches').select('*').eq('id', matchId).maybeSingle();
  if (error || !match) return null;

  const { data: setRows } = await supabase
    .from('match_sets')
    .select('*')
    .eq('match_id', matchId)
    .order('set_number', { ascending: true });

  const hostFormMap = parseSetFormationMap(match.host_roster);
  const awayFormMap = parseSetFormationMap(match.away_roster);
  const sets: MatchSetRecord[] = (setRows || []).map((row: any) => {
    const idx = Math.max(0, (row.set_number || 1) - 1);
    return {
      setNumber: row.set_number,
      hostScore: row.host_score || 0,
      awayScore: row.away_score || 0,
      hostLineup: asStringArray(row.host_lineup),
      awayLineup: asStringArray(row.away_lineup),
      hostBench: hostFormMap[idx]?.bench || hostFormMap[0]?.bench || [],
      hostLate: hostFormMap[idx]?.late || hostFormMap[0]?.late || [],
      awayBench: awayFormMap[idx]?.bench || awayFormMap[0]?.bench || [],
      awayLate: awayFormMap[idx]?.late || awayFormMap[0]?.late || [],
      hostFrontCount: hostFormMap[idx]?.frontCount || hostFormMap[0]?.frontCount,
      hostMiddleCount: hostFormMap[idx]?.middleCount || hostFormMap[0]?.middleCount,
      hostBackCount: hostFormMap[idx]?.backCount || hostFormMap[0]?.backCount,
      awayFrontCount: awayFormMap[idx]?.frontCount || awayFormMap[0]?.frontCount,
      awayMiddleCount: awayFormMap[idx]?.middleCount || awayFormMap[0]?.middleCount,
      awayBackCount: awayFormMap[idx]?.backCount || awayFormMap[0]?.backCount,
      isClosed: !!row.is_closed,
    };
  });

  const finished = match.status === 'completed' || match.status === 'friendly' || !!match.winner_team;
  const liveIdx = liveSetIndexFromRows(sets, finished);
  const setRow = sets.find((s) => s.setNumber === liveIdx + 1) || sets[liveIdx];
  const intra = match.status === 'intramural' ? intramuralNames(match.description) : null;
  const hostName = getSafeTeamName(intra?.host || match.host_team_name || '홈 팀');
  const awayName = getSafeTeamName(intra?.away || match.away_team_name || '어웨이 팀');

  const hostForm = resolveFormationFromSources(
    match.host_roster,
    liveIdx,
    setRow?.hostLineup,
    { bench: setRow?.hostBench, late: setRow?.hostLate, frontCount: setRow?.hostFrontCount, middleCount: setRow?.hostMiddleCount, backCount: setRow?.hostBackCount },
  );
  const awayForm = resolveFormationFromSources(
    match.away_roster,
    liveIdx,
    setRow?.awayLineup,
    { bench: setRow?.awayBench, late: setRow?.awayLate, frontCount: setRow?.awayFrontCount, middleCount: setRow?.awayMiddleCount, backCount: setRow?.awayBackCount },
  );

  const metaMap = await loadPlayerMetaMap([...collectIds(hostForm), ...collectIds(awayForm)]);
  return {
    left: formationToView(hostName, hostForm, metaMap),
    right: formationToView(awayName, awayForm, metaMap),
  };
}
