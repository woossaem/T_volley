import { courtSlotLabelAt, DEFAULT_LINE_COUNT } from './roster';
import { toPositionSlot } from './slotAttribution';

export type VoiceTeamId = 'host' | 'away';

export type VoiceStatType = 'dig' | 'block' | 'ace' | 'receive' | 'assist';

export type VoiceActionKind =
  | 'SCORE'
  | 'FAULT'
  | 'STAT'
  | 'SUB'
  | 'COURT_FLIP'
  | 'SET_CLOSE'
  | 'MATCH_END'
  | 'UNDO';

/** 스코어보드 9인 코트에 저장하는 정식 포지션 코드 */
export type CanonicalPosition =
  | '레프트'
  | '세터'
  | '라이트'
  | '앞차'
  | '센터'
  | '백차'
  | '레프트백'
  | '센터백'
  | '라이트백';

export const CANONICAL_POSITION_SLOT: Record<CanonicalPosition, number> = {
  레프트: 1,
  세터: 2,
  라이트: 3,
  앞차: 4,
  센터: 5,
  백차: 6,
  레프트백: 7,
  센터백: 8,
  라이트백: 9,
};

export const VOICE_STAT_LABEL: Record<VoiceStatType, string> = {
  dig: '디그',
  block: '블록',
  ace: '서브에이스',
  receive: '리시브',
  assist: '토스',
};

const STAT_EVENT_TYPES: Record<string, VoiceStatType> = {
  dig: 'dig',
  block: 'block',
  ace: 'ace',
  receive: 'receive',
  assist: 'assist',
};

export function voiceStatTypeOf(eventType?: string | null): VoiceStatType | null {
  const key = String(eventType || '').toLowerCase();
  return STAT_EVENT_TYPES[key] || null;
}

export function voiceStatLabelOf(eventType?: string | null): string | null {
  const stat = voiceStatTypeOf(eventType);
  return stat ? VOICE_STAT_LABEL[stat] : null;
}

export type VoiceCommand = {
  ok: true;
  kind: VoiceActionKind;
  teamId: VoiceTeamId | null;
  actionType: 'SCORE' | 'FAULT' | null;
  statType: VoiceStatType | null;
  positionSlot: number | null;
  positionCode: CanonicalPosition | null;
  playerName: string | null;
  spokenTeam: string;
  spokenPosition: string;
  spokenAction: string;
};

export type VoiceParseFailure = {
  ok: false;
  error: 'EMPTY' | 'NO_TEAM' | 'NO_ACTION' | 'NO_POSITION' | 'NO_PLAYER' | 'AMBIGUOUS';
  message: string;
};

export type VoiceParseResult = VoiceCommand | VoiceParseFailure;

type CourtLayout = {
  frontCount?: number;
  middleCount?: number;
  backCount?: number;
};

type Keyword = {
  needle: string;
  kind: 'team' | 'position' | 'action' | 'filler';
  teamId?: VoiceTeamId;
  spokenTeam?: string;
  position?: CanonicalPosition;
  action?: VoiceActionKind;
  statType?: VoiceStatType;
  spokenAction?: string;
};

const ACTION_PRIORITY: VoiceActionKind[] = [
  'UNDO',
  'MATCH_END',
  'SET_CLOSE',
  'COURT_FLIP',
  'SUB',
  'STAT',
  'FAULT',
  'SCORE',
];

/**
 * 긴 표현을 먼저 둔다. 센터백이 센터보다 먼저 소비되고, 뒷차는 포지션으로 받지 않는다.
 * 약어는 모두 정식 포지션 코드로만 남긴다.
 */
