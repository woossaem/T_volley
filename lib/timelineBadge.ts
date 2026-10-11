import { TEAM_COLORS } from '../constants/Colors';

/** 음성 파서가 남기는 표준 액션. 실시간 행의 action / type 과 맞춰 읽는다. */
export const TIMELINE_ACTION_CODES = [
  'SCORE',
  'FAULT',
  'SERVE_ACE',
  'SERVE_FAULT',
  'DIG',
  'BLOCK',
  'EFFECTIVE_BLOCK',
  'RECEIVE',
  'ATTACK',
  'FEINT',
  'QUICK_ATTACK',
  'BACK_ATTACK',
  'COVER',
  'PROCESS',
] as const;

export type TimelineActionCode = (typeof TIMELINE_ACTION_CODES)[number];

export type TimelineTrack = 'score' | 'skill';

export type TimelineBadgeTone =
  | 'score'
  | 'ace'
  | 'block'
  | 'effective_block'
  | 'dig'
  | 'receive'
  | 'cover'
  | 'fault'
  | 'serve_fault'
  | 'feint'
  | 'assist'
  | 'sub'
  | 'manual'
  | 'other';

export type TimelineBadgeStyle = {
  backgroundColor: string;
  color: string;
  borderColor: string;
  solid: boolean;
};

export type TimelineEventLike = {
  event_type?: string | null;
  action_code?: string | null;
  action?: string | null;
  type?: string | null;
  team_type?: string | null;
  player_name?: string | null;
  position_slot?: number | null;
  host_score?: number | null;
  away_score?: number | null;
  sub_out_name?: string | null;
};

const ACTION_CODE_SET = new Set<string>(TIMELINE_ACTION_CODES);

const POSITION_BY_SLOT: Record<number, string> = {
  1: '레프트',
  2: '세터',
  3: '라이트',
  4: '앞차',
  5: '센터',
  6: '백차',
  7: '레프트백',
  8: '센터백',
  9: '라이트백',
};

/** Tailwind 고대비 배지와 같은 색. /20 배경, /50 테두리. */
const TONE_STYLE: Record<Exclude<TimelineBadgeTone, 'score'>, TimelineBadgeStyle> = {
  ace: { backgroundColor: 'rgba(245, 158, 11, 0.2)', color: '#FCD34D', borderColor: 'rgba(245, 158, 11, 0.5)', solid: false },
  block: { backgroundColor: 'rgba(168, 85, 247, 0.2)', color: '#D8B4FE', borderColor: 'rgba(168, 85, 247, 0.5)', solid: false },
  effective_block: { backgroundColor: 'rgba(99, 102, 241, 0.2)', color: '#A5B4FC', borderColor: 'rgba(99, 102, 241, 0.5)', solid: false },
  dig: { backgroundColor: 'rgba(16, 185, 129, 0.2)', color: '#6EE7B7', borderColor: 'rgba(16, 185, 129, 0.5)', solid: false },
  receive: { backgroundColor: 'rgba(6, 182, 212, 0.2)', color: '#67E8F9', borderColor: 'rgba(6, 182, 212, 0.5)', solid: false },
  cover: { backgroundColor: 'rgba(59, 130, 246, 0.2)', color: '#93C5FD', borderColor: 'rgba(59, 130, 246, 0.5)', solid: false },
  fault: { backgroundColor: 'rgba(239, 68, 68, 0.2)', color: '#F87171', borderColor: 'rgba(239, 68, 68, 0.5)', solid: false },
  serve_fault: { backgroundColor: 'rgba(249, 115, 22, 0.2)', color: '#FB923C', borderColor: 'rgba(249, 115, 22, 0.5)', solid: false },
  feint: { backgroundColor: 'rgba(236, 72, 153, 0.2)', color: '#F9A8D4', borderColor: 'rgba(236, 72, 153, 0.5)', solid: false },
  assist: { backgroundColor: 'rgba(100, 116, 139, 0.2)', color: '#CBD5E1', borderColor: 'rgba(100, 116, 139, 0.5)', solid: false },
  sub: { backgroundColor: 'rgba(100, 116, 139, 0.2)', color: '#E2E8F0', borderColor: 'rgba(148, 163, 184, 0.5)', solid: false },
  manual: { backgroundColor: '#334155', color: '#F8FAFC', borderColor: '#64748B', solid: true },
  other: { backgroundColor: 'rgba(71, 85, 105, 0.35)', color: '#E2E8F0', borderColor: 'rgba(148, 163, 184, 0.45)', solid: false },
};

