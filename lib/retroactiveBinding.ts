import { supabase } from './supabase';
import { updateMatchIgnoringUnknownColumns } from './matchWrite';
import { sendNotificationToTeam, sendNotificationToUser } from './notificationService';
import { isSameName, resolveTeamName } from './nameUtils';
import { isTempSlotId, formatTempPlayerLabel, formatPlayerDisplayName } from './tempPlayer';
import { isUnofficialMatch } from './officialMatch';

export const RETRO_CLAIM_PREFIX = 'RETRO_CLAIM';
export const RANKING_UPDATED_MESSAGE = '과거 교류전이 공식 승인되어 랭킹이 업데이트되었습니다';

export type PlayerIdReplacement = {
  fromId: string;
  toId: string;
  toName?: string | null;
};

export type RetroClaimPayload = {
  matchId: string;
  teamId: string;
  teamName: string;
};

function deepCopy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function replaceIdValue(value: unknown, fromId: string, toId: string): unknown {
  if (value == null) return value;
  if (typeof value === 'string') return value === fromId ? toId : value;
  if (Array.isArray(value)) return value.map((item) => replaceIdValue(item, fromId, toId));
  if (typeof value === 'object') {
    const src = value as Record<string, unknown>;
    const next: Record<string, unknown> = {};
    Object.entries(src).forEach(([key, item]) => {
      if (
        (key === 'player_id' || key === 'playerId' || key === 'user_id' || key === 'sub_out_id')
        && item === fromId
      ) {
        next[key] = toId;
      } else {
        next[key] = replaceIdValue(item, fromId, toId);
      }
    });
    return next;
  }
  return value;
}

function applyReplacements(value: unknown, replacements: PlayerIdReplacement[]): unknown {
  return replacements.reduce((acc, { fromId, toId }) => replaceIdValue(acc, fromId, toId), value);
}

function applyNameToLogs(value: unknown, replacements: PlayerIdReplacement[]): unknown {
  if (!Array.isArray(value)) return value;
  const nameByFrom = new Map(
    replacements.filter((r) => r.toName).map((r) => [r.fromId, r.toName as string]),
  );
  const nameByTo = new Map(
    replacements.filter((r) => r.toName).map((r) => [r.toId, r.toName as string]),
  );
  return value.map((item) => {
    if (!item || typeof item !== 'object') return item;
    const log = { ...(item as Record<string, unknown>) };
    const pid = String(log.player_id ?? log.playerId ?? '');
    const nextName = nameByTo.get(pid) || nameByFrom.get(pid);
    if (nextName) {
      if ('player_name' in log) log.player_name = nextName;
      if ('playerName' in log) log.playerName = nextName;
      if ('name' in log) log.name = nextName;
    }
    return log;
  });
}

export function collectTempReplacements(
  before: Array<string | null | undefined>,
  after: Array<string | null | undefined>,
  nameOf?: (id: string) => string | null | undefined,
): PlayerIdReplacement[] {
  const map = new Map<string, PlayerIdReplacement>();
  const len = Math.max(before.length, after.length);
  for (let i = 0; i < len; i += 1) {
    const prev = String(before[i] || '').trim();
    const next = String(after[i] || '').trim();
    if (!isTempSlotId(prev) || !next || isTempSlotId(next)) continue;
    map.set(prev, { fromId: prev, toId: next, toName: nameOf?.(next) || null });
  }
  return Array.from(map.values());
}

export function collectTempIdsFromValue(value: unknown, bucket: Set<string> = new Set()): Set<string> {
  if (value == null) return bucket;
  if (typeof value === 'string') {
    if (isTempSlotId(value)) bucket.add(value);
    return bucket;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectTempIdsFromValue(item, bucket));
    return bucket;
  }
  if (typeof value === 'object') {
    Object.values(value as Record<string, unknown>).forEach((item) => collectTempIdsFromValue(item, bucket));
  }
  return bucket;
}

export type TempSlotRow = {
  side: 'host' | 'away';
  setNumber: number;
  slotIndex: number;
  tempId: string;
  label: string;
};

export function listTempSlotsFromLineup(
  lineup: unknown,
  side: 'host' | 'away',
  setNumber: number,
): TempSlotRow[] {
  if (!Array.isArray(lineup)) return [];
  const rows: TempSlotRow[] = [];
  lineup.forEach((item, slotIndex) => {
    const id = typeof item === 'string' ? item : String((item as any)?.player_id ?? (item as any)?.user_id ?? '');
    if (!isTempSlotId(id)) return;
    rows.push({
      side,
      setNumber,
      slotIndex,
      tempId: id,
      label: formatTempPlayerLabel(id),
    });
  });
  return rows;
}

