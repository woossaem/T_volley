import { courtSlotLabelAt, DEFAULT_LINE_COUNT } from './roster';
import { toPositionSlot } from './slotAttribution';

export type VoiceTeamId = 'host' | 'away';

export type VoiceStatType =
  | 'dig'
  | 'block'
  | 'ace'
  | 'receive'
  | 'assist'
  | 'effective_block'
  | 'attack'
  | 'feint'
  | 'quick_attack'
  | 'back_attack'
  | 'cover'
  | 'process';

/** 현장 발화를 자모 유사도로 붙이는 표준 액션. */
export type VolleyballActionCode =
  | 'SCORE'
  | 'FAULT'
  | 'SERVE_ACE'
  | 'SERVE_FAULT'
  | 'DIG'
  | 'BLOCK'
  | 'EFFECTIVE_BLOCK'
  | 'RECEIVE'
  | 'ATTACK'
  | 'FEINT'
  | 'QUICK_ATTACK'
  | 'BACK_ATTACK'
  | 'COVER'
  | 'PROCESS';

/** 이 유사도 이상인 표준 어휘만 액션으로 채택한다. */
export const JAMO_SIMILARITY_THRESHOLD = 0.7;

/** Google STT biasing / iOS contextual strings 로 넘기는 배구 핵심 어휘. */
export const VOLLEYBALL_SPEECH_HINTS = [
  'A팀', 'B팀', '우리팀', '상대팀',
  '레프트', '라이트', '센터', '세터', '앞차', '백차', '레프트백', '센터백', '라이트백',
  '득점', '공격득점', '나이스킬', '나이스어택', '어택', '공격',
  '범실', '공격범실', '서브에이스', '에이스', '서브범실', '서브아웃',
  '디그', '블록', '블로킹', '유효블록', '터치원',
  '리시브', '나이스리시브', '굿리시브',
  '페인트', '속공', '백어택', '후위공격',
  '커버', '나이스커버', '처리', '볼처리',
] as const;

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
  effective_block: '유효블록',
  attack: '공격',
  feint: '페인트',
  quick_attack: '속공',
  back_attack: '백어택',
  cover: '커버',
  process: '처리',
};

const STAT_EVENT_TYPES: Record<string, VoiceStatType> = {
  dig: 'dig',
  block: 'block',
  ace: 'ace',
  receive: 'receive',
  assist: 'assist',
  effective_block: 'effective_block',
  attack: 'attack',
  feint: 'feint',
  quick_attack: 'quick_attack',
  back_attack: 'back_attack',
  cover: 'cover',
  process: 'process',
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
  actionCode: VolleyballActionCode | null;
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
  actionCode?: VolleyballActionCode;
  similarity?: number;
};

const COMMAND_PRIORITY: VoiceActionKind[] = [
  'UNDO',
  'MATCH_END',
  'SET_CLOSE',
  'COURT_FLIP',
  'SUB',
];

/** 유사도가 같을 때 득점·서브 계열을 기술 기록보다 먼저 고른다. */
const ACTION_CODE_RANK: Record<VolleyballActionCode, number> = {
  SERVE_ACE: 0,
  SERVE_FAULT: 1,
  SCORE: 2,
  FAULT: 3,
  EFFECTIVE_BLOCK: 4,
  BLOCK: 5,
  RECEIVE: 6,
  ATTACK: 7,
  BACK_ATTACK: 8,
  QUICK_ATTACK: 9,
  FEINT: 10,
  DIG: 11,
  COVER: 12,
  PROCESS: 13,
};

/**
 * 현장 발음이 뭉개지거나 Google STT 가 비슷한 소리로 바꾼 표기를 정식 코드로 되돌린다.
 * 키는 공백을 뺀 비교용이고, 값은 스코어보드가 쓰는 팀·포지션·행위다.
 */