const GLOSSARY: Keyword[] = [
  { needle: '에이팀', kind: 'team', teamId: 'host', spokenTeam: 'A팀' },
  { needle: 'a팀', kind: 'team', teamId: 'host', spokenTeam: 'A팀' },
  { needle: '홈팀', kind: 'team', teamId: 'host', spokenTeam: 'A팀' },
  { needle: '우리팀', kind: 'team', teamId: 'host', spokenTeam: 'A팀' },
  { needle: '어웨이팀', kind: 'team', teamId: 'away', spokenTeam: 'B팀' },
  { needle: '상대팀', kind: 'team', teamId: 'away', spokenTeam: 'B팀' },
  { needle: '비팀', kind: 'team', teamId: 'away', spokenTeam: 'B팀' },
  { needle: 'b팀', kind: 'team', teamId: 'away', spokenTeam: 'B팀' },

  { needle: '레프트백', kind: 'position', position: '레프트백' },
  { needle: '레백', kind: 'position', position: '레프트백' },
  { needle: '라이트백', kind: 'position', position: '라이트백' },
  { needle: '라백', kind: 'position', position: '라이트백' },
  { needle: '센터백', kind: 'position', position: '센터백' },
  { needle: '센백', kind: 'position', position: '센터백' },
  { needle: '세컨레프트', kind: 'position', position: '레프트' },
  { needle: '세컨라이트', kind: 'position', position: '라이트' },
  { needle: '전위좌측', kind: 'position', position: '레프트' },
  { needle: '전위우측', kind: 'position', position: '라이트' },
  { needle: '중위좌측', kind: 'position', position: '앞차' },
  { needle: '중위우측', kind: 'position', position: '백차' },
  { needle: '후위좌측', kind: 'position', position: '레프트백' },
  { needle: '후위우측', kind: 'position', position: '라이트백' },
  { needle: '앞차', kind: 'position', position: '앞차' },
  { needle: '백차', kind: 'position', position: '백차' },
  { needle: '세터', kind: 'position', position: '세터' },
  { needle: '레프트', kind: 'position', position: '레프트' },
  { needle: '라이트', kind: 'position', position: '라이트' },
  { needle: '리베로', kind: 'position', position: '센터백' },
  { needle: '센터', kind: 'position', position: '센터' },
  { needle: '전위', kind: 'position', position: '세터' },
  { needle: '중위', kind: 'position', position: '센터' },
  { needle: '후위', kind: 'position', position: '센터백' },
  { needle: '좌측', kind: 'position', position: '레프트' },
  { needle: '우측', kind: 'position', position: '라이트' },
  { needle: '중앙', kind: 'position', position: '센터' },

  { needle: '서브에이스', kind: 'action', action: 'STAT', statType: 'ace', spokenAction: '서브에이스' },
  { needle: '에이스', kind: 'action', action: 'STAT', statType: 'ace', spokenAction: '서브에이스' },
  { needle: '서브범실', kind: 'action', action: 'FAULT', spokenAction: '범실' },
  { needle: '네트터치', kind: 'action', action: 'FAULT', spokenAction: '범실' },
  { needle: '선수교체', kind: 'action', action: 'SUB', spokenAction: '선수교체' },
  { needle: '코트반전', kind: 'action', action: 'COURT_FLIP', spokenAction: '코트 반전' },
  { needle: '좌우반전', kind: 'action', action: 'COURT_FLIP', spokenAction: '코트 반전' },
  { needle: '세트마감', kind: 'action', action: 'SET_CLOSE', spokenAction: '세트 마감' },
  { needle: '세트종료', kind: 'action', action: 'SET_CLOSE', spokenAction: '세트 마감' },
  { needle: '경기종료', kind: 'action', action: 'MATCH_END', spokenAction: '경기 종료' },
  { needle: '경기마감', kind: 'action', action: 'MATCH_END', spokenAction: '경기 종료' },
  { needle: '어시스트', kind: 'action', action: 'STAT', statType: 'assist', spokenAction: '토스' },
  { needle: '블로킹', kind: 'action', action: 'STAT', statType: 'block', spokenAction: '블록' },
  { needle: '리시브', kind: 'action', action: 'STAT', statType: 'receive', spokenAction: '리시브' },
  { needle: '디그', kind: 'action', action: 'STAT', statType: 'dig', spokenAction: '디그' },
  { needle: '블록', kind: 'action', action: 'STAT', statType: 'block', spokenAction: '블록' },
  { needle: '블락', kind: 'action', action: 'STAT', statType: 'block', spokenAction: '블록' },
  { needle: '토스', kind: 'action', action: 'STAT', statType: 'assist', spokenAction: '토스' },
  { needle: '득점', kind: 'action', action: 'SCORE', spokenAction: '득점' },
  { needle: '점수', kind: 'action', action: 'SCORE', spokenAction: '득점' },
  { needle: '넣었', kind: 'action', action: 'SCORE', spokenAction: '득점' },
  { needle: '범실', kind: 'action', action: 'FAULT', spokenAction: '범실' },
  { needle: '실수', kind: 'action', action: 'FAULT', spokenAction: '범실' },
  { needle: '폴트', kind: 'action', action: 'FAULT', spokenAction: '범실' },
  { needle: '교체', kind: 'action', action: 'SUB', spokenAction: '선수교체' },
  { needle: '취소', kind: 'action', action: 'UNDO', spokenAction: '취소' },
  { needle: '언두', kind: 'action', action: 'UNDO', spokenAction: '취소' },

  { needle: '해주세요', kind: 'filler' },
  { needle: '해줘', kind: 'filler' },
  { needle: '부탁', kind: 'filler' },
  { needle: '기록', kind: 'filler' },
  { needle: '선수', kind: 'filler' },
];