async function updateMatchSetsPlayerIds(matchId: string, replacements: PlayerIdReplacement[]) {
  const { data, error } = await supabase
    .from('match_sets')
    .select('id, host_lineup, away_lineup, updated_at')
    .eq('match_id', matchId);
  if (error || !data) return;

  for (const row of data) {
    const nextHost = applyReplacements(deepCopy(row.host_lineup), replacements);
    const nextAway = applyReplacements(deepCopy(row.away_lineup), replacements);
    const payload = {
      host_lineup: nextHost,
      away_lineup: nextAway,
      updated_at: new Date().toISOString(),
    };
    let query = supabase.from('match_sets').update(payload).eq('id', row.id);
    if (row.updated_at) query = query.eq('updated_at', row.updated_at);
    const first = await query;
    if (first.error) {
      await supabase.from('match_sets').update(payload).eq('id', row.id);
    }
  }
}

async function updateMatchScoreLogsAndRosters(matchId: string, replacements: PlayerIdReplacement[]) {
  const { data, error } = await supabase
    .from('matches')
    .select('id, score_logs, host_roster, away_roster, updated_at')
    .eq('id', matchId)
    .maybeSingle();
  if (error || !data) return;

  const nextLogs = applyNameToLogs(applyReplacements(deepCopy(data.score_logs ?? []), replacements), replacements);
  const payload: Record<string, unknown> = {
    score_logs: nextLogs,
    host_roster: applyReplacements(deepCopy(data.host_roster), replacements),
    away_roster: applyReplacements(deepCopy(data.away_roster), replacements),
  };

  const updated = await updateMatchIgnoringUnknownColumns(matchId, payload);
  if (updated.error) {
    await supabase.from('matches').update({ score_logs: nextLogs }).eq('id', matchId);
  }
}

async function updateSetLineupsPlayerIds(matchId: string, replacements: PlayerIdReplacement[]) {
  try {
    for (const { fromId, toId } of replacements) {
      const { error } = await supabase
        .from('set_lineups')
        .update({ player_id: toId, updated_at: new Date().toISOString() })
        .eq('match_id', matchId)
        .eq('player_id', fromId);
      if (error) return;
    }
  } catch {
    // set_lineups 미존재 시 무시
  }
}

async function updateMatchEventsPlayerIds(matchId: string, replacements: PlayerIdReplacement[]) {
  try {
    for (const { fromId, toId, toName } of replacements) {
      const payload: Record<string, unknown> = { player_id: toId };
      if (toName) payload.player_name = toName;
      await supabase.from('match_events').update(payload).eq('match_id', matchId).eq('player_id', fromId);
    }
  } catch {
    // match_events 미존재 시 무시
  }
}

/**
 * temp_ 식별자를 신규 유저 ID로 순차 치환.
 * 1) match_sets.host_lineup / away_lineup
 * 2) matches.score_logs
 * 3) set_lineups.player_id
 */
export async function bindTempPlayerIds(matchId: string, replacements: PlayerIdReplacement[]) {
  const valid = replacements.filter((r) => isTempSlotId(r.fromId) && r.toId && r.fromId !== r.toId);
  if (!matchId || valid.length === 0) return { error: null };

  const { error: rpcError } = await supabase.rpc('bind_match_guest_players', {
    p_match_id: matchId,
    p_bindings: valid.map((r) => ({
      from_id: r.fromId,
      to_id: r.toId,
      to_name: r.toName || '',
    })),
  });
  if (!rpcError) return { error: null };

  await updateMatchSetsPlayerIds(matchId, valid);
  await updateMatchScoreLogsAndRosters(matchId, valid);
  await updateSetLineupsPlayerIds(matchId, valid);
  await updateMatchEventsPlayerIds(matchId, valid);
  return { error: null };
}

export async function appendMatchScoreLog(matchId: string, log: Record<string, unknown>) {
  if (!matchId) return;
  const { data } = await supabase.from('matches').select('score_logs').eq('id', matchId).maybeSingle();
  const prev = Array.isArray(data?.score_logs) ? deepCopy(data.score_logs) : [];
  prev.push(log);
  await updateMatchIgnoringUnknownColumns(matchId, { score_logs: prev });
}

export async function syncSetLineupsFromSets(
  matchId: string,
  sets: Array<{ setNumber: number; hostLineup?: unknown; awayLineup?: unknown }>,
) {
  if (!matchId) return;
  try {
    await supabase.from('set_lineups').delete().eq('match_id', matchId);
    const rows: Array<Record<string, unknown>> = [];
    sets.forEach((set) => {
      const write = (lineup: unknown, side: 'host' | 'away') => {
        if (!Array.isArray(lineup)) return;
        lineup.forEach((item, slotIndex) => {
          const id = typeof item === 'string' ? item : String((item as any)?.player_id ?? '');
          if (!id) return;
          rows.push({
            match_id: matchId,
            set_number: set.setNumber,
            side,
            slot_index: slotIndex,
            player_id: id,
            updated_at: new Date().toISOString(),
          });
        });
      };
      write(set.hostLineup, 'host');
      write(set.awayLineup, 'away');
    });
    if (rows.length > 0) {
      await supabase.from('set_lineups').insert(rows);
    }
  } catch {
    // set_lineups 미존재 시 무시
  }
}

