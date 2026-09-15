import { assignedUserId, displaySlotPlayerName, parseSetFormationMap, resolveFormationForSet } from './roster';

export const POSITION_SLOT_MIN = 1;
export const POSITION_SLOT_MAX = 9;

type TeamSide = 'host' | 'away';

export type SlotEventLike = {
  id?: string;
  set_index?: number | null;
  set_number?: number | null;
  event_type?: string | null;
  team_type?: string | null;
  player_id?: string | null;
  player_name?: string | null;
  sub_out_id?: string | null;
  sub_out_name?: string | null;
  position_slot?: number | null;
  positionSlot?: number | null;
  host_score?: number | null;
  away_score?: number | null;
  is_canceled?: boolean | null;
  created_at?: string | null;
};

export function toPositionSlot(index0: number | null | undefined): number | null {
  if (index0 == null || !Number.isFinite(Number(index0))) return null;
  const slot = Math.floor(Number(index0)) + 1;
  return slot >= POSITION_SLOT_MIN ? slot : null;
}

export function positionSlotToIndex(slot: number | null | undefined): number | null {
  if (slot == null || !Number.isFinite(Number(slot))) return null;
  const n = Math.floor(Number(slot));
  return n >= POSITION_SLOT_MIN ? n - 1 : null;
}

export function readPositionSlot(event: SlotEventLike | null | undefined): number | null {
  if (!event) return null;
  const raw = event.position_slot ?? event.positionSlot;
  if (raw == null || !Number.isFinite(Number(raw))) return null;
  const n = Math.floor(Number(raw));
  return n >= POSITION_SLOT_MIN ? n : null;
}

export function setIndexOfEvent(event: SlotEventLike | null | undefined): number {
  if (!event) return 0;
  if (event.set_index != null && event.set_index !== ('' as any)) {
    const idx = Number(event.set_index);
    if (Number.isFinite(idx)) return idx;
  }
  const numbered = Number(event.set_number);
  if (Number.isFinite(numbered) && numbered >= 1) return numbered - 1;
  return 0;
}

/** 득점=득점 팀 코트, 범실=범실을 낸 상대 팀 코트 */
export function courtTeamForEvent(event: SlotEventLike | null | undefined): TeamSide {
  if (event?.event_type === 'fault') return event.team_type === 'host' ? 'away' : 'host';
  return event?.team_type === 'away' ? 'away' : 'host';
}

export function asCourtSlots(ids: Array<string | null | undefined> | null | undefined): Array<string | null> {
  return (ids || []).map((id) => assignedUserId(id));
}

function courtsEqual(a: Array<string | null>, b: Array<string | null>): boolean {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    if ((a[i] || null) !== (b[i] || null)) return false;
  }
  return true;
}

export function findSlotIndexForPlayer(court: Array<string | null>, playerId?: string | null): number | null {
  const real = assignedUserId(playerId);
  if (!real) return null;
  const idx = court.findIndex((id) => assignedUserId(id) === real);
  return idx >= 0 ? idx : null;
}

function slotIndexOfSub(court: Array<string | null>, sub: SlotEventLike): number | null {
  const fromSlot = positionSlotToIndex(readPositionSlot(sub));
  if (fromSlot != null && fromSlot >= 0) return fromSlot;
  const inIdx = findSlotIndexForPlayer(court, sub.player_id);
  if (inIdx != null) return inIdx;
  return findSlotIndexForPlayer(court, sub.sub_out_id);
}

export function applySubToCourt(court: Array<string | null>, sub: SlotEventLike): Array<string | null> {
  const next = court.slice();
  const idx = slotIndexOfSub(next, sub);
  if (idx == null || idx < 0) return next;
  while (next.length <= idx) next.push(null);
  next[idx] = assignedUserId(sub.player_id);
  return next;
}

export function reverseSubOnCourt(court: Array<string | null>, sub: SlotEventLike): Array<string | null> {
  const next = court.slice();
  const idx = slotIndexOfSub(next, sub);
  if (idx == null || idx < 0) return next;
  while (next.length <= idx) next.push(null);
  next[idx] = assignedUserId(sub.sub_out_id);
  return next;
}

export function isSubEvent(event: SlotEventLike | null | undefined): boolean {
  return !!event && event.event_type === 'sub' && !event.is_canceled;
}

export function subsForSetTeam(events: SlotEventLike[], setIndex: number, team: TeamSide): SlotEventLike[] {
  return (events || []).filter((event) => (
    isSubEvent(event)
    && setIndexOfEvent(event) === setIndex
    && event.team_type === team
  ));
}

