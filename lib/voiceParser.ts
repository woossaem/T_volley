import { courtSlotLabelAt, DEFAULT_LINE_COUNT } from './roster';
import { toPositionSlot } from './slotAttribution';

export type VoiceTeamId = 'host' | 'away';
export type VoiceActionType = 'SCORE' | 'FAULT';

export type VoiceCommand = {
  ok: true;
  teamId: VoiceTeamId;
  actionType: VoiceActionType;
  positionSlot: number;
  spokenTeam: string;
  spokenPosition: string;
  spokenAction: string;
};

export type VoiceParseFailure = {
  ok: false;
  error: 'EMPTY' | 'NO_TEAM' | 'NO_ACTION' | 'NO_POSITION';
  message: string;
};

export type VoiceParseResult = VoiceCommand | VoiceParseFailure;

type CourtLayout = {
  frontCount?: number;
  middleCount?: number;
  backCount?: number;
};

const TEAM_A = [
  'a팀', '에이팀', '에이 팀', '에이', '홈팀', '홈 팀', '주최', '우리팀',
];
const TEAM_B = [
  'b팀', '비팀', '비 팀', '비', '어웨이팀', '어웨이 팀', '상대팀', '상대 팀',
];

const SCORE_WORDS = ['득점', '점수', '킬', '넣었', '넣었음', '넣었어'];
const FAULT_WORDS = ['범실', '실수', '폴트', '네트터치', '네트 터치', '서브범실'];

const POSITION_NEEDLES: Array<{ needle: string; slot: number }> = [
  { needle: '레프트백', slot: 7 },
  { needle: '라이트백', slot: 9 },
  { needle: '센터백', slot: 8 },
  { needle: '세컨레프트', slot: 1 },
  { needle: '세컨라이트', slot: 3 },
  { needle: '전위좌측', slot: 1 },
  { needle: '전위우측', slot: 3 },
  { needle: '중위좌측', slot: 4 },
  { needle: '중위우측', slot: 6 },
  { needle: '후위좌측', slot: 7 },
  { needle: '후위우측', slot: 9 },
  { needle: '앞차', slot: 4 },
  { needle: '백차', slot: 6 },
  { needle: '세터', slot: 2 },
  { needle: '레프트', slot: 1 },
  { needle: '라이트', slot: 3 },
  { needle: '리베로', slot: 8 },
  { needle: '센터', slot: 5 },
  { needle: '전위', slot: 2 },
  { needle: '중위', slot: 5 },
  { needle: '후위', slot: 8 },
  { needle: '좌측', slot: 1 },
  { needle: '우측', slot: 3 },
  { needle: '중앙', slot: 5 },
];