const NUMBER_SLOTS: Array<{ needle: string; slot: number }> = [
  { needle: '1번', slot: 1 }, { needle: '2번', slot: 2 }, { needle: '3번', slot: 3 },
  { needle: '4번', slot: 4 }, { needle: '5번', slot: 5 }, { needle: '6번', slot: 6 },
  { needle: '7번', slot: 7 }, { needle: '8번', slot: 8 }, { needle: '9번', slot: 9 },
  { needle: '일번', slot: 1 }, { needle: '이번', slot: 2 }, { needle: '삼번', slot: 3 },
  { needle: '사번', slot: 4 }, { needle: '오번', slot: 5 }, { needle: '육번', slot: 6 },
  { needle: '칠번', slot: 7 }, { needle: '팔번', slot: 8 }, { needle: '구번', slot: 9 },
];

function compactKorean(raw: string): string {
  return String(raw || '')
    .toLowerCase()
    .replace(/[.,!?~]/g, ' ')
    .replace(/\s+/g, '')
    .trim();
}

function positionFromSlot(slot: number): CanonicalPosition | null {
  const found = (Object.keys(CANONICAL_POSITION_SLOT) as CanonicalPosition[])
    .find((code) => CANONICAL_POSITION_SLOT[code] === slot);
  return found || null;
}

function layoutKeywords(layout?: CourtLayout): Keyword[] {
  const front = layout?.frontCount ?? DEFAULT_LINE_COUNT;
  const middle = layout?.middleCount ?? DEFAULT_LINE_COUNT;
  const back = layout?.backCount ?? DEFAULT_LINE_COUNT;
  const total = front + middle + back;
  const rows: Keyword[] = [];
  for (let i = 0; i < total; i += 1) {
    const label = courtSlotLabelAt(i, front, middle, back);
    const slot = toPositionSlot(i);
    const position = slot != null ? positionFromSlot(slot) : null;
    const needle = compactKorean(label);
    if (!needle || !position || needle === '뒷차') continue;
    rows.push({ needle, kind: 'position', position });
  }
  NUMBER_SLOTS.forEach((row) => {
    const position = positionFromSlot(row.slot);
    if (!position) return;
    rows.push({ needle: row.needle, kind: 'position', position });
  });
  return rows;
}

function sortedKeywords(layout?: CourtLayout): Keyword[] {
  return [...GLOSSARY, ...layoutKeywords(layout)].sort((a, b) => b.needle.length - a.needle.length);
}

function cleanPlayerName(raw: string): string {
  let name = raw.replace(/[^0-9a-z가-힣]/g, '');
  if (name.length >= 4 && name.endsWith('이요')) name = name.slice(0, -2);
  if (name.length >= 3 && name.endsWith('요')) name = name.slice(0, -1);
  return name;
}

function needsTeam(kind: VoiceActionKind): boolean {
  return kind === 'SCORE' || kind === 'FAULT' || kind === 'STAT' || kind === 'SUB';
}