const TEAM_ALIASES: Record<string, 'A' | 'B'> = {
  // A팀
  'a팀': 'A', '에이팀': 'A', '애이팀': 'A', '에팀': 'A', '애팀': 'A',
  '우리팀': 'A', '홈팀': 'A', '아팀': 'A',
  'atm': 'A', 'at': 'A', '에이틴': 'A', '에이티엠': 'A', '에티': 'A', '아티': 'A',
  '에잇팀': 'A', '에이템': 'A', '애이템': 'A', '에이뗌': 'A',

  // B팀
  'b팀': 'B', '비팀': 'B', '바팀': 'B', '어웨이팀': 'B', '상대팀': 'B', '미팀': 'B',
  '미팅': 'B', '피싱': 'B', '미씽': 'B', '비티': 'B', '비티엠': 'B', '피팅': 'B',
  '삐팀': 'B', '비템': 'B', '삐팅': 'B', '비띵': 'B', '비띰': 'B',
};

const POSITION_ALIASES: Record<string, CanonicalPosition> = {
  // 앞차
  '앞차': '앞차', '압차': '앞차', '암차': '앞차', '합차': '앞차', '김밥차': '앞차', '앞창': '앞차', '합창': '앞차', '업차': '앞차',
  '앞자': '앞차', '아차': '앞차', '압자': '앞차', '암자': '앞차', '앞채': '앞차',
  // 백차
  '백차': '백차', '배차': '백차', '백자': '백차', '빅차': '백차', '배창': '백차',
  '백창': '백차', '배자': '백차', '벡차': '백차', '백채': '백차',
  // 세터
  '세터': '세터', '새터': '세터', '세타': '세터', '새타': '세터',
  '쉐터': '세터', '쎄터': '세터',
  // 센터
  '센터': '센터', '센타': '센터', '선터': '센터',
  '쎈터': '센터', '샌터': '센터', '센토': '센터',
  // 레프트
  '레프트': '레프트', '래프트': '레프트', '내프트': '레프트', '레프': '레프트',
  '렙트': '레프트', '레푸트': '레프트', '래프': '레프트',
  // 라이트
  '라이트': '라이트', '나이트': '라이트', '라잇': '라이트',
  '라이또': '라이트', '라잇트': '라이트', '나잇': '라이트',
  // 레프트백 / 레백
  '레백': '레프트백', '내백': '레프트백', '네백': '레프트백', '레프트백': '레프트백', '래프트백': '레프트백',
  '랩백': '레프트백', '레프백': '레프트백', '래백': '레프트백', '내프트백': '레프트백',
  // 센터백 / 센백
  '센백': '센터백', '선백': '센터백', '센터백': '센터백', '센타백': '센터백',
  '쎈백': '센터백', '센벡': '센터백', '선타백': '센터백',
  // 라이트백 / 라백
  '라백': '라이트백', '나백': '라이트백', '라이트백': '라이트백', '나이트백': '라이트백',
  '라이백': '라이트백', '라벡': '라이트백', '라잇백': '라이트백',
};

type CanonicalAction = {
  token: string;
  actionCode: VolleyballActionCode;
  kind: VoiceActionKind;
  statType?: VoiceStatType;
  spokenAction: string;
};

/**
 * 오타 사전 대신 이 표준 어휘와 자모 유사도를 비교한다.
 * 범실·공격범실은 공격범실 하나로 기록한다.
 */
