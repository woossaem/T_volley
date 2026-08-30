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
      if (cleaned && !isAnonymousSlotId(cleaned)) bucket.add(cleaned);
    });
  }
}

export function listHasUser(list: unknown, userId: string | null | undefined): boolean {
  if (!userId) return false;
  if (Array.isArray(list)) {
    return list.some((id) => String(id) === userId || safeIncludes(id, userId));
  }
  return safeIncludes(list, userId);
}

export function rosterHasUser(roster: unknown, userId: string | null | undefined): boolean {
  if (!userId) return false;
  return parseRosterUserIds(roster).includes(userId) || safeIncludes(roster, userId);
}

export const COURT_SLOT_COUNT = 9;
export const LINE_MIN = 1;
export const LINE_MAX = 5;
export const DEFAULT_LINE_COUNT = 3;
export const ANON_SLOT_PREFIX = 'anon:';
export const ANONYMOUS_PLAYER_NAME = '무기명';

export function isAnonymousSlotId(id?: string | null): boolean {
  if (!id) return true;
  return id.includes(ANON_SLOT_PREFIX) || id === 'anonymous';
}

export function isAnonymousPlayer(player?: { user_id?: string | null; full_name?: string | null } | null): boolean {
  if (!player) return true;
  if (isAnonymousSlotId(player.user_id)) return true;
  const name = (player.full_name || '').trim();
  return !name || name === ANONYMOUS_PLAYER_NAME;
}

export function makeAnonSlotId(index: number): string {
  return `${ANON_SLOT_PREFIX}${index}`;
}

export function clampLineCount(value: unknown, fallback = 3): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(LINE_MAX, Math.max(LINE_MIN, Math.round(n)));
}

export type CourtRow = 'front' | 'middle' | 'back';

const FRONT_LINE_LABELS = [
  ['전위'],
  ['전위 좌측', '전위 우측'],
  ['전위 좌측', '전위 중앙', '전위 우측'],
  ['전위 좌측', '전위 중앙', '전위 우측', '전위 라이트'],
  ['전위 좌측', '세컨레프트', '전위 중앙', '세컨라이트', '전위 우측'],
];

const MIDDLE_LINE_LABELS = [
  ['중위'],
  ['중위 좌측', '중위 우측'],
  ['중위 좌측', '중위 중앙', '중위 우측'],
  ['중위 좌측', '중위 중앙', '중위 우측', '중위 서브'],
  ['중위 좌측', '세컨중좌', '중위 중앙', '세컨중우', '중위 우측'],
];

const BACK_LINE_LABELS = [
  ['후위'],
  ['후위 좌측', '후위 우측'],
  ['후위 좌측', '후위 중앙', '후위 우측'],
  ['후위 좌측', '후위 중앙', '후위 우측', '후위 서브'],
  ['후위 좌측', '세컨백레프트', '후위 중앙', '세컨백라이트', '후위 우측'],
];

export function lineSlotLabels(row: CourtRow, count: number): string[] {
  const n = clampLineCount(count);
  if (row === 'middle') return MIDDLE_LINE_LABELS[n - 1];
  return (row === 'front' ? FRONT_LINE_LABELS : BACK_LINE_LABELS)[n - 1];
}

/** 코트 슬롯 순서: 전위 → 중위 → 후위, 각 라인 좌-중-우 */
export const COURT_SLOT_META = [
  { key: '4', label: '전위 좌측', short: 'FL', row: 'front' as const },
  { key: '3', label: '전위 중앙', short: 'FC', row: 'front' as const },
  { key: '2', label: '전위 우측', short: 'FR', row: 'front' as const },
  { key: 'mL', label: '중위 좌측', short: 'ML', row: 'middle' as const },
  { key: 'mC', label: '중위 중앙', short: 'MC', row: 'middle' as const },
  { key: 'mR', label: '중위 우측', short: 'MR', row: 'middle' as const },
  { key: '5', label: '후위 좌측', short: 'BL', row: 'back' as const },
  { key: '6', label: '후위 중앙', short: 'BC', row: 'back' as const },
  { key: '1', label: '후위 우측', short: 'BR', row: 'back' as const },
] as const;

export interface SetFormation {
  court: string[];
  bench: string[];
  late: string[];
  frontCount?: number;
  middleCount?: number;
  backCount?: number;
}

