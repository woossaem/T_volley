import { supabase } from './supabase';

/** PostgREST 스키마 캐시에 없는 컬럼. insert/update 시 제외한다. */
const KNOWN_MISSING_MATCH_COLUMNS = ['submitted_by_name'] as const;

function extractMissingColumn(error: { message?: string; code?: string } | null | undefined): string | null {
  if (!error) return null;
  const msg = String(error.message || '');
  const matched = msg.match(/Could not find the '([^']+)' column/i);
  if (matched?.[1]) return matched[1];
  if (error.code === 'PGRST204') {
    const quoted = msg.match(/'([^']+)'/);
    return quoted?.[1] || null;
  }
  return null;
}

function isUnknownColumnError(error: { message?: string; code?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === 'PGRST204') return true;
  const msg = String(error.message || '');
  return /Could not find the '.+' column/i.test(msg) || msg.includes('schema cache');
}

function omitKnownMissingColumns(payload: Record<string, unknown>): Record<string, unknown> {
  const next = { ...payload };
  for (const col of KNOWN_MISSING_MATCH_COLUMNS) {
    if (col in next) delete next[col];
  }
  return next;
}

/**
 * matches insert. `submitted_by_name` 등 스키마에 없는 컬럼은 빼고,
 * 그래도 unknown-column 에러가 나면 해당 필드를 제거한 뒤 재시도한다.
 */
export async function insertMatchIgnoringUnknownColumns(payload: Record<string, unknown>) {
  let next = omitKnownMissingColumns(payload);

  for (let attempt = 0; attempt < 6; attempt++) {
    const { data, error } = await supabase.from('matches').insert(next).select().single();
    if (!error) return { data, error: null };

    if (!isUnknownColumnError(error)) return { data: null, error };

    const missing = extractMissingColumn(error);
    if (missing && missing in next) {
      const { [missing]: _dropped, ...rest } = next;
      next = rest;
      continue;
    }
    return { data: null, error };
  }

  return { data: null, error: { message: '기록 등록에 실패했습니다.' } };
}

/**
 * matches update. 스키마에 없는 컬럼은 빼고, unknown-column 이면 재시도한다.
 */
export async function updateMatchIgnoringUnknownColumns(matchId: string, payload: Record<string, unknown>) {
  let next = omitKnownMissingColumns(payload);

  for (let attempt = 0; attempt < 6; attempt++) {
    const { data, error } = await supabase.from('matches').update(next).eq('id', matchId).select().maybeSingle();
    if (!error) return { data, error: null };

    if (!isUnknownColumnError(error)) return { data: null, error };

    const missing = extractMissingColumn(error);
    if (missing && missing in next) {
      const { [missing]: _dropped, ...rest } = next;
      next = rest;
      continue;
    }
    return { data: null, error };
  }

  return { data: null, error: { message: '기록 저장에 실패했습니다.' } };
}
