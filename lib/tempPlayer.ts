/** 미가입 선수 임시 식별자. 형식: temp_{position}_{token} */

export const TEMP_SLOT_PREFIX = 'temp_';

export type TempPositionKey = 'left' | 'right' | 'center' | 'setter' | 'libero';
export type LineSide = 'host' | 'away';

export const TEMP_POSITION_LABELS: Record<TempPositionKey, string> = {
  left: '레프트',
  right: '라이트',
  center: '센터',
  setter: '세터',
  libero: '리베로',
};

export const TEMP_POSITION_ABBREV: Record<TempPositionKey, string> = {
  left: 'L',
  right: 'R',
  center: 'C',
  setter: 'S',
  libero: 'Li',
};

const LABEL_TO_POSITION: Array<{ needle: string; key: TempPositionKey }> = [
  { needle: '리베로', key: 'libero' },
  { needle: '세터', key: 'setter' },
  { needle: '레프트', key: 'left' },
  { needle: '라이트', key: 'right' },
  { needle: '센터', key: 'center' },
  { needle: '앞차', key: 'left' },
  { needle: '백차', key: 'right' },
  { needle: '좌측', key: 'left' },
  { needle: '우측', key: 'right' },
  { needle: '중앙', key: 'center' },
  { needle: '전위', key: 'left' },
  { needle: '중위', key: 'center' },
  { needle: '후위', key: 'right' },
];

export function isTempSlotId(id?: string | null): boolean {
  if (!id) return false;
  return String(id).startsWith(TEMP_SLOT_PREFIX);
}

export function parseTempPositionKey(id?: string | null): TempPositionKey | null {
  if (!isTempSlotId(id)) return null;
  const rest = String(id).slice(TEMP_SLOT_PREFIX.length);
  const key = rest.split('_')[0] as TempPositionKey;
  if (key in TEMP_POSITION_LABELS) return key;
  return null;
}

export function positionKeyFromSlotLabel(label?: string | null): TempPositionKey {
  const text = String(label || '');
  for (const row of LABEL_TO_POSITION) {
    if (text.includes(row.needle)) return row.key;
  }
  return 'center';
}

export function positionKeyFromCourtIndex(
  index: number,
  frontCount = 3,
  middleCount = 3,
  _backCount = 3,
): TempPositionKey {
  if (index < frontCount) {
    if (frontCount === 1) return 'center';
    if (index === 0) return 'left';
    if (index === frontCount - 1) return 'right';
    return frontCount === 3 && index === 1 ? 'setter' : 'center';
  }
  if (index < frontCount + middleCount) {
    const midIdx = index - frontCount;
    if (middleCount === 1) return 'center';
    if (midIdx === 0) return 'left';
    if (midIdx === middleCount - 1) return 'right';
    return 'center';
  }
  const backIdx = index - frontCount - middleCount;
  if (backIdx <= 0) return 'left';
  if (backIdx === 1) return 'libero';
  return 'right';
}

export function makeTempSlotId(position: TempPositionKey, token?: string): string {
  const suffix = token || `${Date.now().toString(36)}${Math.floor(Math.random() * 36).toString(36)}`;
  return `${TEMP_SLOT_PREFIX}${position}_${suffix}`;
}

/** 세트·사이드·슬롯 기준 고정 토큰. 렌더마다 바뀌지 않게 한다. */
export function makeDeterministicTempSlotId(
  position: TempPositionKey,
  side: LineSide,
  setIndex: number,
  slotIndex: number,
): string {
  const sideChar = side === 'host' ? 'h' : 'a';
  return makeTempSlotId(position, `${sideChar}${setIndex}s${slotIndex}`);
}

export function tempPositionLabel(id?: string | null, fallbackLabel?: string | null): string {
  const fromId = parseTempPositionKey(id);
  if (fromId) return TEMP_POSITION_LABELS[fromId];
  if (fallbackLabel) return fallbackLabel;
  return '무기명';
}

function looksLikeSystemPlayerCode(value?: string | null): boolean {
  const raw = String(value || '').trim();
  if (!raw) return true;
  const lower = raw.toLowerCase();
  return (
    isTempSlotId(raw)
    || raw.includes(TEMP_SLOT_PREFIX)
    || raw.includes('anon:')
    || lower === 'anonymous'
    || lower === 'anon'
  );
}

function stripAnonymousDecorators(value?: string | null): string {
  return String(value || '')
    .replace(/[\[\]]/g, '')
    .replace(/\(\s*무기명\s*\)/g, '')
    .replace(/무기명/g, '')
    .replace(/\s+/g, '')
    .trim();
}

function looksLikeAnonymousDisplay(value?: string | null): boolean {
  const raw = String(value || '').trim();
  if (!raw) return false;
  return raw === '무기명' || raw === '[무기명]' || raw.includes('무기명');
}

function soloPositionLabel(id?: string | null, fallbackLabel?: string | null): string {
  const cleaned = stripAnonymousDecorators(fallbackLabel);
  const fromId = parseTempPositionKey(id);
  let fromText: TempPositionKey | null = null;
  for (const row of LABEL_TO_POSITION) {
    if (cleaned.includes(row.needle)) {
      fromText = row.key;
      break;
    }
  }
  const key = fromId || fromText;
  const num = cleaned.match(/(\d+)/)?.[1];
  if (key) return num ? `${TEMP_POSITION_LABELS[key]}${num}` : TEMP_POSITION_LABELS[key];
  return cleaned;
}

/** 리포트/타임라인 표기: 레프트 / 레프트1 / 무기명 */
export function formatTempPlayerLabel(id?: string | null, fallbackLabel?: string | null): string {
  return soloPositionLabel(id, fallbackLabel) || '무기명';
}

export function formatPlayerDisplayName(
  playerId?: string | null,
  playerName?: string | null,
  fallbackLabel?: string | null,
): string {
  if (
    looksLikeSystemPlayerCode(playerId)
    || looksLikeSystemPlayerCode(playerName)
    || looksLikeAnonymousDisplay(playerName)
  ) {
    return formatTempPlayerLabel(playerId, fallbackLabel || playerName);
  }
  const name = String(playerName || '').trim();
  if (name && name !== '무기명') return name;
  if (!playerId) return formatTempPlayerLabel(playerId, fallbackLabel);
  return name || '무기명';
}

export function isPureAnonymousPlayer(playerId?: string | null, playerName?: string | null): boolean {
  const id = String(playerId ?? '').trim();
  if (!id || id.toLowerCase() === 'anonymous' || id.includes('anon:')) return true;
  if (isTempSlotId(id) && !parseTempPositionKey(id)) return true;
  const label = formatPlayerDisplayName(playerId, playerName);
  return label === '[무기명]' || label === '무기명';
}

export function isAwardEligiblePlayer(playerId?: string | null, playerName?: string | null): boolean {
  return !isPureAnonymousPlayer(playerId, playerName);
}

export function tempAbbrev(id?: string | null): string {
  const key = parseTempPositionKey(id);
  return key ? TEMP_POSITION_ABBREV[key] : '';
}
