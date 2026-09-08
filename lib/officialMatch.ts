/** 공식 랭킹 집계 대상. is_official=true 이고 완료된 교류전만 포함한다. 게스트 팀 경기는 소급 연동 전까지 제외. */

export function isOfficialMatch(match?: {
  status?: string | null;
  is_official?: boolean | null;
  is_guest_match?: boolean | null;
} | null): boolean {
  if (!match) return false;
  if (match.is_guest_match === true) return false;
  if (match.is_official !== true) return false;
  if (match.status === 'friendly') return false;
  if (match.status === 'intramural') return false;
  return match.status === 'completed';
}

export function isUnofficialMatch(match?: {
  status?: string | null;
  is_official?: boolean | null;
  is_guest_match?: boolean | null;
} | null): boolean {
  if (!match) return false;
  if (match.is_guest_match === true) return true;
  if (match.is_official === false) return true;
  return match.status === 'friendly';
}

export function isIntramuralMatch(match?: { status?: string | null } | null): boolean {
  return match?.status === 'intramural';
}