const CANONICAL_ACTIONS: CanonicalAction[] = [
  { token: '공격득점', actionCode: 'SCORE', kind: 'SCORE', spokenAction: '공격득점' },
  { token: '득점', actionCode: 'SCORE', kind: 'SCORE', spokenAction: '득점' },
  { token: '공격범실', actionCode: 'FAULT', kind: 'FAULT', spokenAction: '공격범실' },
  { token: '범실', actionCode: 'FAULT', kind: 'FAULT', spokenAction: '공격범실' },
  { token: '서브에이스', actionCode: 'SERVE_ACE', kind: 'STAT', statType: 'ace', spokenAction: '서브에이스' },
  { token: '에이스', actionCode: 'SERVE_ACE', kind: 'STAT', statType: 'ace', spokenAction: '에이스' },
  { token: '서브범실', actionCode: 'SERVE_FAULT', kind: 'FAULT', spokenAction: '서브범실' },
  { token: '서브아웃', actionCode: 'SERVE_FAULT', kind: 'FAULT', spokenAction: '서브아웃' },
  { token: '디그', actionCode: 'DIG', kind: 'STAT', statType: 'dig', spokenAction: '디그' },
  { token: '블로킹', actionCode: 'BLOCK', kind: 'STAT', statType: 'block', spokenAction: '블로킹' },
  { token: '블록', actionCode: 'BLOCK', kind: 'STAT', statType: 'block', spokenAction: '블록' },
  { token: '유효블록', actionCode: 'EFFECTIVE_BLOCK', kind: 'STAT', statType: 'effective_block', spokenAction: '유효블록' },
  { token: '터치원', actionCode: 'EFFECTIVE_BLOCK', kind: 'STAT', statType: 'effective_block', spokenAction: '터치원' },
  { token: '나이스리시브', actionCode: 'RECEIVE', kind: 'STAT', statType: 'receive', spokenAction: '나이스리시브' },
  { token: '굿리시브', actionCode: 'RECEIVE', kind: 'STAT', statType: 'receive', spokenAction: '굿리시브' },
  { token: '리시브', actionCode: 'RECEIVE', kind: 'STAT', statType: 'receive', spokenAction: '리시브' },
  { token: '나이스어택', actionCode: 'ATTACK', kind: 'STAT', statType: 'attack', spokenAction: '나이스어택' },
  { token: '나이스킬', actionCode: 'ATTACK', kind: 'STAT', statType: 'attack', spokenAction: '나이스킬' },
  { token: '어택', actionCode: 'ATTACK', kind: 'STAT', statType: 'attack', spokenAction: '어택' },
  { token: '공격', actionCode: 'ATTACK', kind: 'STAT', statType: 'attack', spokenAction: '공격' },
  { token: '훼인트', actionCode: 'FEINT', kind: 'STAT', statType: 'feint', spokenAction: '페인트' },
  { token: '페인트', actionCode: 'FEINT', kind: 'STAT', statType: 'feint', spokenAction: '페인트' },
  { token: '속공', actionCode: 'QUICK_ATTACK', kind: 'STAT', statType: 'quick_attack', spokenAction: '속공' },
  { token: '후위공격', actionCode: 'BACK_ATTACK', kind: 'STAT', statType: 'back_attack', spokenAction: '후위공격' },
  { token: '백어택', actionCode: 'BACK_ATTACK', kind: 'STAT', statType: 'back_attack', spokenAction: '백어택' },
  { token: '나이스커버', actionCode: 'COVER', kind: 'STAT', statType: 'cover', spokenAction: '나이스커버' },
  { token: '커버', actionCode: 'COVER', kind: 'STAT', statType: 'cover', spokenAction: '커버' },
  { token: '볼처리', actionCode: 'PROCESS', kind: 'STAT', statType: 'process', spokenAction: '볼처리' },
  { token: '처리', actionCode: 'PROCESS', kind: 'STAT', statType: 'process', spokenAction: '처리' },
];

const POSITION_EXTRAS: Keyword[] = [
  { needle: '세컨레프트', kind: 'position', position: '레프트' },
  { needle: '세컨라이트', kind: 'position', position: '라이트' },
  { needle: '전위좌측', kind: 'position', position: '레프트' },
  { needle: '전위우측', kind: 'position', position: '라이트' },
  { needle: '중위좌측', kind: 'position', position: '앞차' },
  { needle: '중위우측', kind: 'position', position: '백차' },
  { needle: '후위좌측', kind: 'position', position: '레프트백' },
  { needle: '후위우측', kind: 'position', position: '라이트백' },
  { needle: '리베로', kind: 'position', position: '센터백' },
  { needle: '전위', kind: 'position', position: '세터' },
  { needle: '중위', kind: 'position', position: '센터' },
  { needle: '후위', kind: 'position', position: '센터백' },
  { needle: '좌측', kind: 'position', position: '레프트' },
  { needle: '우측', kind: 'position', position: '라이트' },
  { needle: '중앙', kind: 'position', position: '센터' },
];

