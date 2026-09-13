import { assignedUserId, courtSlotLabelAt, DEFAULT_LINE_COUNT } from './roster';
import { getSafeDisplayName } from './utils';

/** 9인제 서브 순번: 라이트백 → 센터백 → 레프트백 → 앞차 → 센터 → 백차 → 라이트 → 세터 → 레프트 */
export const SERVE_ROTATION_LABELS = [
  '라이트백',
  '센터백',
  '레프트백',
  '앞차',
  '센터',
  '백차',
  '라이트',
  '세터',
  '레프트',
] as const;

export const DEFAULT_SERVE_START_LABEL = '라이트백';

export type ServeTeam = 'host' | 'away';

export type ServeSetup = {
  team: ServeTeam;
  startSlot: number;
  startLabel?: string;
};

export type ServeSetupMap = { [setIndex: number]: ServeSetup };

export type ServePossession = {
  team: ServeTeam;
  slotIndex: number;
  positionLabel: string;
  playerId: string | null;
  playerName: string;
};

type ScoreEventLike = {
  set_index?: number;
  set_number?: number;
  event_type?: string;
  is_canceled?: boolean;
  team_type?: string | null;
  host_score?: number;
  away_score?: number;
};

type CourtPlayerLike = {
  user_id?: string | null;
  full_name?: string | null;
};

function eventSetIndex(event: ScoreEventLike, fallback = 0): number {
  if (event?.set_index != null && event.set_index !== ('' as unknown)) {
    const n = Number(event.set_index);
    if (Number.isFinite(n)) return n;
  }
  const setNumber = Number(event?.set_number);
  if (Number.isFinite(setNumber) && setNumber > 0) return setNumber - 1;
  return fallback;
}

export function parseServeSetupMap(raw: unknown): ServeSetupMap {
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const next: ServeSetupMap = {};
  Object.entries(parsed as Record<string, unknown>).forEach(([key, value]) => {
    const idx = Number(key);
    if (!Number.isFinite(idx) || idx < 0 || !value || typeof value !== 'object') return;
    const rec = value as Record<string, unknown>;
    const team = rec.team === 'away' ? 'away' : rec.team === 'host' ? 'host' : null;
    if (!team) return;
    const startSlot = Number(rec.startSlot ?? rec.start_slot);
    next[idx] = {
      team,
      startSlot: Number.isFinite(startSlot) ? startSlot : defaultServeStartSlot(),
      startLabel: typeof rec.startLabel === 'string' ? rec.startLabel : undefined,
    };
  });
  return next;
}

export function shiftServeSetupMap(map: ServeSetupMap, removedIndex: number): ServeSetupMap {
  const next: ServeSetupMap = {};
  Object.keys(map || {}).forEach((key) => {
    const n = Number(key);
    if (!Number.isFinite(n) || n === removedIndex) return;
    next[n > removedIndex ? n - 1 : n] = map[n];
  });
  return next;
}

export function serveOrderIndices(
  frontCount = DEFAULT_LINE_COUNT,
  middleCount = DEFAULT_LINE_COUNT,
  backCount = DEFAULT_LINE_COUNT,
): number[] {
  const front = Number(frontCount) || DEFAULT_LINE_COUNT;
  const middle = Number(middleCount) || DEFAULT_LINE_COUNT;
  const back = Number(backCount) || DEFAULT_LINE_COUNT;
  const total = front + middle + back;
  const labels = Array.from({ length: total }, (_, i) => courtSlotLabelAt(i, front, middle, back));
  const byLabel = SERVE_ROTATION_LABELS
    .map((name) => labels.findIndex((label) => label === name))
    .filter((idx) => idx >= 0);
  if (byLabel.length > 0) return byLabel;
  const fallback: number[] = [];
  for (let i = front + middle + back - 1; i >= front + middle; i -= 1) fallback.push(i);
  for (let i = front; i < front + middle; i += 1) fallback.push(i);
  for (let i = front - 1; i >= 0; i -= 1) fallback.push(i);
  return fallback;
}

export function defaultServeStartSlot(
  frontCount = DEFAULT_LINE_COUNT,
  middleCount = DEFAULT_LINE_COUNT,
  backCount = DEFAULT_LINE_COUNT,
): number {
  const order = serveOrderIndices(frontCount, middleCount, backCount);
  const labels = order.map((idx) => courtSlotLabelAt(idx, frontCount, middleCount, backCount));
  const rightBack = labels.findIndex((label) => label === DEFAULT_SERVE_START_LABEL);
  if (rightBack >= 0) return order[rightBack];
  return order[0] ?? 8;
}

