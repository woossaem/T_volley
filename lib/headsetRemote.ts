import { DeviceEventEmitter, Platform } from 'react-native';

export const HEADSET_PLAY_PAUSE_EVENT = 'TVolleyHeadsetPlayPause';

type Unsub = () => void;

let playerRef: { play?: () => Promise<void>; reset?: () => Promise<void> } | null = null;
let headsetGeneration = 0;
let headsetOwner = -1;
let isSubscribed = false;
let headsetSub: { remove: () => void } | null = null;

/** TrackPlayer 직접 수신은 playback service 에 맡기고, 여기서는 그 신호만 받는다. */
function subscribeHeadsetButton(onPlayPause: () => void): Unsub {
  if (isSubscribed) return () => {};

  headsetSub = DeviceEventEmitter.addListener(HEADSET_PLAY_PAUSE_EVENT, async () => {
    console.log('[HeadsetRemote] 🎧 버튼 클릭 이벤트 수신 (DeviceEventEmitter)');
    try {
      onPlayPause();
    } catch (e) {
      console.error('[HeadsetRemote] 음성 인식 실행 실패:', e);
    }
  });

  isSubscribed = true;
  console.log('[HeadsetRemote] 미디어 버튼 이벤트 리스너 단일화 완료');

  return () => {
    try { headsetSub?.remove(); } catch {}
    headsetSub = null;
    isSubscribed = false;
  };
}

/** 스코어보드를 떠나면 상단 미디어 알림과 재생 세션을 끈다. */
export async function stopHeadsetSession(): Promise<void> {
  headsetGeneration += 1;
  headsetOwner = -1;
  const mod = await loadTrackPlayer();
  const TrackPlayer = mod?.default ?? mod;
  playerRef = null;
  if (!TrackPlayer) return;
  const { AppKilledPlaybackBehavior } = mod || {};
  try {
    await TrackPlayer.updateOptions?.({
      capabilities: [],
      notificationCapabilities: [],
      compactCapabilities: [],
      android: {
        appKilledPlaybackBehavior: AppKilledPlaybackBehavior?.StopPlaybackAndRemoveNotification,
      },
    });
  } catch {}
  try { await TrackPlayer.pause(); } catch {}
  try { await TrackPlayer.stop(); } catch {}
  try {
    if (typeof TrackPlayer.setActive === 'function') {
      await TrackPlayer.setActive(false);
    }
  } catch {}
  try { await TrackPlayer.reset(); } catch {}
}

/** 인식이 끝난 뒤 무음 트랙을 다시 틀어 이어폰 버튼이 계속 들어오게 한다. */
export function resumeHeadsetSession(): void {
  try {
    const pending = playerRef?.play?.();
    void Promise.resolve(pending).catch(() => {});
  } catch (e) {
    console.warn('[Headset] resume', e);
  }
}

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
  const generation = headsetGeneration;
  const mod = await loadTrackPlayer();
  if (generation !== headsetGeneration) return () => {};
  headsetOwner = generation;
  const TrackPlayer = mod?.default ?? mod;
  playerRef = TrackPlayer ?? null;
  if (!TrackPlayer?.setupPlayer) {
    return subscribeHeadsetButton(onPlayPause);
  }
  const { Capability, RepeatMode, AppKilledPlaybackBehavior } = mod;

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
        appKilledPlaybackBehavior: AppKilledPlaybackBehavior?.StopPlaybackAndRemoveNotification,
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
    if (generation !== headsetGeneration && headsetOwner !== generation) {
      return () => {};
    }
    if (generation !== headsetGeneration) {
      headsetOwner = -1;
      try { await TrackPlayer.reset(); } catch {}
      return () => {};
    }
  } catch (e) {
    console.warn('[Headset] session', e);
  }

  if (generation !== headsetGeneration) return () => {};

  // TrackPlayer 직접 이벤트 등록은 제거하고, DeviceEventEmitter 하나만 수신
  return subscribeHeadsetButton(onPlayPause);
}
