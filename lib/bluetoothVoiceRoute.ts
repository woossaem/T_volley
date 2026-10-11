import { PermissionsAndroid, Platform, ToastAndroid } from 'react-native';

export const HEADSET_BUTTON_HINT = '🎧 이어폰 버튼 신호 수신! 음성 인식 시작...';

export type BluetoothRouteStatus = {
  bluetooth: boolean;
  input: string;
  focus: boolean;
};

type NativeRoute = {
  prepare: () => Promise<{ bluetooth?: boolean; input?: string; focus?: boolean }>;
  speakInVoiceChannel?: (text: string) => Promise<void>;
  release: () => void;
  playStartCue?: () => void;
  playFailureCue?: () => void;
  requestAudioFocus?: () => boolean | { granted?: boolean };
  abandonAudioFocus?: () => void;
};

let playbackTicket = 0;

function loadNative(): NativeRoute | null {
  if (Platform.OS === 'web') return null;
  try {
    return require('expo-modules-core').requireNativeModule('BluetoothVoiceRoute') as NativeRoute;
  } catch (e) {
    console.warn('[Voice] BluetoothVoiceRoute 모듈이 없습니다. 개발 빌드를 다시 만들어야 합니다.', e);
    return null;
  }
}

export type AndroidVoicePermission = {
  microphone: boolean;
  bluetooth: boolean;
};

/** 음성 인식 직전 RECORD_AUDIO, BLUETOOTH_CONNECT 시스템 권한 팝업. */
export async function ensureAndroidVoicePermissions(): Promise<AndroidVoicePermission> {
  if (Platform.OS !== 'android') return { microphone: true, bluetooth: true };
  const record = PermissionsAndroid.PERMISSIONS.RECORD_AUDIO;
  const bluetooth = PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT;
  const askBluetooth = Number(Platform.Version) >= 31 && !!bluetooth;
  const needed: Array<typeof record> = [];
  if (record && !(await PermissionsAndroid.check(record))) needed.push(record);
  if (askBluetooth && bluetooth && !(await PermissionsAndroid.check(bluetooth))) needed.push(bluetooth);
  if (needed.length > 0) {
    await PermissionsAndroid.requestMultiple(needed);
  }
  return {
    microphone: !record || (await PermissionsAndroid.check(record)),
    bluetooth: !askBluetooth || !bluetooth || (await PermissionsAndroid.check(bluetooth)),
  };
}

/**
 * 복명복창 직전에 통화 모드와 SCO 를 연다.
 * 음성 인식 중에는 호출하지 않는다. SCO 는 SpeechRecognizer 를 막는다.
 */
export async function prepareBluetoothVoiceRoute(): Promise<BluetoothRouteStatus> {
  if (Platform.OS === 'web') return { bluetooth: false, input: 'web', focus: false };
  if (Platform.OS !== 'android') return { bluetooth: false, input: 'microphone', focus: true };
  try {
    await ensureAndroidVoicePermissions();
  } catch (e) {
    console.warn('[Voice] 마이크 권한 요청 실패', e);
  }
  const native = loadNative();
  try {
    const status = await native?.prepare();
    const connected = !!status?.bluetooth;
    console.log(`[Voice] Bluetooth SCO Connected: ${connected}`);
    return {
      bluetooth: connected,
      input: status?.input || (connected ? 'bluetooth' : 'microphone'),
      focus: !!status?.focus,
    };
  } catch (e) {
    console.warn('[Voice] SCO prepare', e);
    return { bluetooth: false, input: 'microphone', focus: false };
  }
}

/**
 * expo-speech 미디어 채널 대신 STREAM_VOICE_CALL 로 읽는다.
 * SCO 연결을 최대 1.5초 기다린 뒤 네이티브 TTS 가 끝날 때까지 대기한다.
 */
export function speakInVoiceChannel(text: string): Promise<void> {
  const spoken = String(text || '').trim();
  if (!spoken || Platform.OS !== 'android') return Promise.resolve();
  return speakInVoiceChannelOnce(spoken);
}

