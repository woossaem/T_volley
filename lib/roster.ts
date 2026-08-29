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

export function safeIncludes(haystack: unknown, needle: string | null | undefined): boolean {
  if (!needle) return false;
  const text = rosterToSearchableText(haystack);
  if (!text) return false;
  return text.includes(needle);
}

/** team_name 이 문자열·JSON 객체·배열이어도 표시/비교용 문자열로 정규화 */
export function safeNameText(value: unknown): string {
  if (value == null || value === '') return '';
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed || trimmed === 'null' || trimmed === 'undefined') return '';
    if (
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))
    ) {
      try {
        return safeNameText(JSON.parse(trimmed));
      } catch {
        return trimmed;
      }
    }
    return trimmed;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const parsed = safeNameText(item);
      if (parsed) return parsed;
    }
    return '';
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    for (const key of ['name', 'team_name', 'formatted', 'title', 'label']) {
      const parsed = safeNameText(obj[key]);
      if (parsed) return parsed;
    }
  }
  return '';
}

export function teamsInclude(teams: unknown, name: unknown): boolean {
  const n = safeNameText(name);
  if (!n) return false;
  if (Array.isArray(teams)) {
    return teams.some((t) => {
      const tn = safeNameText(t);
      return tn === n || safeIncludes(t, n) || safeIncludes(name, tn);
    });
  }
  return safeIncludes(teams, n);
}

export function nameIncludesQuery(name: unknown, query: string | null | undefined): boolean {
  if (!query) return false;
  const haystack = safeNameText(name).toLowerCase();
  if (!haystack) return false;
  return haystack.includes(query.toLowerCase());
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
