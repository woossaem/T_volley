/** 유저/팀명 표시용 Universal Fallback. 빈 문자열·null·undefined를 반환하지 않는다. */

const BLANK_TOKENS = new Set(['', '-', 'null', 'undefined', 'nan', 'none', '(null)', '{}', '[]', '[object object]']);
const ZERO_WIDTH = /[\u200B-\u200D\uFEFF\u00A0]/g;

const USER_NAME_KEYS = [
  'nickname',
  'full_name',
  'fullName',
  'user_name',
  'username',
  'name',
  'player_name',
  'display_name',
  'displayName',
  'real_name',
  'realName',
];

const TEAM_NAME_KEYS = [
  'name',
  'team_name',
  'host_team_name',
  'away_team_name',
  'title',
  'display_name',
  'displayName',
];

function cleanText(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(ZERO_WIDTH, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned || BLANK_TOKENS.has(cleaned.toLowerCase())) return null;
  return cleaned;
}

function unwrap(raw: unknown): unknown {
  let current = raw;
  let guard = 0;
  while (Array.isArray(current) && current.length === 1 && guard < 5) {
    current = current[0];
    guard += 1;
  }
  return current;
}

function asRecord(raw: unknown): Record<string, unknown> | null {
  const target = unwrap(raw);
  if (!target || typeof target !== 'object') return null;
  return target as Record<string, unknown>;
}

function pickFirst(row: Record<string, unknown> | null, keys: string[]): string | null {
  if (!row) return null;
  for (const key of keys) {
    const found = cleanText(row[key]);
    if (found) return found;
  }
  return null;
}

function emailLocalFrom(row: Record<string, unknown> | null): string | null {
  const email = cleanText(row?.email);
  if (!email || !email.includes('@')) return null;
  const local = email.split('@')[0]?.trim();
  return local || null;
}

function collectRecords(raw: unknown, depth = 0, bag: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (depth > 4) return bag;
  const row = asRecord(raw);
  if (!row) return bag;
  if (bag.includes(row)) return bag;
  bag.push(row);
  [
    row.profiles,
    row.profile,
    row.user,
    row.member,
    row.player,
    row.user_metadata,
    row.raw_user_meta_data,
    row.teams,
    row.team,
    row.host_team,
    row.away_team,
  ].forEach((nested) => collectRecords(nested, depth + 1, bag));
  return bag;
}

export const getSafeDisplayName = (player: any): string => {
  if (!player) return '게스트';
  if (typeof player === 'string' && player.trim() !== '') return player.trim();
  const asString = cleanText(player);
  if (asString) return asString;

  const sources = collectRecords(player);
  if (sources.length === 0) return '게스트';

  for (const src of sources) {
    const name = pickFirst(src, USER_NAME_KEYS);
    if (name) return name;
  }

  for (const src of sources) {
    const fromEmail = emailLocalFrom(src);
    if (fromEmail) return fromEmail;
  }

  return '선수';
};

export const getSafeTeamName = (team: any): string => {
  if (!team) return '게스트 팀';
  if (typeof team === 'string' && team.trim() !== '') return team.trim();
  const asString = cleanText(team);
  if (asString) return asString;

  const sources = collectRecords(team);
  if (sources.length === 0) return '게스트 팀';

  for (const src of sources) {
    const teamName = pickFirst(src, TEAM_NAME_KEYS);
    if (teamName) return teamName;
  }
  return '동호회팀';
};

/** @deprecated getSafeDisplayName 을 사용하세요. 동일 동작. */
export function getPlayerDisplayName(player: unknown): string {
  return getSafeDisplayName(player);
}

/** @deprecated getSafeTeamName 을 사용하세요. 동일 동작. */
export function getTeamDisplayName(team: unknown): string {
  return getSafeTeamName(team);
}
