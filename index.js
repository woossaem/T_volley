try {
  const { Platform } = require('react-native');
  if (Platform.OS !== 'web') {
    const TrackPlayer = require('react-native-track-player').default;
    TrackPlayer.registerPlaybackService(() => require('./lib/headsetPlaybackService'));
  }
} catch (e) {
  console.warn('[Headset] registerPlaybackService skip', e);
}

require('expo-router/entry');
