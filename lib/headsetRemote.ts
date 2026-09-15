import { DeviceEventEmitter, Platform } from 'react-native';

export const HEADSET_PLAY_PAUSE_EVENT = 'TVolleyHeadsetPlayPause';

type Unsub = () => void;

async function loadTrackPlayer(): Promise<any | null> {
  if (Platform.OS === 'web') return null;
  try {
    return require('react-native-track-player');
  } catch (e) {
    console.warn('[Headset] TrackPlayer skip', e);
    return null;
  }
}

export async function setupHeadsetRemote(onPlayPause: () => void): Promise<Unsub> {
  const mod = await loadTrackPlayer();
  const TrackPlayer = mod?.default ?? mod;
  if (!TrackPlayer?.setupPlayer) {
    const fallback = DeviceEventEmitter.addListener(HEADSET_PLAY_PAUSE_EVENT, onPlayPause);
    return () => fallback.remove();
  }
  const { Capability, RepeatMode, Event, AppKilledPlaybackBehavior } = mod;

  try {
    await TrackPlayer.setupPlayer({ autoHandleInterruptions: true });
  } catch (e) {
    const msg = String((e as Error)?.message || e);
    if (!msg.toLowerCase().includes('already')) {
      console.warn('[Headset] setupPlayer', e);
    }
  }

  try {
    await TrackPlayer.updateOptions({
      capabilities: [Capability.Play, Capability.Pause],
      compactCapabilities: [Capability.Play, Capability.Pause],
      notificationCapabilities: [Capability.Play, Capability.Pause],
      android: {
        appKilledPlaybackBehavior: AppKilledPlaybackBehavior?.ContinuePlayback
          ?? AppKilledPlaybackBehavior?.StopPlaybackAndRemoveNotification,
      },
    });
    await TrackPlayer.reset();
    await TrackPlayer.add({
      id: 'tvolley-headset',
      url: require('../assets/headset-silent.wav'),
      title: '티볼리 음성 기록',
      artist: '재생 버튼을 누르면 음성 대기',
    });
    if (RepeatMode?.Track != null) await TrackPlayer.setRepeatMode(RepeatMode.Track);
    await TrackPlayer.play();
  } catch (e) {
    console.warn('[Headset] session', e);
  }

  const handle = () => {
    try { onPlayPause(); } catch (err) {
      console.warn('[Headset] play/pause handler', err);
    }
    TrackPlayer.play().catch(() => {});
  };

  const subs = [
    TrackPlayer.addEventListener(Event.RemotePlay, handle),
    TrackPlayer.addEventListener(Event.RemotePause, handle),
    ...(Event.RemotePlayPause ? [TrackPlayer.addEventListener(Event.RemotePlayPause, handle)] : []),
    DeviceEventEmitter.addListener(HEADSET_PLAY_PAUSE_EVENT, handle),
  ];

  return () => {
    subs.forEach((sub) => {
      try { sub.remove(); } catch {}
    });
  };
}
