/** 팀원 목록이 실명·닉네임을 비우지 않도록 조인 컬럼을 고정한다. */
export const TEAM_MEMBER_PROFILE_COLUMNS = 'id, full_name, nickname, is_name_public';

export const TEAM_MEMBERS_WITH_PROFILES_SELECT = `
  id, team_id, user_id, is_active,
  teams(*),
  profiles(${TEAM_MEMBER_PROFILE_COLUMNS})
`;

export type JoinedMemberProfile = {
  full_name: string;
  nickname: string;
  is_name_public: boolean;
};

function asRow(raw: unknown): Record<string, unknown> | null {
  const row = Array.isArray(raw) ? raw[0] : raw;
  if (!row || typeof row !== 'object') return null;
  return row as Record<string, unknown>;
}

/** profiles 조인이 객체·배열·한 단계 중첩이어도 full_name, nickname을 읽는다. */
export function readJoinedProfile(raw: unknown): JoinedMemberProfile {
  const row = asRow(raw);
  if (!row) return { full_name: '', nickname: '', is_name_public: false };
  const nested = asRow(row.profiles);
  const fullName = row.full_name ?? row.fullName ?? nested?.full_name ?? nested?.fullName;
  const nickname = row.nickname ?? nested?.nickname;
  const namePublic = row.is_name_public === true || nested?.is_name_public === true;
  return {
    full_name: fullName == null ? '' : String(fullName),
    nickname: nickname == null ? '' : String(nickname),
    is_name_public: namePublic,
  };
}