export function encodeRetroClaimPayload(matchId: string, teamId: string, teamName: string): string {
  return `${RETRO_CLAIM_PREFIX}|${matchId}|${teamId}|${teamName}`;
}

export function parseRetroClaimPayload(message?: string | null): RetroClaimPayload | null {
  if (!message) return null;
  const line = String(message).split('\n')[0].trim();
  if (!line.startsWith(`${RETRO_CLAIM_PREFIX}|`)) return null;
  const parts = line.split('|');
  if (parts.length < 4) return null;
  return { matchId: parts[1], teamId: parts[2], teamName: parts.slice(3).join('|') };
}

export async function findTeamByName(teamName: string) {
  const target = resolveTeamName(teamName, teamName);
  if (!target) return null;
  const { data } = await supabase.from('teams').select('id, name, team_name');
  return (data || []).find((t: any) => isSameName(resolveTeamName(t), target)) || null;
}

export async function requestRetroTeamClaim(opts: {
  matchId: string;
  claimingTeamName: string;
  claimingUserId: string;
  claimingUserName?: string;
}) {
  const team = await findTeamByName(opts.claimingTeamName);
  if (!team?.id) return { error: { message: '가입된 팀을 찾지 못했습니다.' } };

  const { data: match, error } = await supabase
    .from('matches')
    .select('id, host_user_id, host_team_name, away_team_name, away_team_id, is_official, status, retro_claim_status')
    .eq('id', opts.matchId)
    .maybeSingle();
  if (error || !match) return { error: error || { message: '경기를 찾지 못했습니다.' } };
  if (!isUnofficialMatch(match)) return { error: { message: '이미 공식 경기입니다.' } };
  if (match.away_team_id) return { error: { message: '이미 상대 팀이 연동된 경기입니다.' } };
  if (match.retro_claim_status === 'pending') return { error: { message: '이미 소급 승인을 기다리고 있습니다.' } };

  const awayName = resolveTeamName(match.away_team_name);
  if (!isSameName(awayName, opts.claimingTeamName)) {
    return { error: { message: '상대 팀명과 일치하는 경기에만 소급 신청할 수 있습니다.' } };
  }

  const updated = await updateMatchIgnoringUnknownColumns(opts.matchId, {
    retro_claim_status: 'pending',
    retro_claim_team_id: team.id,
    retro_claim_team_name: resolveTeamName(team),
    retro_claim_user_id: opts.claimingUserId,
  });
  if (updated.error) return { error: updated.error };

  const payload = encodeRetroClaimPayload(opts.matchId, team.id, resolveTeamName(team));
  const human = `'${resolveTeamName(team)}' (${opts.claimingUserName || '선생님'})이 과거 교류전 소급 연동을 신청했습니다. 승인하면 공식 랭킹에 반영됩니다.`;
  if (match.host_user_id) {
    await sendNotificationToUser(match.host_user_id, '[소급 승인 요청]', `${payload}\n${human}`);
  }
  return { error: null };
}

export async function approveRetroTeamClaim(opts: {
  matchId: string;
  approved: boolean;
}) {
  const { data: match, error } = await supabase
    .from('matches')
    .select('id, host_team_name, away_team_name, retro_claim_team_id, retro_claim_team_name, retro_claim_user_id')
    .eq('id', opts.matchId)
    .maybeSingle();
  if (error || !match) return { error: error || { message: '경기를 찾지 못했습니다.' } };

  if (!opts.approved) {
    await updateMatchIgnoringUnknownColumns(opts.matchId, {
      retro_claim_status: 'rejected',
    });
    if (match.retro_claim_user_id) {
      await sendNotificationToUser(
        match.retro_claim_user_id,
        '[소급 신청 거절]',
        '주최자가 과거 교류전 소급 연동을 거절했습니다.',
      );
    }
    return { error: null };
  }

  const teamId = match.retro_claim_team_id;
  const teamName = resolveTeamName(match.retro_claim_team_name, match.away_team_name);
  const updated = await updateMatchIgnoringUnknownColumns(opts.matchId, {
    away_team_id: teamId,
    is_official: true,
    status: 'completed',
    retro_claim_status: 'approved',
  });
  if (updated.error) return { error: updated.error };

  const hostName = resolveTeamName(match.host_team_name);
  if (hostName) await sendNotificationToTeam(hostName, '✅ [공식 소급 승인]', RANKING_UPDATED_MESSAGE);
  if (teamName) await sendNotificationToTeam(teamName, '✅ [공식 소급 승인]', RANKING_UPDATED_MESSAGE);
  return { error: null };
}

export function displayNameForLog(playerId?: string | null, playerName?: string | null) {
  return formatPlayerDisplayName(playerId, playerName);
}
