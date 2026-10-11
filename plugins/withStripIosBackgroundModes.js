const { withInfoPlist } = require('expo/config-plugins');

const BLOCKED_BACKGROUND_MODES = new Set(['audio', 'bluetooth-central', 'bluetooth-peripheral']);

/**
 * Guideline 2.5.4: 플러그인이 UIBackgroundModes 에 audio/bluetooth 를
 * 다시 넣더라도 최종 Info.plist 에서 제거한다.
 */
function withStripIosBackgroundModes(config) {
  return withInfoPlist(config, (modConfig) => {
    const modes = modConfig.modResults.UIBackgroundModes;
    if (!Array.isArray(modes)) return modConfig;

    const next = modes.filter((mode) => !BLOCKED_BACKGROUND_MODES.has(mode));
    if (next.length === 0) {
      delete modConfig.modResults.UIBackgroundModes;
    } else {
      modConfig.modResults.UIBackgroundModes = next;
    }
    return modConfig;
  });
}

module.exports = withStripIosBackgroundModes;
