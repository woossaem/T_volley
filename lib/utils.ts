/** 유저/팀명 표시용 Universal Fallback. 빈 문자열·null·undefined를 반환하지 않는다. */

const BLANK_TOKENS = new Set(['', '-', 'null', 'undefined', 'nan', 'none', '(null)', '{}', '[]', '[object object]']);
const ZERO_WIDTH = /[\u200B-\u200D\uFEFF\u00A0]/g;

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

function emailLocal(row: Record<string, unknown> | null): string | null {
  const email = cleanText(row?.email);
  if (!email || !email.includes('@')) return null;
  const local = email.split('@')[0]?.trim();
  return local || null;
}

export const getSafeDisplayName = (player: any): string => {
  if (!player) return '게스트';
  const asString = cleanText(player);
  if (asString) return asString;

  const root = asRecord(player);
  if (!root) return '게스트';

  const nested = asRecord(root.profiles ?? root.profile ?? root.user ?? root.member ?? root.player);
  const meta = asRecord(root.user_metadata ?? root.raw_user_meta_data);
  const sources = [root, nested, meta];
  for (const src of sources) {
    const name = pickFirst(src, [
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
    ]);
    if (name) return name;
    const fromEmail = emailLocal(src);
    if (fromEmail) return fromEmail;
  }
  return '선수';
};

export const getSafeTeamName = (team: any): string => {
  if (!team) return '게스트 팀';
  const asString = cleanText(team);
  if (asString) return asString;

  const root = asRecord(team);
  if (!root) return '게스트 팀';

  const nested = asRecord(root.teams ?? root.team);
  const sources = [root, nested];
  for (const src of sources) {
    const teamName = pickFirst(src, [
      'name',
      'team_name',
      'host_team_name',
      'away_team_name',
      'title',
      'display_name',
      'displayName',
    ]);
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
