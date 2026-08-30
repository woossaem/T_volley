/**
 * 팀/유저 이름·지역·아이콘 해석 공통 유틸.
 *
 * 레거시 row는 `name`이 NULL이고 `team_name` 등 구버전 컬럼에만 값이 있을 수 있다.
 * 원본 객체를 덮어쓰지 않고, 후보 컬럼을 COALESCE 체이닝으로 읽는다.
 */

const TEAM_NAME_KEYS = [
  'team_name',
  'name',
  'title',
  'formatted',
  'label',
  'teamName',
  'team_title',
  'display_name',
  'displayName',
  'school_name',
] as const;

const USER_NAME_KEYS = [
  'display_name',
  'nickname',
  'full_name',
  'name',
  'username',
  'displayName',
  'fullName',
  'user_name',
  'real_name',
  'realName',
] as const;

const NEVER_NAME_KEYS = new Set([
  'id',
  'team_id',
  'user_id',
  'leader_id',
  'invited_by',
  'created_at',
  'updated_at',
  'deleted_at',
  'team_type',
  'type',
  'region',
  'status',
  'password',
  'pin_code',
  'invite_code',
  'push_token',
  'position',
  'gender',
  'avatar_icon',
  'avatar_url',
  'youtube_channel_url',
  'description',
  'email',
  'phone',
]);

const BLANK_TOKENS = new Set(['', '-', 'null', 'undefined', 'nan', 'none', '(null)', '{}', '[]', '[object object]']);
const ZERO_WIDTH = /[\u200B-\u200D\uFEFF\u00A0]/g;

const SIDO_PREFIX =
  /^(충남|충북|충청남도|충청북도|전남|전북|경남|경북|경기|경기도|강원|강원도|제주|제주도|서울|서울특별시|인천|인천광역시|대전|대전광역시|대구|대구광역시|광주|광주광역시|부산|부산광역시|울산|울산광역시|세종|세종특별자치시)\s*/;

export const TEAM_NAME_FALLBACK = '이름 없음';
export const USER_NAME_FALLBACK = '알 수 없음';
export const DEFAULT_REGION = '천안';
export const UNSET_REGION = '지역 미설정';

export const TEAM_ROW_SELECT = '*';
export const PROFILE_ROW_SELECT = '*';
export const TEAM_EMBED_SELECT = 'teams(*)';
export const PROFILE_EMBED_SELECT = 'profiles(*)';

function normalizeNameValue(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value !== 'string') return null;

  const cleaned = value.replace(ZERO_WIDTH, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned || BLANK_TOKENS.has(cleaned.toLowerCase())) return null;
  return cleaned;
}

function unwrapEmbedded(raw: unknown): unknown {
  let current = raw;
  let guard = 0;
  while (Array.isArray(current) && guard < 5) {
    current = current.length > 0 ? current[0] : null;
    guard += 1;
  }
  return current;
}

