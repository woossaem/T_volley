const { DeviceEventEmitter } = require('react-native');
const TrackPlayer = require('react-native-track-player').default;
const { Event } = require('react-native-track-player');

const HEADSET_EVENT = 'TVolleyHeadsetPlayPause';

function emitPlayPause() {
  try {
    DeviceEventEmitter.emit(HEADSET_EVENT);
  } catch {}
  TrackPlayer.play().catch(() => {});
}

module.exports = async function headsetPlaybackService() {
  TrackPlayer.addEventListener(Event.RemotePlay, emitPlayPause);
  TrackPlayer.addEventListener(Event.RemotePause, emitPlayPause);
  if (Event.RemotePlayPause) {
    TrackPlayer.addEventListener(Event.RemotePlayPause, emitPlayPause);
  }
  TrackPlayer.addEventListener(Event.RemoteStop, emitPlayPause);
};
