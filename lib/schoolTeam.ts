import { canonicalizeAdminRegion, isCanonicalAdminRegion } from '../constants/adminRegions';
import { supabase } from './supabase';

export type SchoolTeamPlacement = {
  teamId: string;
  teamName: string;
  region: string;
  created: boolean;
};

/** 프로필에 저장하는 학교명. "삼은초등학교"는 기존 데이터와 같이 "삼은초"로 맞춘다. */
export function formatSchoolShortName(name: string): string {
  return name.trim().replace(/초등학교$/, '초');
}

export function schoolTeamDisplayName(schoolName: string): string {
  return formatSchoolShortName(schoolName);
}

function readableRpcError(message: string): string {
  if (/ensure_school_team_membership|PGRST202|schema cache|function .* does not exist/i.test(message)) {
    return '학교 팀 자동 배치 함수가 아직 없습니다. Supabase에 v2.2.1 마이그레이션을 적용한 뒤 다시 시도해 주세요.';
  }
  if (/school_region|is_public/i.test(message)) {
    return '학교 행정구역 컬럼이 아직 없습니다. Supabase에 v2.2.1 마이그레이션을 적용한 뒤 다시 시도해 주세요.';
  }
  return message;
}

/**
 * 학교명 + 행정구역으로 학교 팀을 찾거나 만들고, 로그인한 사용자를 그 팀에 넣는다.
 * 동호회 팀 가입 경로와는 별도 RPC만 사용한다.
 */
export async function ensureSchoolTeamMembership(
  schoolName: string,
  schoolRegion: string,
): Promise<SchoolTeamPlacement> {
  const name = formatSchoolShortName(schoolName);
  const region = canonicalizeAdminRegion(schoolRegion);

  if (!name || name.length < 2) {
    throw new Error('학교명을 2자 이상 입력해 주세요.');
  }
  if (!region || !isCanonicalAdminRegion(region)) {
    throw new Error('학교 행정구역을 목록에서 선택해 주세요. 예: 충남 아산시');
  }

  const { data, error } = await supabase.rpc('ensure_school_team_membership', {
    p_school_name: name,
    p_school_region: region,
  });

  if (error) throw new Error(readableRpcError(error.message || '학교 팀 배치에 실패했습니다.'));

  const row = (data || {}) as {
    team_id?: string;
    team_name?: string;
    region?: string;
    created?: boolean;
  };
  if (!row.team_id) throw new Error('학교 팀 배치 결과를 받지 못했습니다.');

  if (row.created) {
    await releaseAutoAssignedSchoolLeadership(row.team_id);
  }

  return {
    teamId: row.team_id,
    teamName: row.team_name || schoolTeamDisplayName(name),
    region: row.region || region,
    created: !!row.created,
  };
}

/** 예전 함수가 만든 팀에만, 방금 가입한 사람의 자동 대표 지정을 걷어 낸다. */
async function releaseAutoAssignedSchoolLeadership(teamId: string): Promise<void> {
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id;
  if (!userId) return;

  await supabase.from('teams').update({ leader_id: null }).eq('id', teamId).eq('leader_id', userId);
  await supabase.from('team_members').update({ role: 'member' }).eq('team_id', teamId).eq('user_id', userId);
}

/** 대표가 없는 팀에서만 현재 사용자를 팀 대표로 등록한다. */
export async function claimVacantTeamLeadership(teamId: string): Promise<void> {
  const { error } = await supabase.rpc('claim_vacant_team_leadership', { p_team_id: teamId });
  if (!error) return;

  const missingFn = /claim_vacant_team_leadership|PGRST202|schema cache|function .* does not exist/i.test(error.message || '');
  if (!missingFn) throw new Error(error.message || '팀 대표 등록에 실패했습니다.');

  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error('로그인이 필요합니다.');

  const { data: team, error: readError } = await supabase
    .from('teams')
    .select('leader_id')
    .eq('id', teamId)
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  if (team?.leader_id) throw new Error('이미 팀 대표가 있습니다.');

  const { data: member, error: memberError } = await supabase
    .from('team_members')
    .select('user_id')
    .eq('team_id', teamId)
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();
  if (memberError) throw new Error(memberError.message);
  if (!member) throw new Error('소속 팀원만 대표로 등록할 수 있습니다.');

  const { data: updated, error: teamError } = await supabase
    .from('teams')
    .update({ leader_id: userId })
    .eq('id', teamId)
    .is('leader_id', null)
    .select('id')
    .maybeSingle();
  if (teamError) throw new Error(teamError.message);
  if (!updated) throw new Error('이미 팀 대표가 있습니다.');

  const { error: roleError } = await supabase
    .from('team_members')
    .update({ role: 'leader' })
    .eq('team_id', teamId)
    .eq('user_id', userId);
  if (roleError && !/role/i.test(roleError.message || '')) {
    throw new Error(roleError.message);
  }
}
