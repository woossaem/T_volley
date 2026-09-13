import { Alert } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { supabase } from './supabase';
import { generateShortCode } from './utils';

export const LIVE_SCOREBOARD_ORIGIN = 'https://t-volley-live.vercel.app';
export const LIVE_OG_DESCRIPTION = '로그인 없이 실시간 점수, 선발 명단, 문자 중계를 확인할 수 있습니다.';
export const LIVE_OG_IMAGE_URL = `${LIVE_SCOREBOARD_ORIGIN}/og-logo.png`;

export function liveOgTitle(hostName: string, awayName: string): string {
  return `티볼리 라이브 전광판 | ${hostName} vs ${awayName}`;
}

export function liveScoreboardUrl(slug: string): string {
  return `${LIVE_SCOREBOARD_ORIGIN}/live/${encodeURIComponent(slug)}`;
}

export async function ensureMatchShortCode(match: { id: string; short_code?: string | null }): Promise<string> {
  const existing = String(match.short_code || '').trim();
  if (existing) return existing;
  const code = generateShortCode();
  const { error } = await supabase.from('matches').update({ short_code: code }).eq('id', match.id);
  if (error) return match.id;
  return code;
}

export async function copyLiveScoreboardLink(match: { id: string; short_code?: string | null }): Promise<string> {
  const slug = await ensureMatchShortCode(match);
  await Clipboard.setStringAsync(liveScoreboardUrl(slug));
  Alert.alert('복사 완료', '라이브 전광판 링크가 복사되었습니다! 카톡에 공유해보세요.');
  return slug;
}