export function slotIndexForServeLabel(
  label: string,
  frontCount = DEFAULT_LINE_COUNT,
  middleCount = DEFAULT_LINE_COUNT,
  backCount = DEFAULT_LINE_COUNT,
): number {
  const order = serveOrderIndices(frontCount, middleCount, backCount);
  const found = order.find((idx) => courtSlotLabelAt(idx, frontCount, middleCount, backCount) === label);
  return found ?? defaultServeStartSlot(frontCount, middleCount, backCount);
}

function rotatedOrder(order: number[], startSlot: number): number[] {
  if (order.length === 0) return [];
  const at = order.indexOf(startSlot);
  const start = at >= 0 ? at : 0;
  return [...order.slice(start), ...order.slice(0, start)];
}

/** 슬롯 인덱스 → 해당 팀 독립 서브 순번(1~9). 첫 서브 포지션이 1번. */
export function serveRotationNumbersBySlot(input?: {
  startLabel?: string | null;
  startSlot?: number | null;
  frontCount?: number;
  middleCount?: number;
  backCount?: number;
}): Map<number, number> {
  const front = input?.frontCount ?? DEFAULT_LINE_COUNT;
  const middle = input?.middleCount ?? DEFAULT_LINE_COUNT;
  const back = input?.backCount ?? DEFAULT_LINE_COUNT;
  const order = serveOrderIndices(front, middle, back);
  const startSlot = input?.startSlot != null && order.includes(input.startSlot)
    ? input.startSlot
    : slotIndexForServeLabel(input?.startLabel || DEFAULT_SERVE_START_LABEL, front, middle, back);
  const rotation = rotatedOrder(order, startSlot);
  const map = new Map<number, number>();
  rotation.forEach((slot, i) => {
    map.set(slot, i + 1);
  });
  return map;
}

function scoringTeamOf(
  event: ScoreEventLike,
  prev: { host: number; away: number },
): ServeTeam | null {
  if (!event || event.is_canceled) return null;
  const type = String(event.event_type || '');
  if (type === 'sub') return null;
  if (type === 'score' || type === 'fault') {
    return event.team_type === 'away' ? 'away' : 'host';
  }
  if (type === 'manual') {
    const host = Number(event.host_score) || 0;
    const away = Number(event.away_score) || 0;
    const hostUp = host > prev.host;
    const awayUp = away > prev.away;
    if (hostUp && !awayUp) return 'host';
    if (awayUp && !hostUp) return 'away';
    if (hostUp && awayUp) {
      return (host - prev.host) >= (away - prev.away) ? 'host' : 'away';
    }
    return null;
  }
  return null;
}

export function resolveServePossession(input: {
  events: ScoreEventLike[];
  setIndex: number;
  setup?: ServeSetup | null;
  hostCourt?: Array<CourtPlayerLike | string | null | undefined>;
  awayCourt?: Array<CourtPlayerLike | string | null | undefined>;
  frontCount?: number;
  middleCount?: number;
  backCount?: number;
}): ServePossession | null {
  const setup = input.setup;
  if (!setup) return null;
  const front = input.frontCount ?? DEFAULT_LINE_COUNT;
  const middle = input.middleCount ?? DEFAULT_LINE_COUNT;
  const back = input.backCount ?? DEFAULT_LINE_COUNT;
  const order = serveOrderIndices(front, middle, back);
  if (order.length === 0) return null;
  const startSlot = order.includes(setup.startSlot)
    ? setup.startSlot
    : slotIndexForServeLabel(setup.startLabel || DEFAULT_SERVE_START_LABEL, front, middle, back);
  const rotation = rotatedOrder(order, startSlot);
  const steps = { host: 0, away: 0 };
  const hasServed = { host: setup.team === 'host', away: setup.team === 'away' };
  let serving: ServeTeam = setup.team;
  let prev = { host: 0, away: 0 };

  (input.events || []).forEach((event) => {
    if (!event || event.is_canceled) return;
    if (eventSetIndex(event, input.setIndex) !== input.setIndex) return;
    const scorer = scoringTeamOf(event, prev);
    prev = {
      host: Number(event.host_score) || prev.host,
      away: Number(event.away_score) || prev.away,
    };
    if (!scorer) return;
    if (scorer === serving) return;
    serving = scorer;
    if (hasServed[serving]) {
      steps[serving] += 1;
    } else {
      hasServed[serving] = true;
    }
  });

  const slotIndex = rotation[steps[serving] % rotation.length];
  const court = serving === 'host' ? input.hostCourt : input.awayCourt;
  const occupant = court?.[slotIndex];
  const playerId = typeof occupant === 'string' || occupant == null
    ? assignedUserId(occupant)
    : assignedUserId(occupant.user_id);
  const playerName = typeof occupant === 'string' || occupant == null
    ? ''
    : getSafeDisplayName(occupant);
  return {
    team: serving,
    slotIndex,
    positionLabel: courtSlotLabelAt(slotIndex, front, middle, back),
    playerId,
    playerName,
  };
}