const COMMAND_EXTRAS: Keyword[] = [
  { needle: '네트터치', kind: 'action', action: 'FAULT', actionCode: 'FAULT', spokenAction: '공격범실' },
  { needle: '선수교체', kind: 'action', action: 'SUB', spokenAction: '선수교체' },
  { needle: '코트반전', kind: 'action', action: 'COURT_FLIP', spokenAction: '코트 반전' },
  { needle: '좌우반전', kind: 'action', action: 'COURT_FLIP', spokenAction: '코트 반전' },
  { needle: '세트마감', kind: 'action', action: 'SET_CLOSE', spokenAction: '세트 마감' },
  { needle: '세트종료', kind: 'action', action: 'SET_CLOSE', spokenAction: '세트 마감' },
  { needle: '경기종료', kind: 'action', action: 'MATCH_END', spokenAction: '경기 종료' },
  { needle: '경기마감', kind: 'action', action: 'MATCH_END', spokenAction: '경기 종료' },
  { needle: '어시스트', kind: 'action', action: 'STAT', statType: 'assist', spokenAction: '토스' },
  { needle: '토스', kind: 'action', action: 'STAT', statType: 'assist', spokenAction: '토스' },
  { needle: '점수', kind: 'action', action: 'SCORE', actionCode: 'SCORE', spokenAction: '득점' },
  { needle: '넣었', kind: 'action', action: 'SCORE', actionCode: 'SCORE', spokenAction: '득점' },
  { needle: '실수', kind: 'action', action: 'FAULT', actionCode: 'FAULT', spokenAction: '공격범실' },
  { needle: '폴트', kind: 'action', action: 'FAULT', actionCode: 'FAULT', spokenAction: '공격범실' },
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

function teamKeyword(needle: string, team: 'A' | 'B'): Keyword {
  if (team === 'A') return { needle, kind: 'team', teamId: 'host', spokenTeam: 'A팀' };
  return { needle, kind: 'team', teamId: 'away', spokenTeam: 'B팀' };
}

const HANGUL_BASE = 0xac00;
const HANGUL_LAST = 0xd7a3;
const CHO_SEONG = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
const JUNG_SEONG = ['ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅗ', 'ㅘ', 'ㅙ', 'ㅚ', 'ㅛ', 'ㅜ', 'ㅝ', 'ㅞ', 'ㅟ', 'ㅠ', 'ㅡ', 'ㅢ', 'ㅣ'];
const JONG_SEONG = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];