function tryParseJsonString(value: string): unknown | null {
  const looksLikeJson =
    (value.startsWith('{') && value.endsWith('}')) || (value.startsWith('[') && value.endsWith(']'));
  if (!looksLikeJson) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function resolveNameValue(raw: unknown, keys: readonly string[], depth = 0): string | null {
  if (raw === null || raw === undefined || depth > 4) return null;

  const target = unwrapEmbedded(raw);
  if (target === null || target === undefined) return null;

  const direct = normalizeNameValue(target);
  if (direct) {
    const parsed = tryParseJsonString(direct);
    if (parsed !== null && parsed !== target) {
      const fromJson = resolveNameValue(parsed, keys, depth + 1);
      if (fromJson) return fromJson;
    }
    return direct;
  }

  if (typeof target !== 'object') return null;

  const row = target as Record<string, unknown>;

  for (const key of keys) {
    if (!(key in row)) continue;
    const resolved = resolveNameValue(row[key], keys, depth + 1);
    if (resolved) return resolved;
  }

  for (const [key, value] of Object.entries(row)) {
    if (NEVER_NAME_KEYS.has(key)) continue;
    const lowerKey = key.toLowerCase();
    const looksLikeName =
      lowerKey.endsWith('name') || lowerKey.endsWith('title') || lowerKey.endsWith('nickname');
    if (!looksLikeName) continue;
    const resolved = resolveNameValue(value, keys, depth + 1);
    if (resolved) return resolved;
  }

  return null;
}

export function resolveTeamNameOrNull(raw: unknown): string | null {
  return resolveNameValue(raw, TEAM_NAME_KEYS);
}

/** 팀 row 전체 또는 이름 필드. 원본 객체를 변경하지 않는다. */
export function resolveTeamName(raw: unknown, fallback: string = TEAM_NAME_FALLBACK): string {
  return resolveTeamNameOrNull(raw) ?? fallback;
}

export function resolveUserNameOrNull(raw: unknown): string | null {
  return resolveNameValue(raw, USER_NAME_KEYS);
}

export function resolveUserName(
  raw: unknown,
  userMetadata?: unknown,
  fallback: string = USER_NAME_FALLBACK
): string {
  return resolveUserNameOrNull(raw) ?? resolveUserNameOrNull(userMetadata) ?? fallback;
}

export function extractRow<T = any>(raw: unknown): T | null {
  const target = unwrapEmbedded(raw);
  if (!target || typeof target !== 'object') return null;
  return target as T;
}

export function normalizeNameKey(raw: unknown): string {
  const resolved = typeof raw === 'object' && raw !== null ? resolveTeamNameOrNull(raw) : normalizeNameValue(raw);
  return resolved || '';
}

export function isSameName(a: unknown, b: unknown): boolean {
  const keyA = normalizeNameKey(a);
  return keyA.length > 0 && keyA === normalizeNameKey(b);
}

/**
 * 지역 표기 정규화. 원본 team.region 을 덮어쓰지 않고 표시/비교용 문자열만 반환한다.
 */
export function cleanRegionName(rawInput?: unknown, fallback: string = DEFAULT_REGION): string {
  const parsed =
    resolveTeamNameOrNull(rawInput) ||
    (typeof rawInput === 'string' ? normalizeNameValue(rawInput) : null) ||
    '';
  if (!parsed) return fallback;

  let clean = parsed.replace(SIDO_PREFIX, '');
  if (clean.length >= 2 && (clean.endsWith('시') || clean.endsWith('군'))) {
    clean = clean.slice(0, -1);
  }
  clean = clean.trim();
  return clean.length > 0 ? clean : parsed || fallback;
}

/**
 * school/학교 → 🏫, club/동호회 → 🛡️, NULL·판별 불가 → 🏐
 */
export function getTeamIcon(type?: string | null): string {
  const normalized = String(type ?? '').trim();
  if (!normalized) return '🏐';
  const lower = normalized.toLowerCase();
  if (lower === 'school' || normalized === '학교') return '🏫';
  if (lower === 'club' || normalized === '동호회') return '🛡️';
  return '🏐';
}

/**
 * 모달/State 에 넣을 팀 스냅샷. 원본 배열 원소를 참조·변이하지 않는다.
 */
/**
 * 팀 row의 모든 이름 별칭을 수집한다. 타입/상태 맵 키용.
 * 원본 객체는 변경하지 않는다.
 */
export function collectTeamNameAliases(team: unknown): string[] {
  const row = extractRow<Record<string, unknown>>(team);
  const aliases = new Set<string>();
  const resolved = resolveTeamNameOrNull(team);
  if (resolved) aliases.add(resolved);
  if (row) {
    for (const key of TEAM_NAME_KEYS) {
      const value = normalizeNameKey(row[key]);
      if (value) aliases.add(value);
    }
  }
  return Array.from(aliases);
}

export function resolveTeamType(raw?: unknown): string {
  if (raw == null) return '';
  if (typeof raw === 'string') return raw.trim();
  const row = extractRow<Record<string, unknown>>(raw);
  if (!row) return '';
  const type = row.team_type ?? row.type;
  return typeof type === 'string' ? type.trim() : '';
}