export function forwardApplySubs(start: Array<string | null>, subs: SlotEventLike[]): Array<string | null> {
  return (subs || []).reduce((court, sub) => applySubToCourt(court, sub), asCourtSlots(start));
}

export function reverseApplySubs(finalCourt: Array<string | null>, subs: SlotEventLike[]): Array<string | null> {
  let court = asCourtSlots(finalCourt);
  for (let i = (subs || []).length - 1; i >= 0; i -= 1) {
    court = reverseSubOnCourt(court, subs[i]);
  }
  return court;
}

/**
 * 저장된 코트는 예전엔 '현재(최종)' 라인업이었다.
 * 교체를 역으로 적용한 뒤 다시 앞으로 돌려 최종과 같으면 저장된 값은 최종,
 * 아니면 이미 시작 라인업으로 본다.
 */
export function resolveStartingCourt(storedCourt: Array<string | null | undefined>, subs: SlotEventLike[]): Array<string | null> {
  const stored = asCourtSlots(storedCourt);
  if (!subs.length) return stored;
  const reversed = reverseApplySubs(stored, subs);
  const forwarded = forwardApplySubs(reversed, subs);
  if (courtsEqual(forwarded, stored)) return reversed;
  return stored;
}

export function currentCourtFromHistory(
  storedCourt: Array<string | null | undefined>,
  events: SlotEventLike[],
  setIndex: number,
  team: TeamSide,
): Array<string | null> {
  const subs = subsForSetTeam(events, setIndex, team);
  const start = resolveStartingCourt(storedCourt, subs);
  return forwardApplySubs(start, subs);
}

export function occupantAtEvent(
  storedCourt: Array<string | null | undefined>,
  events: SlotEventLike[],
  eventIndex: number,
  event: SlotEventLike,
): { playerId: string | null; positionSlot: number | null } {
  const setIndex = setIndexOfEvent(event);
  const team = courtTeamForEvent(event);
  const allSubs = subsForSetTeam(events, setIndex, team);
  const start = resolveStartingCourt(storedCourt, allSubs);
  const priorSubs = allSubs.filter((sub) => {
    const subIdx = events.indexOf(sub);
    if (subIdx < 0) return false;
    return subIdx < eventIndex;
  });
  const court = forwardApplySubs(start, priorSubs);
  const slot = readPositionSlot(event);
  const idx = positionSlotToIndex(slot);
  if (idx != null && idx >= 0) {
    while (court.length <= idx) court.push(null);
    return { playerId: court[idx] || null, positionSlot: slot };
  }
  return { playerId: assignedUserId(event.player_id), positionSlot: slot };
}

export function courtsBySetFromRoster(roster: unknown): { [setIndex: number]: Array<string | null> } {
  const map = parseSetFormationMap(roster);
  const out: { [setIndex: number]: Array<string | null> } = {};
  Object.keys(map).forEach((key) => {
    const idx = Number(key);
    if (!Number.isFinite(idx)) return;
    out[idx] = asCourtSlots(resolveFormationForSet(map, idx).court);
  });
  return out;
}

export function attributeTimelineEvents<T extends SlotEventLike>(
  events: T[],
  hostCourtBySet: { [setIndex: number]: Array<string | null> },
  awayCourtBySet: { [setIndex: number]: Array<string | null> },
  nameOf?: (id: string | null | undefined, fallback?: string | null) => string | null,
): T[] {
  const list = events || [];
  return list.map((event, eventIndex) => {
    if (event.is_canceled) return event;
    if (event.event_type !== 'score' && event.event_type !== 'fault') return event;
    const setIndex = setIndexOfEvent(event);
    const team = courtTeamForEvent(event);
    const stored = team === 'away' ? (awayCourtBySet[setIndex] || []) : (hostCourtBySet[setIndex] || []);
    const slot = readPositionSlot(event);
    if (slot == null) return event;
    const found = occupantAtEvent(stored, list, eventIndex, event);
    const playerId = found.playerId;
    const playerName = nameOf
      ? (nameOf(playerId, event.player_name) || displaySlotPlayerName(playerId, event.player_name))
      : displaySlotPlayerName(playerId, event.player_name);
    return {
      ...event,
      player_id: playerId,
      player_name: playerName,
      position_slot: found.positionSlot ?? event.position_slot,
    };
  });
}