/** 한글 음절을 초성·중성·종성 자모로 풀고, 한글이 아닌 문자는 그대로 둔다. */
export function decomposeHangulToJamo(text: string): string {
  const source = String(text || '');
  let out = '';
  for (let i = 0; i < source.length; i += 1) {
    const code = source.charCodeAt(i);
    if (code < HANGUL_BASE || code > HANGUL_LAST) {
      out += source[i];
      continue;
    }
    const syllable = code - HANGUL_BASE;
    const cho = Math.floor(syllable / 588);
    const jung = Math.floor((syllable % 588) / 28);
    const jong = syllable % 28;
    out += CHO_SEONG[cho] + JUNG_SEONG[jung];
    if (jong > 0) out += JONG_SEONG[jong];
  }
  return out;
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = new Array<number>(b.length + 1);
  let next = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) prev[j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    next[0] = i;
    const left = a.charCodeAt(i - 1);
    for (let j = 1; j <= b.length; j += 1) {
      const cost = left === b.charCodeAt(j - 1) ? 0 : 1;
      next[j] = Math.min(next[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    const swap = prev;
    prev = next;
    next = swap;
  }
  return prev[b.length];
}

/** 자모로 푼 두 문자열의 편집 거리 비율. 1이면 같고 0이면 완전히 다르다. */
export function calculateJamoSimilarity(a: string, b: string): number {
  const left = decomposeHangulToJamo(a);
  const right = decomposeHangulToJamo(b);
  const max = Math.max(left.length, right.length);
  if (max === 0) return 1;
  return 1 - levenshteinDistance(left, right) / max;
}

type FuzzyActionHit = {
  start: number;
  end: number;
  keyword: Keyword;
};

/**
 * 공백을 뺀 문장 위를 표준 액션 길이 근처로 훑어, 임계값 이상인 구간을 겹치지 않게 고른다.
 * 같은 자리에서는 유사도가 높은 어휘, 같으면 더 긴 어휘가 이긴다.
 */
function matchFuzzyActions(compact: string): FuzzyActionHit[] {
  const candidates: Array<FuzzyActionHit & { similarity: number }> = [];
  CANONICAL_ACTIONS.forEach((row) => {
    const token = row.token;
    // 두 글자 어휘는 음절 수가 같을 때만 비교한다. 한 글자 창은 '철'을 '처리'로 붙인다.
    const slack = token.length >= 3 ? 1 : 0;
    const minWidth = Math.max(1, token.length - slack);
    const maxWidth = Math.min(compact.length, token.length + slack);
    let best: (FuzzyActionHit & { similarity: number }) | null = null;
    for (let width = minWidth; width <= maxWidth; width += 1) {
      for (let start = 0; start + width <= compact.length; start += 1) {
        const slice = compact.slice(start, start + width);
        const similarity = slice === token ? 1 : calculateJamoSimilarity(slice, token);
        if (similarity + 1e-9 < JAMO_SIMILARITY_THRESHOLD) continue;
        const longer = !!best && width > (best.end - best.start);
        const closer = !!best && similarity > best.similarity + 1e-9;
        if (!best || closer || (Math.abs(similarity - best.similarity) <= 1e-9 && longer)) {
          best = {
            start,
            end: start + width,
            similarity,
            keyword: {
              needle: slice,
              kind: 'action',
              action: row.kind,
              statType: row.statType,
              spokenAction: row.spokenAction,
              actionCode: row.actionCode,
              similarity,
            },
          };
        }
      }
    }
    if (best) candidates.push(best);
  });

  candidates.sort((a, b) => {
    if (Math.abs(b.similarity - a.similarity) > 1e-9) return b.similarity - a.similarity;
    return (b.end - b.start) - (a.end - a.start);
  });

  const taken = new Array<boolean>(compact.length).fill(false);
  const chosen: FuzzyActionHit[] = [];
  candidates.forEach((hit) => {
    for (let i = hit.start; i < hit.end; i += 1) {
      if (taken[i]) return;
    }
    for (let i = hit.start; i < hit.end; i += 1) taken[i] = true;
    chosen.push(hit);
  });
  return chosen;
}

function pickAction(actions: Keyword[]): Keyword | null {
  const command = COMMAND_PRIORITY
    .map((kind) => actions.find((row) => row.action === kind))
    .find((row) => !!row);
  if (command) return command;
  const rally = actions.filter((row) => row.action === 'SCORE' || row.action === 'FAULT' || row.action === 'STAT');
  if (rally.length === 0) return null;
  return [...rally].sort((a, b) => {
    const similarity = (b.similarity ?? 1) - (a.similarity ?? 1);
    if (Math.abs(similarity) > 1e-9) return similarity;
    const length = b.needle.length - a.needle.length;
    if (length !== 0) return length;
    const rankA = a.actionCode ? ACTION_CODE_RANK[a.actionCode] : 50;
    const rankB = b.actionCode ? ACTION_CODE_RANK[b.actionCode] : 50;
    return rankA - rankB;
  })[0];
}

let glossaryCache: Keyword[] | null = null;

/**
 * 긴 표현이 나중에 길이순으로 먼저 소비된다. 센터백이 센터보다 먼저 맞고, 뒷차는 포지션으로 받지 않는다.
 * 약어와 음동이의어는 정식 포지션·행위 코드로만 남긴다.
 */
function glossaryKeywords(): Keyword[] {
  if (glossaryCache) return glossaryCache;
  const rows: Keyword[] = [];
  const seen = new Set<string>();
  const push = (keyword: Keyword) => {
    const needle = compactKorean(keyword.needle);
    if (!needle || seen.has(needle)) return;
    seen.add(needle);
    rows.push({ ...keyword, needle });
  };

  Object.entries(TEAM_ALIASES).forEach(([needle, team]) => push(teamKeyword(needle, team)));
  Object.entries(POSITION_ALIASES).forEach(([needle, position]) => {
    push({ needle, kind: 'position', position });
  });
  POSITION_EXTRAS.forEach(push);
  COMMAND_EXTRAS.forEach(push);

  glossaryCache = rows;
  return rows;
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
  return [...glossaryKeywords(), ...layoutKeywords(layout)].sort((a, b) => b.needle.length - a.needle.length);
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

  matchFuzzyActions(compact).forEach((hit) => {
    for (let i = hit.start; i < hit.end; i += 1) taken[i] = true;
    actions.push(hit.keyword);
  });

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

  const action = pickAction(actions);

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
    actionCode: action.actionCode || null,
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