/** 공식 랭킹 집계 대상. is_official=false 또는 레거시 friendly 는 제외한다. */

export function isOfficialMatch(match?: { status?: string | null; is_official?: boolean | null } | null): boolean {
  if (!match) return false;
  if (match.is_official === false) return false;
  if (match.status === 'friendly') return false;
  if (match.status === 'intramural') return false;
  return match.status === 'completed';
}

export function isUnofficialMatch(match?: { status?: string | null; is_official?: boolean | null } | null): boolean {
  if (!match) return false;
  if (match.is_official === false) return true;
  return match.status === 'friendly';
}
