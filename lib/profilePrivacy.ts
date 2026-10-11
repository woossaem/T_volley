/** 화면마다 실명·닉네임·마스킹을 나누는 표시 이름. */

type NameProfile = {
  full_name?: string | null;
  fullName?: string | null;
  nickname?: string | null;
  is_name_public?: boolean | null;
} | null | undefined;

const BLANK_NAME = new Set(['null', 'undefined', 'none', 'nan', '-', '{}', '[]']);

function visibleToken(value?: string | null): string {
  const cleaned = String(value || '')
    .replace(/[\u200B-\u200D\uFEFF\u00A0\u200E\u200F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned || BLANK_NAME.has(cleaned.toLowerCase())) return '';
  return cleaned;
}

function realNameOf(profile: NameProfile): string {
  return visibleToken(profile?.full_name || profile?.fullName);
}

function nicknameOf(profile: NameProfile): string {
  return visibleToken(profile?.nickname).slice(0, 8);
}

export function maskRealName(name?: string | null): string {
  const trimmed = visibleToken(name);
  const first = Array.from(trimmed)[0];
  if (!first) return '선생님';
  return `${first}**`;
}

/** 홈·내 프로필. 공개 스위치와 관계없이 실명만 보여 준다. */
export function ownProfileName(profile: NameProfile): string {
  return realNameOf(profile) || '선생님';
}

/** 자체내전처럼 팀 안에서 실명과 닉네임을 가리지 않고 보여 준다. */
export function internalProfileName(profile: NameProfile): string {
  const real = realNameOf(profile);
  const nickname = nicknameOf(profile);
  if (real && nickname && nickname !== real) return `${real} · ${nickname}`;
  return real || nickname || '선수';
}

/** 내가 속한 팀 명단. 공개 스위치와 관계없이 실명, 없으면 닉네임을 보여 준다. */
export function teammateProfileName(profile: NameProfile): string {
  return realNameOf(profile) || nicknameOf(profile) || '선생님';
}

/**
 * 팀 목록 이름 태그. 빈 값·null·공백이어도 글자를 남긴다.
 * 내 팀이면 실명 또는 닉네임, 외부 팀이면 공개 설정에 따라 닉네임 또는 성 마스킹.
 */
export function teamListMemberName(
  profile: NameProfile,
  options?: { mine?: boolean; userId?: string | null },
): string {
  const real = realNameOf(profile);
  const nickname = nicknameOf(profile);
  const hasUser = visibleToken(options?.userId).length > 0;
  const openName = real || nickname || (hasUser ? '회원' : '선생님');
  if (options?.mine || profile?.is_name_public === true) return openName;
  if (nickname) return nickname;
  if (real) return maskRealName(real);
  return hasUser ? '회**' : '선생님';
}

/** 공개 랭킹·외부 팀 목록·타인 프로필. 실명 비공개면 닉네임, 없으면 성만 남긴다. */
export function publicProfileName(profile: NameProfile, options?: { self?: boolean }): string {
  const real = realNameOf(profile);
  const nickname = nicknameOf(profile);
  if (options?.self || profile?.is_name_public === true) {
    return real || nickname || '선수';
  }
  if (nickname) return nickname;
  if (!real) return '선생님';
  return maskRealName(real);
}
