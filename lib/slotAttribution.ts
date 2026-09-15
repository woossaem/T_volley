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

export function normalizeTeamSide(value: unknown): TeamSide | null {
  const raw = String(value ?? '').trim().toLowerCase();
  if (raw === 'host' || raw === 'home' || raw === 'a') return 'host';
  if (raw === 'away' || raw === 'guest' || raw === 'b') return 'away';
  return null;
}

/** 그 랠리에서 점수를 가져간 팀 */
export function scoringTeamOf(event: SlotEventLike | null | undefined): TeamSide | null {
  return normalizeTeamSide(event?.team_type);
}

/** 범실을 낸 팀(득점 팀의 상대) */
export function concedingTeamOf(event: SlotEventLike | null | undefined): TeamSide | null {
  const scoring = scoringTeamOf(event);
  if (!scoring) return null;
  return scoring === 'host' ? 'away' : 'host';
}

/**
 * 슬롯 주인이 속한 팀.
 * 득점 → 득점 팀 라인업만, 범실 → 범실 팀 라인업만 본다. 상대 팀 슬롯을 절대 참조하지 않는다.
 */
export function slotOwnerTeam(event: SlotEventLike | null | undefined): TeamSide | null {
  if (!event) return null;
  if (event.event_type === 'fault') return concedingTeamOf(event);
  return scoringTeamOf(event);
}

/** @deprecated slotOwnerTeam 과 동일. 팀 미식별 시 null (host 로 기본하지 않음) */
export function courtTeamForEvent(event: SlotEventLike | null | undefined): TeamSide | null {
  return slotOwnerTeam(event);
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
    && normalizeTeamSide(event.team_type) === team
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

/**
 * 지정한 팀의 라인업·교체 이력 안에서만 슬롯 주인을 찾는다.
 * teamId 가 없으면 상대 팀 코트를 추측하지 않고 빈 결과를 반환한다.
 */
export function getPlayerAtSlot(args: {
  events: SlotEventLike[];
  teamId: TeamSide | null | undefined;
  positionSlot: number | null | undefined;
  atEventIndex: number;
  storedCourt: Array<string | null | undefined>;
  setIndex?: number;
}): { playerId: string | null; positionSlot: number | null } {
  const teamId = normalizeTeamSide(args.teamId);
  const slot = readPositionSlot({ position_slot: args.positionSlot });
  const idx = positionSlotToIndex(slot);
  if (!teamId || idx == null || idx < 0) {
    return { playerId: null, positionSlot: slot };
  }
  const atEvent = args.events[args.atEventIndex];
  const setIndex = args.setIndex ?? setIndexOfEvent(atEvent);
  const allSubs = subsForSetTeam(args.events, setIndex, teamId);
  const start = resolveStartingCourt(args.storedCourt, allSubs);
  const atTime = Date.parse(String(atEvent?.created_at || ''));
  const priorSubs = allSubs.filter((sub) => {
    const subIdx = args.events.findIndex((candidate) => (
      candidate === sub
      || (!!candidate?.id && !!sub.id && String(candidate.id) === String(sub.id))
    ));
    if (subIdx < 0 || subIdx >= args.atEventIndex) return false;
    const subTime = Date.parse(String(sub.created_at || ''));
    if (Number.isFinite(atTime) && Number.isFinite(subTime) && subTime > atTime) return false;
    return true;
  });
  const court = forwardApplySubs(start, priorSubs);
  while (court.length <= idx) court.push(null);
  return { playerId: court[idx] || null, positionSlot: slot };
}

export function occupantAtEvent(
  storedCourt: Array<string | null | undefined>,
  events: SlotEventLike[],
  eventIndex: number,
  event: SlotEventLike,
): { playerId: string | null; positionSlot: number | null } {
  const teamId = slotOwnerTeam(event);
  const slot = readPositionSlot(event);
  if (!teamId) {
    return { playerId: assignedUserId(event.player_id), positionSlot: slot };
  }
  const found = getPlayerAtSlot({
    events,
    teamId,
    positionSlot: slot,
    atEventIndex: eventIndex,
    storedCourt,
    setIndex: setIndexOfEvent(event),
  });
  if (!found.playerId) {
    return { playerId: assignedUserId(event.player_id), positionSlot: slot };
  }
  return found;
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

/** 같은 팀 라인업에서만 세트를 찾는다. 상대 팀 맵과 섞지 않는다. */
export function getCourtForSet(
  courtBySet: { [setIndex: number]: Array<string | null> },
  setIndex: number,
  roster?: unknown,
): Array<string | null> {
  const direct = courtBySet[setIndex];
  if (direct && direct.length > 0) return direct;
  if (roster != null) {
    const fromRoster = asCourtSlots(resolveFormationForSet(parseSetFormationMap(roster), setIndex).court);
    if (fromRoster.length > 0) return fromRoster;
  }
  for (let i = setIndex - 1; i >= 0; i -= 1) {
    if (courtBySet[i] && courtBySet[i].length > 0) return courtBySet[i];
  }
  return [];
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
    const teamId = slotOwnerTeam(event);
    const slot = readPositionSlot(event);
    if (!teamId || slot == null) return event;
    const setIndex = setIndexOfEvent(event);
    const stored = teamId === 'away'
      ? getCourtForSet(awayCourtBySet, setIndex)
      : getCourtForSet(hostCourtBySet, setIndex);
    if (!stored.length) return event;
    const found = getPlayerAtSlot({
      events: list,
      teamId,
      positionSlot: slot,
      atEventIndex: eventIndex,
      storedCourt: stored,
      setIndex,
    });
    if (!found.playerId) return event;
    const playerName = nameOf
      ? (nameOf(found.playerId, event.player_name) || displaySlotPlayerName(found.playerId, event.player_name))
      : displaySlotPlayerName(found.playerId, event.player_name);
    return {
      ...event,
      player_id: found.playerId,
      player_name: playerName,
      position_slot: found.positionSlot ?? event.position_slot,
    };
  });
}