const SCORE_TRACK = new Set<TimelineBadgeTone>(['score', 'ace', 'manual']);

export function readActionCode(row: TimelineEventLike | null | undefined): TimelineActionCode | '' {
  if (!row) return '';
  const candidates = [row.action_code, row.action, row.type];
  for (const value of candidates) {
    const code = String(value || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
    if (code === 'ACE' || code === 'SERVE_ACE') return 'SERVE_ACE';
    if (ACTION_CODE_SET.has(code)) return code as TimelineActionCode;
  }
  return '';
}

export function positionLabelOf(slot?: number | null): string {
  if (slot == null || !Number.isFinite(Number(slot))) return '';
  return POSITION_BY_SLOT[Math.floor(Number(slot))] || '';
}

export function timelineToneOf(event: TimelineEventLike | null | undefined): TimelineBadgeTone {
  const code = readActionCode(event);
  if (code === 'SERVE_FAULT') return 'serve_fault';
  if (code === 'SERVE_ACE') return 'ace';
  if (code === 'SCORE') return 'score';
  if (code === 'FAULT') return 'fault';
  if (code === 'ATTACK' || code === 'QUICK_ATTACK' || code === 'BACK_ATTACK') return 'score';
  if (code === 'BLOCK') return 'block';
  if (code === 'EFFECTIVE_BLOCK') return 'effective_block';
  if (code === 'DIG') return 'dig';
  if (code === 'RECEIVE') return 'receive';
  if (code === 'COVER' || code === 'PROCESS') return 'cover';
  if (code === 'FEINT') return 'feint';

  const type = String(event?.event_type || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (type === 'serve_fault' || type === 'servefault') return 'serve_fault';
  if (type === 'ace' || type === 'serve_ace') return 'ace';
  if (type === 'score' || type === 'kill') return 'score';
  if (type === 'fault') return 'fault';
  if (type === 'attack' || type === 'quick_attack' || type === 'back_attack') return 'score';
  if (type === 'block') return 'block';
  if (type === 'effective_block') return 'effective_block';
  if (type === 'dig') return 'dig';
  if (type === 'receive') return 'receive';
  if (type === 'cover' || type === 'process') return 'cover';
  if (type === 'feint') return 'feint';
  if (type === 'assist') return 'assist';
  if (type === 'sub') return 'sub';
  if (type === 'manual') return 'manual';
  return 'other';
}

export function timelineTrackOf(event: TimelineEventLike | null | undefined): TimelineTrack {
  return SCORE_TRACK.has(timelineToneOf(event)) ? 'score' : 'skill';
}

export function exactActionLabel(event: TimelineEventLike | null | undefined): string {
  const code = readActionCode(event);
  const type = String(event?.event_type || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (code === 'SERVE_FAULT' || type === 'serve_fault') return '서브범실';
  if (code === 'SERVE_ACE' || type === 'ace' || type === 'serve_ace') return '서브에이스';
  if (code === 'QUICK_ATTACK' || type === 'quick_attack') return '속공';
  if (code === 'BACK_ATTACK' || type === 'back_attack') return '후위공격';
  if (code === 'ATTACK' || type === 'attack') return '공격';
  if (code === 'EFFECTIVE_BLOCK' || type === 'effective_block') return '유효블록';
  if (code === 'BLOCK' || type === 'block') return '블록';
  if (code === 'DIG' || type === 'dig') return '디그';
  if (code === 'RECEIVE' || type === 'receive') return '굿리시브';
  if (code === 'COVER' || type === 'cover') return '커버';
  if (code === 'PROCESS' || type === 'process') return '처리';
  if (code === 'FEINT' || type === 'feint') return '페인트';
  if (code === 'FAULT' || type === 'fault') return '공격범실';
  if (code === 'SCORE' || type === 'score' || type === 'kill') return '득점';
  if (type === 'assist') return '토스';
  if (type === 'sub') return '교체';
  if (type === 'manual') return '점수 보정';
  return '기록';
}

function skillParen(name: string): string {
  return name || '선수';
}

export function scoreBadgeStyle(teamType?: string | null): TimelineBadgeStyle {
  const away = String(teamType || '') === 'away';
  return away
    ? { backgroundColor: TEAM_COLORS.away, color: '#FFFFFF', borderColor: '#7F1D1D', solid: true }
    : { backgroundColor: TEAM_COLORS.host, color: '#FFFFFF', borderColor: '#1E3A8A', solid: true };
}

export function timelineBadgeStyle(event: TimelineEventLike | null | undefined): TimelineBadgeStyle {
  const tone = timelineToneOf(event);
  if (tone === 'score') return scoreBadgeStyle(event?.team_type);
  return TONE_STYLE[tone];
}

export function timelineChipText(
  event: TimelineEventLike,
  playerName: string,
): string {
  const tone = timelineToneOf(event);
  const position = positionLabelOf(event.position_slot);
  const name = String(playerName || '').trim();
  const identity = name && position && name !== position ? `${position} ${name}` : (name || position || '선수');
  const teamScore = String(event.team_type || '') === 'away'
    ? Number(event.away_score) || 0
    : Number(event.host_score) || 0;

  if (tone === 'score') {
    return `🏐 ${teamScore} ${identity} (${exactActionLabel(event)})`;
  }
  if (tone === 'ace') return `⚡ 서브에이스 (${skillParen(name || position)})`;
  if (tone === 'block') return `🧱 블록 (${skillParen(name || position)})`;
  if (tone === 'effective_block') return `🤚 유효블록 (${skillParen(name || position)})`;
  if (tone === 'dig') return `🛡️ 디그 (${skillParen(name || position)})`;
  if (tone === 'receive') return `🎯 굿리시브 (${skillParen(name || position)})`;
  if (tone === 'cover') return `🏃 커버/처리 (${skillParen(name || position)})`;
  if (tone === 'fault') return `⚠️ 공격범실 (${skillParen(name || position)})`;
  if (tone === 'serve_fault') return `🚨 서브범실 (${skillParen(name || position)})`;
  if (tone === 'feint') return `✨ 페인트 (${skillParen(name || position)})`;
  if (tone === 'assist') return `🤝 토스 (${skillParen(name || position)})`;
  if (tone === 'sub') {
    const outName = String(event.sub_out_name || '').trim();
    return outName ? `🔄 교체 (${skillParen(name)}←${outName})` : `🔄 교체 (${skillParen(name || position)})`;
  }
  if (tone === 'manual') {
    return `✏️ 보정 ${Number(event.host_score) || 0}:${Number(event.away_score) || 0}`;
  }
  return `📌 ${exactActionLabel(event)} (${skillParen(name || position)})`;
}

export function formatEventClock(iso?: string | null): string {
  if (!iso) return '시각 없음';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '시각 없음';
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function overlayActionCodes<T extends { id?: string; action_code?: string | null }>(
  events: T[],
  logs: Array<Record<string, unknown>> | null | undefined,
): T[] {
  const byId = new Map<string, TimelineActionCode>();
  (logs || []).forEach((log) => {
    const id = String(log?.id || '').trim();
    const code = readActionCode(log as TimelineEventLike);
    if (id && code) byId.set(id, code);
  });
  if (byId.size === 0) return events;
  return events.map((event) => {
    if (readActionCode(event as TimelineEventLike)) return event;
    const code = byId.get(String(event.id || ''));
    return code ? { ...event, action_code: code } : event;
  });
}
