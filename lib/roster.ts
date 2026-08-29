/** host_roster / away_roster 가 문자열·JSON 객체·배열 어느 형태여도 TypeError 없이 다루기 위한 가드 */

export type SetRosterMap = { [setIndex: number]: string[] };

export function rosterToSearchableText(roster: unknown): string {
  if (roster == null || roster === '') return '';
  if (typeof roster === 'string') return roster;
  try {
    return JSON.stringify(roster);
  } catch {
    return String(roster);
  }
}

export function safeIncludes(roster: unknown, userId: string | null | undefined): boolean {
  if (!userId) return false;
  const haystack = rosterToSearchableText(roster);
  if (!haystack) return false;
  return haystack.includes(userId);
}

function collectIds(value: unknown, bucket: Set<string>) {
  if (value == null || value === '') return;
  if (Array.isArray(value)) {
    value.forEach((item) => collectIds(item, bucket));
    return;
  }
  if (typeof value === 'object') {
    Object.values(value as Record<string, unknown>).forEach((item) => collectIds(item, bucket));
    return;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))
    ) {
      try {
        collectIds(JSON.parse(trimmed), bucket);
        return;
      } catch {
        // fall through to comma split
      }
    }
    trimmed.split(',').forEach((id) => {
      const cleaned = id.trim();
      if (cleaned) bucket.add(cleaned);
    });
  }
}

export function parseRosterUserIds(roster: unknown): string[] {
  const ids = new Set<string>();
  collectIds(roster, ids);
  return Array.from(ids);
}

export function parseSetRosterMap(roster: unknown): SetRosterMap {
  if (roster == null || roster === '') return {};

  const fromObject = (obj: Record<string, unknown>): SetRosterMap => {
    const result: SetRosterMap = {};
    Object.entries(obj).forEach(([key, value]) => {
      const idx = Number(key);
      if (Number.isNaN(idx)) return;
      if (Array.isArray(value)) {
        result[idx] = value.map(String).filter(Boolean);
      } else if (typeof value === 'string') {
        result[idx] = value.split(',').map((s) => s.trim()).filter(Boolean);
      }
    });
    return result;
  };

  if (Array.isArray(roster)) {
    const ids = roster.map(String).filter(Boolean);
    return ids.length > 0 ? { 0: ids } : {};
  }

  if (typeof roster === 'object') {
    return fromObject(roster as Record<string, unknown>);
  }

  if (typeof roster === 'string') {
    const trimmed = roster.trim();
    if (!trimmed) return {};
    try {
      return parseSetRosterMap(JSON.parse(trimmed));
    } catch {
      const arr = trimmed.split(',').map((s) => s.trim()).filter(Boolean);
      return arr.length > 0 ? { 0: arr } : {};
    }
  }

  try {
    return parseSetRosterMap(JSON.stringify(roster));
  } catch {
    return {};
  }
}