export function cloneFormation(src?: SetFormation | null): SetFormation {
  return {
    court: [...(src?.court || [])],
    bench: [...(src?.bench || [])],
    late: [...(src?.late || [])],
    frontCount: src?.frontCount,
    middleCount: src?.middleCount,
    backCount: src?.backCount,
  };
}

export function formationSlotTotal(formation?: SetFormation | null): number {
  const front = clampLineCount(formation?.frontCount, DEFAULT_LINE_COUNT);
  const middle = clampLineCount(formation?.middleCount, DEFAULT_LINE_COUNT);
  const back = clampLineCount(formation?.backCount, DEFAULT_LINE_COUNT);
  return front + middle + back;
}

/** 이전 세트의 최종 라인업을 다음 세트 기본값으로 이월 */
export function resolveFormationForSet(
  map: { [setIndex: number]: SetFormation },
  setIndex: number,
): SetFormation {
  if (map[setIndex]) return cloneFormation(map[setIndex]);
  for (let i = setIndex - 1; i >= 0; i -= 1) {
    if (map[i]) return cloneFormation(map[i]);
  }
  return { court: [], bench: [], late: [] };
}

export function seedNextSetFormation(
  map: { [setIndex: number]: SetFormation },
  fromIndex: number,
  force = false,
): { [setIndex: number]: SetFormation } {
  const src = map[fromIndex];
  if (!src) return map;
  const nextIndex = fromIndex + 1;
  const next: { [setIndex: number]: SetFormation } = { ...map };
  if (force || !next[nextIndex] || (next[nextIndex].court || []).length === 0) {
    next[nextIndex] = cloneFormation(src);
  }
  return next;
}

function asIdArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === 'string') {
    return value.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return parseRosterUserIds(value);
}

function formationFromValue(value: unknown): SetFormation {
  if (Array.isArray(value) || typeof value === 'string') {
    return { court: asIdArray(value), bench: [], late: [] };
  }
  if (value && typeof value === 'object') {
    const rec = value as Record<string, unknown>;
    if (Array.isArray(rec.court) || Array.isArray(rec.bench) || Array.isArray(rec.late) || rec.slots) {
      const fromSlots = rec.slots && typeof rec.slots === 'object'
        ? COURT_SLOT_META.map((slot) => String((rec.slots as Record<string, unknown>)[slot.key] || '')).filter(Boolean)
        : [];
      return {
        court: asIdArray(rec.court).length > 0 ? asIdArray(rec.court) : fromSlots,
        bench: asIdArray(rec.bench),
        late: asIdArray(rec.late),
        frontCount: clampLineCount(rec.frontCount, DEFAULT_LINE_COUNT),
        middleCount: clampLineCount(rec.middleCount, DEFAULT_LINE_COUNT),
        backCount: clampLineCount(rec.backCount, DEFAULT_LINE_COUNT),
      };
    }
    return { court: asIdArray(value), bench: [], late: [] };
  }
  return { court: [], bench: [], late: [] };
}

export function parseSetFormationMap(roster: unknown): { [setIndex: number]: SetFormation } {
  if (roster == null || roster === '') return {};
  const parsed = typeof roster === 'string'
    ? (() => {
        try { return JSON.parse(roster); } catch { return roster; }
      })()
    : roster;

  if (Array.isArray(parsed)) {
    return { 0: formationFromValue(parsed) };
  }
  if (parsed && typeof parsed === 'object') {
    const result: { [setIndex: number]: SetFormation } = {};
    Object.entries(parsed as Record<string, unknown>).forEach(([key, value]) => {
      const idx = Number(key);
      if (Number.isNaN(idx)) return;
      result[idx] = formationFromValue(value);
    });
    return result;
  }
  return {};
}

export function parseSetFormation(roster: unknown, setIndex: number): SetFormation {
  return resolveFormationForSet(parseSetFormationMap(roster), setIndex);
}

export function serializeSetFormationMap(map: { [setIndex: number]: SetFormation }): string {
  return JSON.stringify(map);
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
        result[idx] = value.map(String).filter((id) => id && !isAnonymousSlotId(id));
      } else if (typeof value === 'string') {
        result[idx] = value.split(',').map((s) => s.trim()).filter((id) => id && !isAnonymousSlotId(id));
      } else if (value && typeof value === 'object') {
        result[idx] = formationFromValue(value).court.filter((id) => id && !isAnonymousSlotId(id));
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