function compactKorean(raw: string): string {
  return String(raw || '')
    .toLowerCase()
    .replace(/[.,!?~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeForMatch(raw: string): string {
  return compactKorean(raw).replace(/\s+/g, '');
}

function includesAny(compact: string, words: string[]): boolean {
  return [...words]
    .map((w) => w.replace(/\s+/g, ''))
    .sort((a, b) => b.length - a.length)
    .some((w) => w.length >= 2 && compact.includes(w));
}

function parseTeam(text: string): { teamId: VoiceTeamId; spokenTeam: string } | null {
  const compact = normalizeForMatch(text);
  const hasA = includesAny(compact, TEAM_A);
  const hasB = includesAny(compact, TEAM_B);
  if (hasA && !hasB) return { teamId: 'host', spokenTeam: 'A팀' };
  if (hasB && !hasA) return { teamId: 'away', spokenTeam: 'B팀' };
  if (compact.includes('에이팀') || compact.includes('a팀') || compact.includes('홈팀')) {
    return { teamId: 'host', spokenTeam: 'A팀' };
  }
  if (compact.includes('비팀') || compact.includes('b팀') || compact.includes('어웨이팀')) {
    return { teamId: 'away', spokenTeam: 'B팀' };
  }
  return null;
}

function parseAction(text: string): { actionType: VoiceActionType; spokenAction: string } | null {
  const compact = normalizeForMatch(text);
  if (FAULT_WORDS.some((w) => compact.includes(w.replace(/\s+/g, '')))) {
    return { actionType: 'FAULT', spokenAction: '범실' };
  }
  if (SCORE_WORDS.some((w) => compact.includes(w.replace(/\s+/g, '')))) {
    return { actionType: 'SCORE', spokenAction: '득점' };
  }
  return null;
}

function parseNumericSlot(text: string): number | null {
  const compact = compactKorean(text);
  const m = compact.match(/(\d+)\s*(번|번자리|슬롯)?/);
  if (m) {
    const n = Number(m[1]);
    if (n >= 1 && n <= 9) return n;
  }
  const kor: Array<[string, number]> = [
    ['일번', 1], ['이번', 2], ['삼번', 3], ['사번', 4], ['오번', 5],
    ['육번', 6], ['칠번', 7], ['팔번', 8], ['구번', 9],
  ];
  const glued = normalizeForMatch(text);
  for (const [needle, slot] of kor) {
    if (glued.includes(needle)) return slot;
  }
  return null;
}

function parsePositionSlot(text: string, layout?: CourtLayout): { slot: number; spokenPosition: string } | null {
  const numeric = parseNumericSlot(text);
  if (numeric != null) return { slot: numeric, spokenPosition: `${numeric}번` };

  const front = layout?.frontCount ?? DEFAULT_LINE_COUNT;
  const middle = layout?.middleCount ?? DEFAULT_LINE_COUNT;
  const back = layout?.backCount ?? DEFAULT_LINE_COUNT;
  const total = front + middle + back;
  const compact = normalizeForMatch(text);

  const labeled: Array<{ label: string; slot: number }> = [];
  for (let i = 0; i < total; i += 1) {
    const label = courtSlotLabelAt(i, front, middle, back);
    const slot = toPositionSlot(i);
    if (label && slot != null) labeled.push({ label, slot });
  }
  labeled.sort((a, b) => b.label.length - a.label.length);
  for (const row of labeled) {
    if (compact.includes(row.label.replace(/\s+/g, ''))) {
      return { slot: row.slot, spokenPosition: row.label };
    }
  }

  for (const row of POSITION_NEEDLES) {
    if (compact.includes(row.needle)) {
      const idx = Math.min(total, row.slot) - 1;
      const label = courtSlotLabelAt(idx, front, middle, back) || row.needle;
      return { slot: row.slot, spokenPosition: label };
    }
  }
  return null;
}

export function parseVoiceCommand(text: string, layout?: CourtLayout): VoiceParseResult {
  const trimmed = compactKorean(text);
  if (!trimmed) {
    return { ok: false, error: 'EMPTY', message: '음성이 비어 있습니다.' };
  }
  const team = parseTeam(trimmed);
  if (!team) {
    return { ok: false, error: 'NO_TEAM', message: '팀을 알아듣지 못했습니다.' };
  }
  const action = parseAction(trimmed);
  if (!action) {
    return { ok: false, error: 'NO_ACTION', message: '득점 또는 범실을 알아듣지 못했습니다.' };
  }
  const position = parsePositionSlot(trimmed, layout);
  if (!position) {
    return { ok: false, error: 'NO_POSITION', message: '포지션을 알아듣지 못했습니다.' };
  }
  return {
    ok: true,
    teamId: team.teamId,
    actionType: action.actionType,
    positionSlot: position.slot,
    spokenTeam: team.spokenTeam,
    spokenPosition: position.spokenPosition,
    spokenAction: action.spokenAction,
  };
}

export function formatVoiceConfirm(command: VoiceCommand): string {
  return `${command.spokenTeam} ${command.spokenPosition} ${command.spokenAction}, 기록 완료`;
}
