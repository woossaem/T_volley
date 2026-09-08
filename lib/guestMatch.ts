import { supabase } from './supabase';
import { updateMatchIgnoringUnknownColumns } from './matchWrite';
import { sendNotificationToTeam } from './notificationService';
import { resolveTeamName } from './nameUtils';
import { DEFAULT_LINE_COUNT, serializeSetFormationMap } from './roster';
import { makeTempGuestId } from './tempPlayer';
import { isIntramuralMatch } from './officialMatch';

export const DEFAULT_GUEST_TEAM_NAME = '게스트 팀';

export type GuestMatchLike = {
  id?: string;
  status?: string | null;
  away_team_id?: string | null;
  away_team_name?: string | null;
  host_team_id?: string | null;
  host_team_name?: string | null;
  winner_team?: string | null;
  is_guest_match?: boolean | null;
  is_official?: boolean | null;
};

export function isGuestMatch(match?: { is_guest_match?: boolean | null } | null): boolean {
  return match?.is_guest_match === true;
}

/** 아직 실제 상대 팀이 없는 게스트 경기. 상대 승인 없이 종료할 수 있다. */
export function isSoloGuestMatch(match?: GuestMatchLike | null): boolean {
  return isGuestMatch(match) && !match?.away_team_id;
}

/** 홈이 실제 상대 팀을 지정한 뒤, 상대 승인/재수정 대기 중인 게스트 연동 */
export function isGuestBindPending(match?: GuestMatchLike | null): boolean {
  return isGuestMatch(match) && !!match?.away_team_id;
}

function matchHasRecordedResult(match?: GuestMatchLike | null): boolean {
  if (!match) return false;
  if (match.status === 'completed' || match.status === 'pending_result') return true;
  if (match.winner_team) return true;
  return false;
}

export function canConvertMatchToGuest(match?: GuestMatchLike | null): boolean {
  if (!match) return false;
  if (isIntramuralMatch(match)) return false;
  if (isGuestMatch(match)) return false;
  if (match.status !== 'open') return false;
  if (match.away_team_id) return false;
  const away = resolveTeamName(match.away_team_name || '', '');
  return !away;
}

export function buildGuestAwayRosterJson(): string {
  const court = Array.from({ length: 9 }, (_, i) => makeTempGuestId(i + 1));
  return serializeSetFormationMap({
    0: {
      court,
      bench: [],
      late: [],
      frontCount: DEFAULT_LINE_COUNT,
      middleCount: DEFAULT_LINE_COUNT,
      backCount: DEFAULT_LINE_COUNT,
    },
  });
}

export function guestMatchWritePayload(opts?: {
  awayTeamName?: string | null;
  hostTeamId?: string | null;
}): Record<string, unknown> {
  const name = String(opts?.awayTeamName || '').trim() || DEFAULT_GUEST_TEAM_NAME;
  return {
    away_team_name: name,
    away_team_id: null,
    status: 'matched',
    is_guest_match: true,
    is_official: false,
    away_roster: buildGuestAwayRosterJson(),
    set_scores: null,
    recorder_host_id: null,
    recorder_away_id: null,
    ...(opts?.hostTeamId ? { host_team_id: opts.hostTeamId } : {}),
  };
}

export async function convertOpenMatchToGuest(opts: {
  matchId: string;
  awayTeamName?: string | null;
  hostTeamId?: string | null;
}) {
  const { data: match, error } = await supabase
    .from('matches')
    .select('*')
    .eq('id', opts.matchId)
    .maybeSingle();
  if (error || !match) return { data: null, error: error || { message: '경기를 찾지 못했습니다.' } };
  if (!canConvertMatchToGuest(match)) {
    return { data: null, error: { message: '상대 팀이 아직 없는 모집 중인 경기만 게스트 팀으로 바꿀 수 있습니다.' } };
  }

  await supabase.from('match_events').delete().eq('match_id', opts.matchId);

  return updateMatchIgnoringUnknownColumns(
    opts.matchId,
    guestMatchWritePayload({ awayTeamName: opts.awayTeamName, hostTeamId: opts.hostTeamId }),
  );
}

export async function bindGuestMatchToRegisteredTeam(opts: {
  matchId: string;
  teamId: string;
  teamName: string;
  submitterName?: string | null;
}): Promise<{ data: any; error: any; needsResultConfirm: boolean }> {
  const fail = (message: string, error?: any) => ({
    data: null,
    error: error || { message },
    needsResultConfirm: false,
  });
  const teamName = resolveTeamName(opts.teamName, opts.teamName).trim();
  if (!opts.teamId || !teamName) {
    return fail('연동할 팀을 선택해 주세요.');
  }

  const { data: match, error } = await supabase
    .from('matches')
    .select('*')
    .eq('id', opts.matchId)
    .maybeSingle();
  if (error || !match) return fail('경기를 찾지 못했습니다.', error);
  if (!isGuestMatch(match)) {
    return fail('게스트 팀 경기가 아닙니다.');
  }
  if (match.away_team_id) {
    return fail('이미 상대 팀이 지정된 경기입니다. 상대의 승인 또는 재수정을 기다려 주세요.');
  }
  if (match.host_team_id && match.host_team_id === opts.teamId) {
    return fail('주최 팀과 같은 팀으로는 연동할 수 없습니다.');
  }
  const hostName = resolveTeamName(match.host_team_name);
  if (hostName && hostName === teamName) {
    return fail('주최 팀과 같은 팀으로는 연동할 수 없습니다.');
  }

  const needsResultConfirm = matchHasRecordedResult(match);
  const payload: Record<string, unknown> = {
    away_team_id: opts.teamId,
    away_team_name: teamName,
    is_guest_match: true,
    is_official: false,
  };
  if (needsResultConfirm) {
    payload.status = 'pending_result';
    payload.result_submitter_team = match.host_team_name;
    if (opts.submitterName) payload.submitted_by_name = opts.submitterName;
  }

  const updated = await updateMatchIgnoringUnknownColumns(opts.matchId, payload);
  if (updated.error) return { ...updated, needsResultConfirm };

  const hostLabel = hostName || '주최 팀';
  await sendNotificationToTeam(
    teamName,
    needsResultConfirm ? '⚠️ [게스트 경기 소급 연동 · 결과 승인 요청]' : '🔗 [게스트 경기 상대 팀 지정]',
    needsResultConfirm
      ? `'${hostLabel}'이 '${teamName}' 팀으로 소급 연동을 지정했습니다. 결과를 승인하거나 재수정해 주세요. 승인 후에만 공식 랭킹에 반영됩니다.`
      : `'${hostLabel}'이 '${teamName}' 팀을 상대 팀으로 지정했습니다. 경기 종료 후 결과 승인 또는 재수정이 필요합니다.`,
  );
  return { ...updated, needsResultConfirm };
}

export async function finalizeGuestMatchAsOfficial(opts: {
  matchId: string;
  approvedByName?: string | null;
}) {
  return updateMatchIgnoringUnknownColumns(opts.matchId, {
    status: 'completed',
    is_guest_match: false,
    is_official: true,
    approved_by_name: opts.approvedByName || null,
  });
}