function needsPosition(kind: VoiceActionKind): boolean {
  return kind === 'SCORE' || kind === 'FAULT' || kind === 'STAT' || kind === 'SUB';
}

export function parseVoiceCommand(text: string, layout?: CourtLayout): VoiceParseResult {
  const compact = compactKorean(text);
  if (!compact) {
    return { ok: false, error: 'EMPTY', message: '음성이 비어 있습니다.' };
  }

  const keywords = sortedKeywords(layout);
  const taken = new Array<boolean>(compact.length).fill(false);
  let teamId: VoiceTeamId | null = null;
  let spokenTeam = '';
  let teamConflict = false;
  let position: CanonicalPosition | null = null;
  const actions: Keyword[] = [];

  for (let i = 0; i < compact.length; i += 1) {
    if (taken[i]) continue;
    const hit = keywords.find((keyword) => (
      keyword.needle.length > 0
      && compact.startsWith(keyword.needle, i)
      && keyword.needle.split('').every((_, offset) => !taken[i + offset])
    ));
    if (!hit) continue;
    for (let offset = 0; offset < hit.needle.length; offset += 1) taken[i + offset] = true;

    if (hit.kind === 'team' && hit.teamId) {
      if (teamId && teamId !== hit.teamId) teamConflict = true;
      else {
        teamId = hit.teamId;
        spokenTeam = hit.spokenTeam || spokenTeam;
      }
    } else if (hit.kind === 'position' && hit.position) {
      if (!position) position = hit.position;
    } else if (hit.kind === 'action' && hit.action) {
      actions.push(hit);
    }
  }

  if (teamConflict) {
    return { ok: false, error: 'AMBIGUOUS', message: '팀이 두 곳이라 알아듣지 못했습니다.' };
  }

  const action = ACTION_PRIORITY
    .map((kind) => actions.find((row) => row.action === kind))
    .find((row) => !!row) || null;

  if (!action?.action) {
    return { ok: false, error: 'NO_ACTION', message: '명령이나 스탯을 알아듣지 못했습니다.' };
  }

  const kind = action.action;
  if (needsTeam(kind) && !teamId) {
    return { ok: false, error: 'NO_TEAM', message: '팀을 알아듣지 못했습니다.' };
  }
  if (needsPosition(kind) && !position) {
    return { ok: false, error: 'NO_POSITION', message: '포지션을 알아듣지 못했습니다.' };
  }

  const playerName = cleanPlayerName(compact.split('').filter((_, index) => !taken[index]).join(''));
  if (kind === 'SUB' && playerName.length < 2) {
    return { ok: false, error: 'NO_PLAYER', message: '교체할 선수 이름을 알아듣지 못했습니다.' };
  }

  const positionCode = position;
  const positionSlot = positionCode ? CANONICAL_POSITION_SLOT[positionCode] : null;

  return {
    ok: true,
    kind,
    teamId,
    actionType: kind === 'SCORE' || kind === 'FAULT' ? kind : null,
    statType: kind === 'STAT' ? (action.statType || null) : null,
    positionSlot,
    positionCode,
    playerName: playerName || null,
    spokenTeam: spokenTeam || (teamId === 'away' ? 'B팀' : teamId === 'host' ? 'A팀' : ''),
    spokenPosition: positionCode || '',
    spokenAction: action.spokenAction || '',
  };
}

export function formatVoiceConfirm(command: VoiceCommand): string {
  if (command.kind === 'COURT_FLIP') return '코트 반전, 완료';
  if (command.kind === 'SET_CLOSE') return '세트 마감, 다음 세트를 준비합니다';
  if (command.kind === 'MATCH_END') return '경기 종료, 결과를 정리합니다';
  if (command.kind === 'UNDO') return '직전 음성 기록 취소';
  if (command.kind === 'SUB') {
    return `${command.spokenTeam} ${command.spokenPosition} ${command.playerName} 교체, 기록 완료`;
  }
  return `${command.spokenTeam} ${command.spokenPosition} ${command.spokenAction}, 기록 완료`;
}