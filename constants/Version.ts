import { getCurrentSeasonInfo } from '../lib/season';

/**
 * 패치노트 최신 버전. app.json(스토어 빌드)과 분리되어 있어
 * Expo 소프트 업데이트만으로 스플래시·홈·로그인 표기가 함께 바뀝니다.
 */
export const RELEASE_VERSION = '2.2.0';

export function getAppVersionLabel(withSeason = false): string {
  const base = `v${RELEASE_VERSION}`;
  if (!withSeason) return base;
  const season = getCurrentSeasonInfo();
  return `${base} (${season.year} ${season.seasonCode})`;
}

export const APP_VERSION = getAppVersionLabel(false);
export const APP_VERSION_FULL = getAppVersionLabel(true);
