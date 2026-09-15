import { supabase } from './supabase';
import { generateShortCode } from './utils';

/** PostgREST 스키마 캐시에 없는 컬럼. insert/update 시 제외한다. */
const KNOWN_MISSING_MATCH_COLUMNS = ['submitted_by_name'] as const;

export function extractMissingColumn(error: { message?: string; code?: string } | null | undefined): string | null {
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

export function isUnknownColumnError(error: { message?: string; code?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === 'PGRST204') return true;
  const msg = String(error.message || '');
  return /Could not find the '.+' column/i.test(msg) || msg.includes('schema cache');
}

export function omitKnownMissingMatchColumns<T extends Record<string, unknown>>(payload: T): Record<string, unknown> {
  const next: Record<string, unknown> = { ...payload };
  for (const col of KNOWN_MISSING_MATCH_COLUMNS) {
    if (col in next) delete next[col];
  }
  return next;
}

async function writeMatchIgnoringUnknownColumns(
  payload: Record<string, unknown>,
  exec: (row: Record<string, unknown>) => Promise<{ data: any; error: any }>,
) {
  let next = omitKnownMissingMatchColumns(payload);

  for (let attempt = 0; attempt < 8; attempt++) {
    const { data, error } = await exec(next);
    if (!error) return { data, error: null };

    if (!isUnknownColumnError(error)) {
      return { data: null, error };
    }

    const missing = extractMissingColumn(error);
    if (missing && missing in next) {
      const { [missing]: _dropped, ...rest } = next;
      next = rest;
      continue;
    }

    if ('submitted_by_name' in next) {
      const { submitted_by_name: _dropped, ...rest } = next;
      next = rest;
      continue;
    }

    return { data: null, error };
  }

  return { data: null, error: { message: '기록 저장에 실패했습니다.' } };
}

/**
 * matches insert. submitted_by_name 은 보내지 않는다.
 * select 가 RLS 로 실패해도 insert 자체만 성공하면 등록 완료로 본다.
 */
export async function insertMatchIgnoringUnknownColumns(payload: Record<string, unknown>) {
  const withShortCode = payload.short_code ? payload : { ...payload, short_code: generateShortCode() };
  const result = await writeMatchIgnoringUnknownColumns(withShortCode, async (row) => {
    const inserted = await supabase.from('matches').insert(row).select().maybeSingle();
    if (!inserted.error) return { data: inserted.data || row, error: null };

    if (isUnknownColumnError(inserted.error)) return { data: null, error: inserted.error };

    const fallback = await supabase.from('matches').insert(row);
    if (!fallback.error) return { data: row, error: null };
    return { data: null, error: fallback.error };
  });

  return result;
}

export async function updateMatchIgnoringUnknownColumns(matchId: string, payload: Record<string, unknown>) {
  const result = await writeMatchIgnoringUnknownColumns(payload, async (row) => {
    const updated = await supabase.from('matches').update(row).eq('id', matchId).select().maybeSingle();
    if (!updated.error) return { data: updated.data || row, error: null };

    if (isUnknownColumnError(updated.error)) return { data: null, error: updated.error };

    const fallback = await supabase.from('matches').update(row).eq('id', matchId);
    if (!fallback.error) return { data: row, error: null };
    return { data: null, error: fallback.error };
  });

  return result;
}
