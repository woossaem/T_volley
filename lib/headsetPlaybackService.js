const { DeviceEventEmitter } = require('react-native');
const TrackPlayer = require('react-native-track-player').default;
const { Event } = require('react-native-track-player');

const HEADSET_EVENT = 'TVolleyHeadsetPlayPause';

function emitPlayPause() {
  try {
    DeviceEventEmitter.emit(HEADSET_EVENT);
  } catch {}
}

module.exports = async function headsetPlaybackService() {
  const startListen = () => {
    emitPlayPause();
  };
  TrackPlayer.addEventListener(Event.RemotePlay, startListen);
  TrackPlayer.addEventListener(Event.RemotePause, startListen);
  if (Event.RemotePlayPause) {
    TrackPlayer.addEventListener(Event.RemotePlayPause, startListen);
  }
  if (Event.RemoteStop) {
    TrackPlayer.addEventListener(Event.RemoteStop, () => {});
  }
};
