import { getCurrentSeasonInfo } from '../lib/season';

/**
 * 패치노트·스플래시 표기. 스토어 빌드의 사용자 노출 버전은 app.json `expo.version`과 맞춥니다.
 */
export const RELEASE_VERSION = '2.3.0';

export function getAppVersionLabel(withSeason = false): string {
  const base = `v${RELEASE_VERSION}`;
  if (!withSeason) return base;
  const season = getCurrentSeasonInfo();
  return `${base} (${season.year} ${season.seasonCode})`;
}

export const APP_VERSION = getAppVersionLabel(false);
export const APP_VERSION_FULL = getAppVersionLabel(true);
