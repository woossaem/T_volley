export type TeamLifecycleStatus = 'active' | 'dormant' | 'deleted';

export function formatTeamDisplayName(
  rawName: string | null | undefined,
  status?: string | null
): string {
  const name = (rawName || '').trim();

  if (status === 'deleted') {
    return '(삭제된 팀)';
  }

  if (status === 'dormant') {
    const cleaned = name.replace(/^\((휴면|해체)\)\s*/, '');
    if (!cleaned) return '(휴면)';
    if (cleaned.startsWith('(휴면)')) return cleaned;
    return `(휴면) ${cleaned}`;
  }

  return name;
}

export function isActiveTeamStatus(status?: string | null): boolean {
  return !status || status === 'active';
}

/** 레거시 멤버십은 is_active 가 NULL. false 만 승인 대기로 본다. */
export function isActiveMembership(isActive?: boolean | null): boolean {
  return isActive !== false;
}

export function buildTeamStatusByName(
  teams: { name?: string | null; status?: string | null }[]
): Record<string, string> {
  const map: Record<string, string> = {};
  teams.forEach((t) => {
    const name = (t.name || '').trim();
    if (name) map[name] = t.status || 'active';
  });
  return map;
}
