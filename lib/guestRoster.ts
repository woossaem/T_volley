import { collectTempIdsFromValue } from './retroactiveBinding';
import { courtSlotLabelAt, DEFAULT_LINE_COUNT } from './roster';
import { formatTempPlayerLabel, isTempSlotId } from './tempPlayer';

export type GuestAppearance = {
  setNumber: number;
  side: 'host' | 'away';
  label: string;
};

export type GuestCard = {
  tempId: string;
  side: 'host' | 'away';
  name: string;
  points: number;
  appearances: GuestAppearance[];
  summary: string;
};

function lineupArray(value: unknown): Array<string | null> {
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (item == null || item === '') return null;
      if (typeof item === 'string') return item;
      return String((item as any)?.player_id ?? (item as any)?.user_id ?? '') || null;
    });
  }
  if (value && typeof value === 'object' && Array.isArray((value as any).court)) {
    return lineupArray((value as any).court);
  }
  return [];
}

function addAppearance(
  map: Map<string, GuestAppearance[]>,
  tempId: string,
  setNumber: number,
  side: 'host' | 'away',
  slotIndex: number,
) {
  if (!isTempSlotId(tempId)) return;
  const label = courtSlotLabelAt(slotIndex, DEFAULT_LINE_COUNT, DEFAULT_LINE_COUNT, DEFAULT_LINE_COUNT);
  const rows = map.get(tempId) || [];
  if (!rows.some((r) => r.setNumber === setNumber && r.side === side && r.label === label)) {
    rows.push({ setNumber, side, label });
  }
  map.set(tempId, rows);
}

function walkLineup(
  lineup: unknown,
  side: 'host' | 'away',
  setNumber: number,
  map: Map<string, GuestAppearance[]>,
) {
  lineupArray(lineup).forEach((id, slotIndex) => {
    if (id) addAppearance(map, id, setNumber, side, slotIndex);
  });
}

function walkRosterMap(roster: unknown, side: 'host' | 'away', map: Map<string, GuestAppearance[]>) {
  if (!roster) return;
  const parsed = typeof roster === 'string'
    ? (() => { try { return JSON.parse(roster); } catch { return roster; } })()
    : roster;
  if (Array.isArray(parsed)) {
    walkLineup(parsed, side, 1, map);
    return;
  }
  if (parsed && typeof parsed === 'object') {
    Object.entries(parsed as Record<string, unknown>).forEach(([key, value]) => {
      const idx = Number(key);
      const setNumber = Number.isFinite(idx) ? idx + 1 : 1;
      walkLineup(value, side, setNumber, map);
    });
  }
}

function countGuestPoints(logs: unknown, tempId: string): number {
  if (!Array.isArray(logs)) return 0;
  return logs.reduce((sum, raw) => {
    if (!raw || typeof raw !== 'object') return sum;
    const log = raw as Record<string, unknown>;
    if (log.is_canceled) return sum;
    const pid = String(log.player_id ?? log.playerId ?? '');
    if (pid !== tempId) return sum;
    const type = String(log.event_type ?? log.eventType ?? '');
    if (type === 'score' || type === 'kill') return sum + 1;
    return sum;
  }, 0);
}

export function buildGuestCards(input: {
  sets?: Array<{ set_number?: number; host_lineup?: unknown; away_lineup?: unknown }> | null;
  hostRoster?: unknown;
  awayRoster?: unknown;
  scoreLogs?: unknown;
}): GuestCard[] {
  const appearances = new Map<string, GuestAppearance[]>();
  (input.sets || []).forEach((row) => {
    const setNumber = Number(row.set_number) || 1;
    walkLineup(row.host_lineup, 'host', setNumber, appearances);
    walkLineup(row.away_lineup, 'away', setNumber, appearances);
  });
  walkRosterMap(input.hostRoster, 'host', appearances);
  walkRosterMap(input.awayRoster, 'away', appearances);

  const extra = new Set<string>();
  collectTempIdsFromValue(input.hostRoster, extra);
  collectTempIdsFromValue(input.awayRoster, extra);
  collectTempIdsFromValue(input.scoreLogs, extra);
  extra.forEach((id) => {
    if (!appearances.has(id)) appearances.set(id, []);
  });

  const cards: GuestCard[] = [];
  appearances.forEach((rows, tempId) => {
    const sorted = [...rows].sort((a, b) => a.setNumber - b.setNumber || a.label.localeCompare(b.label, 'ko'));
    const side = sorted.find((r) => r.side === 'host') ? 'host' : (sorted[0]?.side || (tempId.includes('_a') ? 'away' : 'host'));
    const points = countGuestPoints(input.scoreLogs, tempId);
    const name = formatTempPlayerLabel(tempId);
    const posLine = sorted.length > 0
      ? sorted.map((r) => `${r.setNumber}세트 ${r.label}`).join(', ')
      : '출전 기록 없음';
    cards.push({
      tempId,
      side,
      name,
      points,
      appearances: sorted,
      summary: `총 ${points}득점 / ${posLine}`,
    });
  });

  return cards.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}