async function speakInVoiceChannelOnce(text: string): Promise<void> {
  const native = loadNative();
  if (!native?.speakInVoiceChannel) {
    throw new Error('BluetoothVoiceRoute.speakInVoiceChannel 이 없습니다. 개발 빌드를 다시 만들어야 합니다.');
  }
  const ticket = playbackTicket;
  try {
    const status = await native.prepare();
    console.log(`[Voice] Bluetooth SCO Connected: ${!!status?.bluetooth}`);
  } catch (e) {
    console.warn('[Voice] SCO prepare', e);
  }
  if (ticket !== playbackTicket) return;
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    await Promise.race([
      native.speakInVoiceChannel(text),
      new Promise<void>((_, reject) => {
        timer = setTimeout(() => reject(new Error('tts timeout')), 12000);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function focusGranted(raw: boolean | { granted?: boolean } | undefined): boolean {
  if (raw === true) return true;
  return !!raw && typeof raw === 'object' && raw.granted === true;
}

/** 통화 스트림의 짧은 독점 포커스를 요청한다. 실패해도 예외로 흐름을 끊지 않는다. */
export function requestScoreboardAudioFocus(): boolean {
  if (Platform.OS !== 'android') return true;
  const native = loadNative();
  try {
    const granted = focusGranted(native?.requestAudioFocus?.());
    console.log(`[Voice] Audio focus: ${granted}`);
    return granted;
  } catch (e) {
    console.warn('[Voice] 오디오 포커스 요청 실패', e);
    console.log('[Voice] Audio focus: false');
    return false;
  }
}

/** 화면을 떠날 때 오디오 포커스를 돌려준다. */
export function abandonScoreboardAudioFocus(): void {
  if (Platform.OS !== 'android') return;
  const native = loadNative();
  try {
    native?.abandonAudioFocus?.();
  } catch (e) {
    console.warn('[Voice] 오디오 포커스 해제 실패', e);
  }
}

export type VoiceTriggerHandlers = {
  onStatus?: (message: string | null) => void;
  onFinal: (text: string) => void | Promise<void | string | null>;
  onDenied?: (message: string) => void;
};

/**
 * 이어폰 버튼과 화면의 음성 버튼이 같이 쓰는 인식.
 * 듣는 동안에는 SCO 를 닫아 두고, 복명복창할 때만 통화 채널을 연다.
 */
export async function triggerVoiceRecognition(handlers: VoiceTriggerHandlers): Promise<() => void> {
  releaseBluetoothVoiceRoute();
  requestScoreboardAudioFocus();
  handlers.onStatus?.(HEADSET_BUTTON_HINT);
  if (Platform.OS === 'android') {
    ToastAndroid.show(HEADSET_BUTTON_HINT, ToastAndroid.SHORT);
  }
  await new Promise((resolve) => setTimeout(resolve, 80));
  playVoiceStartCue();
  const access = await ensureAndroidVoicePermissions();
  if (!access.microphone) {
    handlers.onStatus?.(null);
    handlers.onDenied?.('블루투스 이어폰 마이크 사용을 위해 권한을 허용해주세요');
    return () => {};
  }
  const { startListening } = require('./voiceListen') as typeof import('./voiceListen');
  return startListening(
    (text) => handlers.onFinal(text),
    () => {
      handlers.onStatus?.(null);
    },
    { listenMs: 6000 },
  );
}

/** 점수가 반영된 뒤 내는 짧은 성공음. */
export function playVoiceSuccessCue(): void {
  const native = loadNative();
  try {
    if (typeof native?.playStartCue === 'function') {
      native.playStartCue();
      return;
    }
    native?.playFailureCue?.();
  } catch (e) {
    console.warn('[Voice] 성공 효과음 재생 실패', e);
  }
}

/** 인식이 시작됐다는 짧은 비프. */
export function playVoiceStartCue(): void {
  const native = loadNative();
  try {
    if (typeof native?.playStartCue === 'function') {
      native.playStartCue();
      return;
    }
    native?.playFailureCue?.();
  } catch (e) {
    console.warn('[Voice] 시작 효과음 재생 실패', e);
  }
}

/** 인식 실패 안내 전에 짧은 효과음을 낸다. */
export function playVoiceFailureCue(): void {
  const native = loadNative();
  try {
    native?.playFailureCue?.();
  } catch (e) {
    console.warn('[Voice] 실패 효과음 재생 실패', e);
  }
}

/** 남아 있는 통화 모드만 풀고, 새로 SCO 를 열지는 않는다. */
export function stopBluetoothSco(): void {
  releaseBluetoothVoiceRoute();
}

/** 상단 '티볼리 음성 기록' 미디어 알림과 포그라운드 재생을 내린다. */
export async function stopForegroundService(): Promise<void> {
  const { stopHeadsetSession } = require('./headsetRemote') as typeof import('./headsetRemote');
  await stopHeadsetSession();
}

/** 통화 모드와 SCO 를 닫고 재생 중인 네이티브 TTS 를 멈춘다. */
export function releaseBluetoothVoiceRoute(): void {
  playbackTicket += 1;
  const native = loadNative();
  if (!native) return;
  try {
    native.release();
  } catch (e) {
    console.warn('[Voice] 블루투스 마이크 해제 실패', e);
  }
}
